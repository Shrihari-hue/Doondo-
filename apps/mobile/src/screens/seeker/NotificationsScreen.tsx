/**
 * NotificationsScreen — the bell icon's destination.
 *
 * Lists in-app notifications, marks-read on tap, supports "mark all read".
 * Reads from real /notifications endpoint — empty state when there are none.
 */

import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Card, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useNotifications';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { PublicNotification } from '@/api/notifications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function NotificationsScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  const { data, isLoading, isError, refetch, isRefetching } = useNotifications(50);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  function onItemPress(n: PublicNotification) {
    haptic('light');
    if (!n.read) markRead.mutate(n.id);
    routeNotification(n);
  }

  /**
   * Resolves the in-app navigation for a notification. We don't trust the
   * backend's `deeplink.screen` string blindly — instead we look at the
   * notification `kind` and pick a real screen + params we know exist in
   * the mobile navigator. This guarantees deep links never crash when the
   * backend adds a new kind the mobile doesn't yet handle.
   */
  function routeNotification(n: PublicNotification) {
    const params = (n.deeplink?.params ?? {}) as Record<string, unknown>;
    switch (n.kind) {
      case 'application_status':
        // Open the My Applications timeline. Jumping straight to a specific
        // application's detail screen lands when we build that view.
        navigation.navigate('MyApplications');
        return;
      case 'application_received':
        // Employers tap this — open the applicants tab. Seekers shouldn't
        // see this kind, but we fall through safely if they do.
        navigation.navigate('EmployerTabs', { screen: 'Applicants' } as never);
        return;
      case 'interview_scheduled':
      case 'interview_rescheduled':
      case 'interview_cancelled':
        navigation.navigate('MyApplications');
        return;
      case 'new_message': {
        const conversationId = params.conversationId;
        if (typeof conversationId === 'string') {
          navigation.navigate('Conversation', { conversationId });
        } else {
          navigation.navigate('SeekerTabs', { screen: 'Chat' } as never);
        }
        return;
      }
      case 'rating_received':
        navigation.navigate('Ratings');
        return;
      case 'verification_status':
        navigation.navigate('Verification');
        return;
      case 'system':
      default:
        // Nothing actionable — just mark as read (already done above).
        return;
    }
  }

  function onMarkAllRead() {
    haptic('selection');
    markAllRead.mutate();
  }

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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="display" weight="medium" display>
            Notifications
          </Text>
          {data && data.notifications.some((n) => !n.read) && (
            <Pressable onPress={onMarkAllRead} hitSlop={6}>
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                Mark all read
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : isError ? (
        <EmptyState
          title="Couldn't load notifications"
          message="Check your connection and try again."
          cta={{ label: 'Retry', onPress: () => void refetch() }}
        />
      ) : !data || data.notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          message="When you have applications, messages, or ratings, they'll show up here."
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['4xl'],
            gap: spacing.sm,
          }}
          data={data.notifications}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => onItemPress(item)}>
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: spacing.md,
                    opacity: item.read ? 0.55 : 1,
                  }}
                >
                  {!item.read && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.brand.hero,
                        marginTop: 6,
                      }}
                    />
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text variant="footnote" tone="secondary" numberOfLines={3}>
                      {item.body}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {formatRelative(item.createdAt)}
                    </Text>
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function NotificationsScreen() {
  return (
    <SeekerThemeOverride>
      <NotificationsScreenInner />
    </SeekerThemeOverride>
  );
}
