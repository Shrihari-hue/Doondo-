/**
 * ChatListScreen — conversations inbox, blue seeker design.
 *
 * Layout matches the seeker Phase-2 mockup:
 *   - "Conversations" title
 *   - Segmented tabs: All / Employers / Support
 *   - List of conversation rows (avatar, name, last message, time, unread)
 *   - Sticky "+ New Chat" button at the bottom
 *
 * Used by both seekers and employers. The seeker view is wrapped in
 * SeekerThemeOverride; employers see the inherited dark palette since
 * the wrapper is only mounted in the seeker tab navigator (this same
 * file is also used in the EmployerTabNavigator — there the parent
 * dark theme applies).
 *
 * Tab filter logic:
 *   - All       → every conversation
 *   - Employers → conversations whose counterpart.role === 'employer'
 *   - Support   → reserved for future system/support threads. Empty for
 *                 now; backend will mark them with a "kind: 'support'"
 *                 flag once that flow ships.
 */

import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Avatar,
  SkeletonCard,
  Card,
  EmptyState as SharedEmptyState,
  Button,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { chatApi } from '@/api/chat.api';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import type { PublicConversation } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

type TabKey = 'all' | 'employers' | 'support';

export function ChatListScreen() {
  const { isAuthenticated, user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<TabKey>('all');

  const query = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.listMine(),
    enabled: isAuthenticated,
  });

  const all = query.data?.conversations ?? [];
  const filtered = useMemo(() => filterByTab(all, tab), [all, tab]);
  const isSeeker = user?.role !== 'employer';

  function newChat() {
    haptic('selection');
    if (isSeeker) {
      // Real new-chat flow: pick from applications.
      navigation.navigate('NewChat');
    } else {
      // Employers compose by picking from their applicants list (Phase 3).
      navigation.navigate('EmployerTabs', { screen: 'Applicants' } as never);
    }
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['7xl'] + 80, // room for sticky New Chat
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        <Text variant="display" weight="medium" display>
          Conversations
        </Text>

        {/* Segmented tabs */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.bg.surface,
            borderRadius: radii.lg,
            padding: 4,
            borderWidth: 0.5,
            borderColor: theme.border.default,
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  haptic('selection');
                  setTab(t.key);
                }}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  backgroundColor: active ? theme.bg.canvas : 'transparent',
                  // Soft inner shadow effect via border on inactive
                  borderWidth: active ? 0.5 : 0,
                  borderColor: theme.border.default,
                }}
              >
                <Text
                  variant="footnote"
                  weight={active ? 'medium' : 'regular'}
                  style={{
                    color: active ? theme.brand.hero : theme.text.secondary,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* List body */}
        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : query.isError ? (
          <Card>
            <Text variant="bodyLarge" weight="medium">
              Couldn't load chats.
            </Text>
            <Text variant="footnote" tone="secondary" style={{ marginTop: spacing.xs }}>
              Pull down to retry.
            </Text>
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyTab tab={tab} role={user?.role} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                onPress={() =>
                  navigation.navigate('Conversation', { conversationId: c.id })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky New Chat button */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
          backgroundColor: theme.bg.canvas,
          borderTopWidth: 0.5,
          borderTopColor: theme.border.default,
        }}
      >
        <Button label="+ New Chat" onPress={newChat} />
      </View>
    </Screen>
  );
}

// ─── Tabs metadata ───────────────────────────────────────────────────────────

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'employers', label: 'Employers' },
  { key: 'support', label: 'Support' },
];

function filterByTab(
  conversations: PublicConversation[],
  tab: TabKey,
): PublicConversation[] {
  switch (tab) {
    case 'all':
      return conversations;
    case 'employers':
      return conversations.filter((c) => c.counterpart?.role === 'employer');
    case 'support':
      // Reserved for system/support threads — empty until that flow exists.
      return conversations.filter(
        (c) => c.counterpart?.role === 'admin' || (c as { kind?: string }).kind === 'support',
      );
  }
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: PublicConversation;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const counterpart = conversation.counterpart;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? 'Conversation';

  const isUnread = conversation.unread > 0;

  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.sm,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Avatar
          name={displayName}
          photoUrl={counterpart?.photoUrl ?? null}
          size={52}
          premium={counterpart?.isVerified}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
            }}
          >
            <Text
              variant="bodyLarge"
              weight={isUnread ? 'medium' : 'regular'}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {displayName}
            </Text>
            <Text variant="footnote" tone="tertiary">
              {timeShort(conversation.lastMessageAt)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Text
              variant="footnote"
              tone={isUnread ? 'primary' : 'secondary'}
              weight={isUnread ? 'medium' : 'regular'}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {conversation.lastMessagePreview ?? 'Say hello.'}
            </Text>
            {isUnread && (
              <View
                style={{
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 8,
                  borderRadius: 11,
                  backgroundColor: theme.brand.hero,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 11,
                    fontWeight: '600',
                  }}
                >
                  {conversation.unread > 99 ? '99+' : conversation.unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Empty per-tab ───────────────────────────────────────────────────────────

function EmptyTab({ tab, role }: { tab: TabKey; role?: string }) {
  if (tab === 'support') {
    return (
      <SharedEmptyState
        glyph="🛟"
        eyebrow="SUPPORT"
        title="No support chats yet"
        message="Doondo Support threads will show up here. Reach out to support anytime if you need help."
      />
    );
  }
  if (tab === 'employers') {
    return (
      <SharedEmptyState
        glyph="✉"
        eyebrow="NO EMPLOYER CHATS"
        title="No employer chats yet"
        message={
          role === 'employer'
            ? 'Employer-to-employer messaging will land here when networking ships.'
            : 'Once an employer shortlists you for a job, the chat opens here.'
        }
      />
    );
  }
  // 'all' tab
  return (
    <SharedEmptyState
      glyph="✉"
      tone="hero"
      eyebrow="INBOX EMPTY"
      title="No chats yet"
      message={
        role === 'employer'
          ? 'Shortlist a candidate from the Applicants tab — a private chat opens automatically.'
          : 'When an employer shortlists you for a job, you can chat with them right here. Apply to nearby jobs to get started.'
      }
      tall
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeShort(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const ms = now - d.getTime();
  // Same-day → time of day.
  const day = 86_400_000;
  if (ms < day && d.toDateString() === new Date(now).toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (ms < 2 * day) return 'Yesterday';
  const days = Math.floor(ms / day);
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
