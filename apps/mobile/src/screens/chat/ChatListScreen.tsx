/**
 * ChatListScreen — premium chat inbox.
 *
 * Used by both seekers and employers. Fetches /conversations, hydrates
 * the OTHER side per row, and renders compact cards: avatar, counterpart
 * name, last-message preview (or "—" if no messages yet), time badge,
 * unread count chip on the right.
 *
 * Verified counterparts get a champagne hairline ring on the avatar.
 * Empty state explains the unlock rule so seekers understand why their
 * inbox is empty before they're shortlisted.
 */

import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, SkeletonCard, Card, EmptyState as SharedEmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { chatApi } from '@/api/chat.api';
import { useAuth } from '@/hooks/useAuth';
import type { PublicConversation } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function ChatListScreen() {
  const { isAuthenticated, user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  const query = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.listMine(),
    enabled: isAuthenticated,
  });

  const conversations = query.data?.conversations ?? [];
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0),
    [conversations],
  );

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.text.tertiary}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            CHAT
          </Text>
          <Text variant="display" weight="medium" display>
            Conversations.
          </Text>
          <Text variant="footnote" tone="secondary">
            {conversations.length === 0
              ? user?.role === 'employer'
                ? 'Shortlist a candidate to start a conversation.'
                : 'Once an employer shortlists you, the chat opens here.'
              : totalUnread > 0
                ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
                : `${conversations.length} conversation${
                    conversations.length === 1 ? '' : 's'
                  }`}
          </Text>
        </View>

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
        ) : conversations.length === 0 ? (
          <EmptyState role={user?.role} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {conversations.map((c) => (
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
    </Screen>
  );
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
      <Card premium={counterpart?.isVerified}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
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
              <Text
                variant="footnote"
                tone="tertiary"
                style={{ marginLeft: spacing.xs }}
              >
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
                      color: '#FFFDF7',
                      fontSize: 11,
                      fontWeight: '600',
                    }}
                  >
                    {conversation.unread > 99 ? '99+' : conversation.unread}
                  </Text>
                </View>
              )}
            </View>
            {conversation.job?.title && (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                re: {conversation.job.title}
              </Text>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ role }: { role?: string }) {
  return (
    <SharedEmptyState
      glyph="✉"
      tone="hero"
      eyebrow="INBOX EMPTY"
      title="No chats yet"
      message={
        role === 'employer'
          ? 'Shortlist a candidate from the Applicants tab — a private chat opens automatically so you can talk before hiring.'
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
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
