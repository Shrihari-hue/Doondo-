/**
 * ChatListScreen — conversations inbox, Doondo blue design.
 *
 * Layout:
 *   - "Conversations" title
 *   - Segmented tabs: All / Employers / Support
 *   - List of conversation rows (avatar, name, last message, time, unread)
 *   - Sticky "+ New Chat" button at the bottom
 *
 * Used by both seekers and employers. Restyled to the shared Doondo design
 * language (see EmployerHomeScreen.tsx / PostsScreen.tsx) — local BLUE/
 * ORANGE/RED consts + isLight from useTheme(), rather than the legacy
 * per-role theme tokens, so the chat surface reads identically for both
 * seekers and employers.
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
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Avatar,
  SkeletonCard,
  AnimatedPressable,
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

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here
const RED = '#EF4444';

export function ChatListScreen() {
  const { isAuthenticated, user } = useAuth();
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const [tab, setTab] = useState<TabKey>('all');

  const bg = theme.bg.canvas;
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textPrimary = theme.text.primary;
  const textSecondary = theme.text.secondary;

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
      <View style={{ flex: 1, backgroundColor: bg }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['7xl'] + 80, // room for sticky New Chat
            gap: spacing.lg,
          }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={BLUE}
            />
          }
        >
          <Text style={{ fontSize: 24, fontWeight: '800', color: textPrimary }}>
            {t('chat_list.title')}
          </Text>

          {/* Segmented tabs */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: theme.bg.muted,
              borderRadius: radii.lg,
              padding: 4,
              borderWidth: 1,
              borderColor: cardBorder,
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
                    backgroundColor: active ? cardBg : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: cardBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: active ? '700' : '500',
                      color: active ? BLUE : textSecondary,
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
            <View
              style={{
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: radii.lg,
                padding: spacing.lg,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
                {t('chat_list.error_title')}
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, marginTop: spacing.xs }}>
                {t('chat_list.error_hint')}
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <EmptyTab
              t={t}
              tab={tab}
              role={user?.role}
              isLight={isLight}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
          ) : (
            <View style={{ gap: spacing.xs }}>
              {filtered.map((c) => (
                <ConversationRow
                  key={c.id}
                  t={t}
                  conversation={c}
                  cardBorder={theme.bg.muted}
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
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
            backgroundColor: bg,
            borderTopWidth: 1,
            borderTopColor: cardBorder,
          }}
        >
          <Pressable
            onPress={newChat}
            style={({ pressed }) => ({
              backgroundColor: BLUE,
              borderRadius: radii.lg,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Feather name="edit" size={16} color={theme.text.onBrand} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>
              {t('chat_list.new_chat_btn')}
            </Text>
          </Pressable>
        </View>
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
  cardBorder,
  textPrimary,
  textSecondary,
  onPress,
}: {
  t: TFn;
  conversation: PublicConversation;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const counterpart = conversation.counterpart;
  const displayName =
    counterpart?.companyName ?? counterpart?.name ?? t('chat_list.fallback_name');

  const isUnread = conversation.unread > 0;

  return (
    <AnimatedPressable onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: cardBorder,
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
              style={{
                fontSize: 15,
                fontWeight: isUnread ? '700' : '600',
                color: textPrimary,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text style={{ fontSize: 12, color: textSecondary }}>
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
              style={{
                fontSize: 13,
                color: isUnread ? textPrimary : textSecondary,
                fontWeight: isUnread ? '600' : '400',
                flex: 1,
              }}
              numberOfLines={1}
            >
              {conversation.lastMessagePreview ?? t('chat_list.preview_empty')}
            </Text>
            {isUnread && (
              <View
                style={{
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 7,
                  borderRadius: 11,
                  backgroundColor: RED,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: theme.text.onBrand,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {conversation.unread > 99 ? '99+' : conversation.unread}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ─── Empty per-tab ───────────────────────────────────────────────────────────
// Blue-tinted circular icon badge + eyebrow + bold title + gray message,
// matching PostsScreen's PostJobEmptyState reference pattern.

function EmptyTab({
  t,
  tab,
  role,
  isLight,
  textPrimary,
  textSecondary,
}: {
  t: TFn;
  tab: TabKey;
  role?: string;
  isLight: boolean;
  textPrimary: string;
  textSecondary: string;
}) {
  if (tab === 'support') {
    return (
      <ChatEmptyBlock
        icon="check-circle"
        eyebrow={t('chat_list.empty_support_eyebrow')}
        title={t('chat_list.empty_support_title')}
        message={t('chat_list.empty_support_message')}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      />
    );
  }
  if (tab === 'employers') {
    return (
      <ChatEmptyBlock
        icon="briefcase"
        eyebrow={t('chat_list.empty_employers_eyebrow')}
        title={t('chat_list.empty_employers_title')}
        message={
          role === 'employer'
            ? t('chat_list.empty_employers_message_employer')
            : t('chat_list.empty_employers_message_seeker')
        }
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      />
    );
  }
  // 'all' tab
  return (
    <ChatEmptyBlock
      icon="message-circle"
      eyebrow={t('chat_list.empty_all_eyebrow')}
      title={t('chat_list.empty_all_title')}
      message={
        role === 'employer'
          ? t('chat_list.empty_all_message_employer')
          : t('chat_list.empty_all_message_seeker')
      }
      tall
      textPrimary={textPrimary}
      textSecondary={textSecondary}
    />
  );
}

function ChatEmptyBlock({
  icon,
  eyebrow,
  title,
  message,
  tall,
  textPrimary,
  textSecondary,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  eyebrow: string;
  title: string;
  message: string;
  tall?: boolean;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View
      style={{
        flex: tall ? 1 : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing.xl,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: BLUE + '33',
          backgroundColor: BLUE + '0D',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
        }}
      >
        <Feather name={icon} size={26} color={BLUE} />
      </View>

      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: BLUE, textAlign: 'center' }}>
        {eyebrow.toUpperCase()}
      </Text>

      <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary, textAlign: 'center' }}>
        {title}
      </Text>

      <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center', maxWidth: 280 }}>
        {message}
      </Text>
    </View>
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
