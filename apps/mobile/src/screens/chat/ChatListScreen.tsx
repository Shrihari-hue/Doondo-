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
import { useTranslate } from '@/i18n/useTranslate';
import type { PublicConversation } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

type TabKey = 'all' | 'employers' | 'support';

export function ChatListScreen() {
  const { isAuthenticated, user } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
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
          {t('chat_list.title')}
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
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            return (
              <Pressable
                key={tabDef.key}
                onPress={() => {
                  haptic('selection');
                  setTab(tabDef.key);
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
                  {t(`chat_list.tabs.${tabDef.key}`)}
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
              {t('chat_list.error_title')}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ marginTop: spacing.xs }}>
              {t('chat_list.error_hint')}
            </Text>
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyTab t={t} tab={tab} role={user?.role} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                t={t}
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
        <Button label={t('chat_list.new_chat_btn')} onPress={newChat} />
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
  t,
  conversation,
  onPress,
}: {
  t: TFn;
  conversation: PublicConversation;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const counterpart = conversation.counterpart;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? t('chat_list.fallback_name');

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
              {timeShort(conversation.lastMessageAt, t)}
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
              {conversation.lastMessagePreview ?? t('chat_list.preview_empty')}
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

function EmptyTab({ t, tab, role }: { t: TFn; tab: TabKey; role?: string }) {
  if (tab === 'support') {
    return (
      <SharedEmptyState
        glyph="🛟"
        eyebrow={t('chat_list.empty_support_eyebrow')}
        title={t('chat_list.empty_support_title')}
        message={t('chat_list.empty_support_message')}
      />
    );
  }
  if (tab === 'employers') {
    return (
      <SharedEmptyState
        glyph="✉"
        eyebrow={t('chat_list.empty_employers_eyebrow')}
        title={t('chat_list.empty_employers_title')}
        message={
          role === 'employer'
            ? t('chat_list.empty_employers_message_employer')
            : t('chat_list.empty_employers_message_seeker')
        }
      />
    );
  }
  // 'all' tab
  return (
    <SharedEmptyState
      glyph="✉"
      tone="hero"
      eyebrow={t('chat_list.empty_all_eyebrow')}
      title={t('chat_list.empty_all_title')}
      message={
        role === 'employer'
          ? t('chat_list.empty_all_message_employer')
          : t('chat_list.empty_all_message_seeker')
      }
      tall
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeShort(iso: string, t: TFn): string {
  const d = new Date(iso);
  const now = Date.now();
  const ms = now - d.getTime();
  // Same-day → time of day (system formatting).
  const day = 86_400_000;
  if (ms < day && d.toDateString() === new Date(now).toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (ms < 2 * day) return t('chat_list.time_yesterday');
  const days = Math.floor(ms / day);
  if (days < 7) return t('chat_list.time_days_ago', { n: days });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
