/**
 * QuickWorkHistoryScreen — gap #5. One shared screen for both roles:
 * an employer sees the requests they posted, a worker sees the jobs
 * they've been matched to (`quickWorkApi.listMine({ role })`, already
 * existed — this screen was the missing UI on top of it).
 *
 * Active / Completed / Cancelled / Disputed tabs, newest first. Tapping a
 * row reuses the existing detail screens — QuickWorkDetail for the
 * employer, QuickWorkJob for the worker — no second detail view.
 */

import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Pill, EmptyState, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { quickWorkApi, type QuickWorkRequest, type QuickWorkStatus } from '@/api/quickWork.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

type Tab = 'active' | 'completed' | 'cancelled' | 'disputed';

const ACTIVE_STATUSES: QuickWorkStatus[] = [
  'draft', 'posted', 'matching', 'offered', 'accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'payment_pending',
];
const COMPLETED_STATUSES: QuickWorkStatus[] = ['paid', 'rated'];
const CANCELLED_STATUSES: QuickWorkStatus[] = ['cancelled', 'expired', 'no_worker_found'];
const DISPUTED_STATUSES: QuickWorkStatus[] = ['disputed'];

const TABS: { key: Tab; label: string; statuses: QuickWorkStatus[] }[] = [
  { key: 'active', label: 'Active', statuses: ACTIVE_STATUSES },
  { key: 'completed', label: 'Completed', statuses: COMPLETED_STATUSES },
  { key: 'cancelled', label: 'Cancelled', statuses: CANCELLED_STATUSES },
  { key: 'disputed', label: 'Disputed', statuses: DISPUTED_STATUSES },
];

const STATUS_LABEL: Record<QuickWorkStatus, string> = {
  draft: 'Draft', posted: 'Posted', matching: 'Matching', offered: 'Offered',
  accepted: 'Accepted', arriving: 'Arriving', arrived: 'Arrived', in_progress: 'In progress',
  completed: 'Completed', payment_pending: 'Payment pending', paid: 'Paid', rated: 'Rated',
  cancelled: 'Cancelled', expired: 'Expired', no_worker_found: 'No worker found', disputed: 'Disputed',
};

const STATUS_TONE: Record<QuickWorkStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral', posted: 'info', matching: 'info', offered: 'info', accepted: 'success', arriving: 'success',
  arrived: 'success', in_progress: 'success', completed: 'success', payment_pending: 'warning', paid: 'success',
  rated: 'success', cancelled: 'neutral', expired: 'warning', no_worker_found: 'warning', disputed: 'danger',
};

export function QuickWorkHistoryScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isWorker = user?.role === 'seeker';
  const [tab, setTab] = useState<Tab>('active');

  const query = useQuery({
    queryKey: ['quick-work', 'requests', 'mine', isWorker ? 'worker' : 'employer'],
    queryFn: () => quickWorkApi.listMine({ role: isWorker ? 'worker' : 'employer' }),
    staleTime: 15_000,
  });

  const requests = query.data ?? [];
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { active: 0, completed: 0, cancelled: 0, disputed: 0 };
    for (const r of requests) {
      for (const t of TABS) {
        if (t.statuses.includes(r.status)) c[t.key]++;
      }
    }
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    const statuses = TABS.find((t) => t.key === tab)!.statuses;
    return requests.filter((r) => statuses.includes(r.status));
  }, [requests, tab]);

  function openItem(item: QuickWorkRequest) {
    haptic('selection');
    if (isWorker) navigation.navigate('QuickWorkJob', { requestId: item.id });
    else navigation.navigate('QuickWorkDetail', { requestId: item.id });
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button">
          <Feather name="arrow-left" size={22} color={theme.text.primary} />
        </Pressable>
        <Text variant="bodyLarge" weight="semibold">
          Quick Work history
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
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
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm - 2,
                borderRadius: radii.pill,
                backgroundColor: active ? theme.brand.primary : theme.bg.surface,
                borderWidth: active ? 0 : 1,
                borderColor: theme.border.default,
              }}
            >
              <Text variant="footnote" weight="semibold" style={{ color: active ? theme.text.onBrand : theme.text.primary }}>
                {t.label}
                {counts[t.key] > 0 ? ` · ${counts[t.key]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {query.isLoading ? (
        <LoadingSpinner fullScreen />
      ) : query.isError ? (
        <View style={{ paddingHorizontal: spacing.xl }}>
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="clock"
          eyebrow="Quick Work"
          title={`No ${tab} requests`}
          message={isWorker ? "Jobs you've taken will show up here." : "Requests you've posted will show up here."}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing['3xl'], gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => openItem(item)}>
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }}>
                  <Text weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                    {item.title || 'Quick Work request'}
                  </Text>
                  <Pill label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
                </View>
                <Text variant="footnote" tone="tertiary">
                  {new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {item.finalPrice != null ? ` · ₹${(item.finalPrice / 100).toFixed(0)}` : ''}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
