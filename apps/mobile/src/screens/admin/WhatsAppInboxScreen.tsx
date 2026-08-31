/**
 * WhatsAppInboxScreen — admin-only.
 *
 * Two views in one screen:
 *   1. Thread list — every unique peer the Doondo WhatsApp number has
 *      exchanged messages with, newest first. Unread inbound threads are
 *      highlighted as "Awaiting reply".
 *   2. Thread detail — full message history with the peer + a composer
 *      to send a freeform text reply. The composer warns when the last
 *      inbound was more than 24h ago (outside the WhatsApp service
 *      window — only templates can be sent in that case).
 *
 * Backed by the /api/v1/whatsapp endpoints. The backend enforces
 * requireRole('admin'); the screen additionally hides itself if the
 * current user isn't an admin, so a non-admin who lands here via deep
 * link gets a friendly redirect instead of a 403.
 */

import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Card,
  LoadingSpinner,
  EmptyState,
  ErrorPanel,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/api/errors';
import {
  whatsappApi,
  groupIntoThreads,
  type Thread,
  type WhatsAppMessage,
} from '@/api/whatsapp.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const WA_24H_MS = 24 * 60 * 60 * 1000;

function WhatsAppInboxInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Which thread (peer phone) is open. null = list view.
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['whatsapp', 'inbox', 'all'],
    queryFn: () => whatsappApi.list({ limit: 100 }),
    // Poll every 10s while open so admin sees inbound replies without
    // pulling. Stale-while-revalidate keeps the list snappy.
    refetchInterval: 10_000,
    staleTime: 5_000,
    enabled: user?.role === 'admin',
  });

  // We don't know the Doondo sender's address from the API directly, but
  // every outbound message has the same `from`. Pick the most-recent
  // outbound to determine "our side".
  const doondoNumber = useMemo<string | null>(() => {
    const msgs = messagesQuery.data?.messages ?? [];
    const out = msgs.find((m) => m.direction === 'outbound');
    return out?.from ?? null;
  }, [messagesQuery.data]);

  const threads = useMemo<Thread[]>(
    () => groupIntoThreads(messagesQuery.data?.messages ?? [], doondoNumber),
    [messagesQuery.data, doondoNumber],
  );

  const activeThread = useMemo<Thread | null>(
    () => threads.find((t) => t.peer === activePeer) ?? null,
    [threads, activePeer],
  );

  const sendMutation = useMutation({
    mutationFn: (args: { to: string; body: string }) => whatsappApi.sendText(args),
    onSuccess: async () => {
      setComposer('');
      setSendError(null);
      haptic('light');
      await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'inbox', 'all'] });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Could not send. Check the 24-hour window or use a template.';
      setSendError(msg);
      haptic('warning');
    },
  });

  // ─── Admin gate ────────────────────────────────────────────────────────
  if (user && user.role !== 'admin') {
    return (
      <Screen>
        <View
          style={{
            flex: 1,
            paddingHorizontal: spacing.xl,
            paddingTop: spacing['2xl'],
            gap: spacing.md,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text variant="body" tone="secondary">
              ← Back
            </Text>
          </Pressable>
          <EmptyState
            title="Admin only"
            message="This screen is for Doondo support staff."
          />
        </View>
      </Screen>
    );
  }

  // ─── Thread detail view ───────────────────────────────────────────────
  if (activeThread) {
    const lastInbound = [...activeThread.messages]
      .reverse()
      .find((m) => m.direction === 'inbound');
    const lastInboundAgeMs = lastInbound
      ? Date.now() - new Date(lastInbound.createdAt).getTime()
      : Infinity;
    const insideWindow = lastInboundAgeMs < WA_24H_MS;

    function onSend() {
      const body = composer.trim();
      if (!body || !activeThread) return;
      sendMutation.mutate({ to: activeThread.peer, body });
    }

    return (
      <Screen edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.lg,
              paddingBottom: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.border.subtle,
              gap: spacing.sm,
            }}
          >
            <Pressable
              onPress={() => {
                setActivePeer(null);
                setComposer('');
                setSendError(null);
              }}
              hitSlop={12}
            >
              <Text variant="body" tone="secondary">
                ← All threads
              </Text>
            </Pressable>
            <Text variant="title" weight="medium">
              {activeThread.peerPhone}
            </Text>
            <Text variant="caption" tone="tertiary">
              {activeThread.messages.length} message
              {activeThread.messages.length === 1 ? '' : 's'} ·{' '}
              {insideWindow ? '24-hour window OPEN' : '24-hour window CLOSED'}
            </Text>
          </View>

          {/* Messages */}
          <FlatList
            inverted
            data={[...activeThread.messages].reverse()}
            keyExtractor={(m) => m.sid}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.lg,
              paddingBottom: spacing.md,
              gap: spacing.sm,
            }}
            renderItem={({ item }) => (
              <MessageBubble message={item} doondoNumber={doondoNumber} />
            )}
          />

          {/* Composer */}
          <View
            style={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.md,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              borderTopWidth: 1,
              borderTopColor: theme.border.subtle,
              gap: spacing.sm,
            }}
          >
            {!insideWindow && (
              <View
                style={{
                  padding: spacing.sm,
                  borderRadius: radii.md,
                  backgroundColor: theme.bg.muted,
                }}
              >
                <Text variant="caption" tone="secondary">
                  Outside the 24-hour reply window. Freeform messages will
                  fail — use an approved template via the API instead.
                </Text>
              </View>
            )}
            {sendError && (
              <Text variant="caption" style={{ color: theme.status.danger }}>
                {sendError}
              </Text>
            )}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: spacing.sm,
              }}
            >
              <TextInput
                value={composer}
                onChangeText={setComposer}
                placeholder="Type a reply…"
                placeholderTextColor={theme.text.tertiary}
                multiline
                style={{
                  flex: 1,
                  minHeight: 44,
                  maxHeight: 120,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: theme.border.subtle,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  color: theme.text.primary,
                  backgroundColor: theme.bg.surface,
                }}
              />
              <Pressable
                onPress={onSend}
                disabled={sendMutation.isPending || composer.trim().length === 0}
                style={{
                  paddingHorizontal: spacing.lg,
                  height: 44,
                  justifyContent: 'center',
                  borderRadius: radii.md,
                  backgroundColor:
                    composer.trim().length === 0
                      ? theme.bg.muted
                      : theme.brand.accent,
                  opacity: sendMutation.isPending ? 0.6 : 1,
                }}
              >
                <Text
                  variant="body"
                  weight="medium"
                  style={{
                    color:
                      composer.trim().length === 0
                        ? theme.text.tertiary
                        : theme.text.onBrand,
                  }}
                >
                  {sendMutation.isPending ? '…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // ─── Thread list view ─────────────────────────────────────────────────
  return (
    <Screen>
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            ← Back
          </Text>
        </Pressable>
        <Text variant="display" weight="medium" display>
          WhatsApp Inbox
        </Text>
        <Text variant="footnote" tone="secondary">
          Two-way support chat. Tap a thread to read and reply.
        </Text>
      </View>

      {messagesQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : messagesQuery.isError ? (
        <ErrorPanel
          error={null}
          onRetry={() => void messagesQuery.refetch()}
          title="Couldn't load WhatsApp inbox"
        />
      ) : threads.length === 0 ? (
        <EmptyState
          title="No messages yet"
          message="When a user messages your Doondo WhatsApp number, threads will appear here."
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['4xl'],
            gap: spacing.sm,
          }}
          data={threads}
          keyExtractor={(t) => t.peer}
          refreshControl={
            <RefreshControl
              refreshing={messagesQuery.isRefetching}
              onRefresh={() => void messagesQuery.refetch()}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                haptic('selection');
                setActivePeer(item.peer);
              }}
            >
              <Card>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {item.awaitingReply && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.brand.accent,
                        marginTop: 6,
                      }}
                    />
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text variant="bodyLarge" weight="medium">
                        {item.peerPhone}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {formatRelative(item.lastAt)}
                      </Text>
                    </View>
                    <Text variant="footnote" tone="secondary" numberOfLines={2}>
                      {previewBody(item.messages[item.messages.length - 1]!)}
                    </Text>
                    {item.awaitingReply && (
                      <Text
                        variant="caption"
                        weight="medium"
                        style={{ color: theme.brand.accent }}
                      >
                        Awaiting reply
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

// ─── Message bubble (in thread detail) ───────────────────────────────────

function MessageBubble({
  message,
  doondoNumber,
}: {
  message: WhatsAppMessage;
  doondoNumber: string | null;
}) {
  const { theme } = useTheme();
  // Outbound = we sent it, align right. Inbound = user, align left.
  // Fall back to `direction` if doondoNumber isn't known yet.
  const isOutbound = doondoNumber
    ? message.from === doondoNumber
    : message.direction === 'outbound';

  return (
    <View
      style={{
        alignSelf: isOutbound ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: isOutbound ? theme.brand.primary : theme.bg.muted,
        borderRadius: radii.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: 4,
      }}
    >
      <Text
        variant="body"
        style={{ color: isOutbound ? theme.text.onBrand : theme.text.primary }}
      >
        {message.body || (message.mediaUrls?.length ? '[media]' : '[empty]')}
      </Text>
      <Text
        variant="caption"
        style={{
          color: isOutbound ? theme.text.onBrand : theme.text.tertiary,
          opacity: 0.75,
        }}
      >
        {formatRelative(message.createdAt)}
        {isOutbound && message.status ? ` · ${message.status}` : ''}
      </Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function previewBody(m: WhatsAppMessage): string {
  if (m.body) {
    const prefix = m.direction === 'outbound' ? 'You: ' : '';
    return `${prefix}${m.body}`;
  }
  if (m.mediaUrls?.length) return '[media]';
  return '[empty]';
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function WhatsAppInboxScreen() {
  return <WhatsAppInboxInner />;
}
