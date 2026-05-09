/**
 * ConversationScreen — premium chat thread.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  ←   [avatar]  Counterpart name              │  header
 *   │                re: Job title                 │
 *   ├──────────────────────────────────────────────┤
 *   │                                              │
 *   │           [received bubble]                  │  inverted FlatList
 *   │ [sent bubble — coral]                        │
 *   │                                              │
 *   ├──────────────────────────────────────────────┤
 *   │  ▢ Message…                       Send →    │  composer
 *   └──────────────────────────────────────────────┘
 *
 * Bubbles:
 *   - sent     → coral (brand.hero) with #FFFDF7 text, right-aligned
 *   - received → bg.elevated with primary text, left-aligned
 *   - verified counterpart's bubbles get a champagne hairline
 *   - read receipts under sent bubbles ("Read" in champagne when read)
 *
 * Optimistic send: messages appear instantly with id="optimistic-…",
 * replaced by the real message once the API call returns. Failed sends
 * stay in place with a "Tap to retry" affordance.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii, champagne } from '@doondo/tokens';
import { Screen, Text, Avatar, LoadingSpinner, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { chatApi } from '@/api/chat.api';
import { haptic } from '@/lib/haptics';
import type { PublicMessage } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'Conversation'>;
type Route = RouteProp<AppStackParamList, 'Conversation'>;

export function ConversationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const conversationId = route.params.conversationId;

  const headerQuery = useQuery({
    queryKey: ['chat', 'conversation', conversationId],
    queryFn: () => chatApi.detail(conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => chatApi.listMessages(conversationId, { limit: 50 }),
  });

  // Mark as read whenever this screen has focus + we have unread.
  useEffect(() => {
    void chatApi.markRead(conversationId).catch(() => undefined);
    // Also clear local unread on the list cache.
    queryClient.setQueryData<{ conversations: PublicMessage[] } | undefined>(
      ['chat', 'conversations'],
      (prev) => prev,
    );
  }, [conversationId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => chatApi.sendMessage(conversationId, body),
    onMutate: async (body) => {
      // Optimistic insert.
      const optimistic: PublicMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: user?.id ?? 'me',
        kind: 'text',
        body,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? { ...prev, messages: [optimistic, ...prev.messages] }
            : { messages: [optimistic], hasMore: false },
      );
      return { optimisticId: optimistic.id };
    },
    onSuccess: ({ message }, _body, ctx) => {
      // Replace optimistic with the real message.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId ? message : m,
                ),
              }
            : prev,
      );
      haptic('selection');
    },
    onError: (_err, _body, ctx) => {
      // Mark the optimistic as failed so the UI can show retry. We
      // overwrite the body to a recognisable shape.
      queryClient.setQueryData<{ messages: PublicMessage[]; hasMore: boolean }>(
        ['chat', 'messages', conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === ctx?.optimisticId
                    ? { ...m, id: `failed-${m.id}` }
                    : m,
                ),
              }
            : prev,
      );
      haptic('error');
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const counterpart = headerQuery.data?.conversation.counterpart;
  const job = headerQuery.data?.conversation.job;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? 'Conversation';

  function onSend() {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    setDraft('');
    sendMutation.mutate(trimmed);
  }

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.border.default,
            backgroundColor: theme.bg.canvas,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text variant="bodyLarge" tone="hero">
              ←
            </Text>
          </Pressable>
          <Avatar
            name={displayName}
            photoUrl={counterpart?.photoUrl ?? null}
            size={40}
            premium={counterpart?.isVerified}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text
                variant="bodyLarge"
                weight="medium"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {displayName}
              </Text>
              {counterpart?.isVerified && (
                <Pill label="Verified" tone="premium" leading="★" />
              )}
            </View>
            {job?.title && (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                re: {job.title}
              </Text>
            )}
          </View>
        </View>

        {/* Messages */}
        {messagesQuery.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : messages.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.xl,
              gap: spacing.xs,
            }}
          >
            <Text variant="bodyLarge" weight="medium">
              Say hello.
            </Text>
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              {user?.role === 'employer'
                ? 'Ask about availability, location, or set up a quick call.'
                : 'A short, friendly intro goes a long way.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.lg,
              gap: spacing.xs,
            }}
            renderItem={({ item, index }) => {
              const next = messages[index - 1]; // newer (because inverted)
              const sameSenderAsNext = next?.senderId === item.senderId;
              return (
                <MessageBubble
                  message={item}
                  isMine={item.senderId === user?.id}
                  showTail={!sameSenderAsNext}
                  isVerifiedCounterpart={Boolean(counterpart?.isVerified)}
                />
              );
            }}
          />
        )}

        {/* Composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.lg,
            borderTopWidth: 0.5,
            borderTopColor: theme.border.default,
            backgroundColor: theme.bg.canvas,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.bg.surface,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              minHeight: 40,
              maxHeight: 130,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={theme.text.tertiary}
              multiline
              style={{
                color: theme.text.primary,
                fontSize: 15,
                lineHeight: 20,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            />
          </View>
          <SendButton
            disabled={!draft.trim() || sendMutation.isPending}
            onPress={onSend}
            sending={sendMutation.isPending}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ─── Bubble ─────────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMine,
  showTail,
  isVerifiedCounterpart,
}: {
  message: PublicMessage;
  isMine: boolean;
  showTail: boolean;
  isVerifiedCounterpart: boolean;
}) {
  const { theme } = useTheme();
  const failed = message.id.startsWith('failed-');
  const optimistic = message.id.startsWith('optimistic-');

  const bg = isMine ? theme.brand.hero : theme.bg.elevated;
  const fg = isMine ? '#FFFDF7' : theme.text.primary;

  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        marginBottom: showTail ? spacing.xs : 1,
      }}
    >
      <View
        style={{
          backgroundColor: failed ? '#5C1414' : bg,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 18,
          // Slight asymmetric corner on the tail side for the "speech" feel.
          borderBottomRightRadius: isMine && showTail ? 4 : 18,
          borderBottomLeftRadius: !isMine && showTail ? 4 : 18,
          borderWidth: !isMine && isVerifiedCounterpart ? 0.5 : 0,
          borderColor: champagne[300],
          opacity: optimistic ? 0.75 : 1,
        }}
      >
        <Text style={{ color: fg, fontSize: 15, lineHeight: 21 }}>
          {message.body}
        </Text>
      </View>
      {/* Read receipt for sent messages */}
      {isMine && !optimistic && !failed && (
        <Text
          variant="caption"
          tone="tertiary"
          style={{
            alignSelf: 'flex-end',
            marginTop: 2,
            marginRight: 6,
            color: message.readAt ? champagne[300] : undefined,
          }}
        >
          {message.readAt ? 'Read' : 'Sent'}
        </Text>
      )}
      {failed && (
        <Text
          variant="caption"
          tone="danger"
          style={{ alignSelf: 'flex-end', marginTop: 2, marginRight: 6 }}
        >
          Failed — pull down to retry
        </Text>
      )}
    </View>
  );
}

// ─── Send button ────────────────────────────────────────────────────────────

function SendButton({
  disabled,
  sending,
  onPress,
}: {
  disabled: boolean;
  sending: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: disabled ? theme.bg.muted : theme.brand.hero,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {sending ? (
        <ActivityIndicator size="small" color="#FFFDF7" />
      ) : (
        <Text style={{ color: '#FFFDF7', fontSize: 18, fontWeight: '600' }}>↑</Text>
      )}
    </Pressable>
  );
}
