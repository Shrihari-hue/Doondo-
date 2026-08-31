/**
 * MyJobsScreen — seeker's "Saved" + "Applied" jobs in one screen.
 *
 * Two tabs at the top:
 *   Saved   → /jobs/saved
 *   Applied → /applications/me (deduped to job summaries)
 *
 * Tapping a job card opens JobDetail. No fake data — both lists come
 * from the real endpoints and show graceful empty states.
 */

import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TabKey = 'saved' | 'applied';
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function MyJobsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [tab, setTab] = useState<TabKey>('saved');

  const savedQuery = useQuery({
    queryKey: ['jobs', 'saved'],
    queryFn: () => jobsApi.listSaved(),
    staleTime: 60_000,
  });

  const appliedQuery = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 30_000,
  });

  const savedJobs: PublicJob[] = savedQuery.data?.jobs ?? [];

  // Applied → dedupe via Set + filter out non-job-bearing entries.
  const appliedJobs: PublicJob[] = useMemo(() => {
    const apps = appliedQuery.data?.applications ?? [];
    const seen = new Set<string>();
    const out: PublicJob[] = [];
    for (const a of apps) {
      if (a.job && !seen.has(a.job.id)) {
        seen.add(a.job.id);
        out.push(a.job);
      }
    }
    return out;
  }, [appliedQuery.data]);

  const activeList = tab === 'saved' ? savedJobs : appliedJobs;
  const activeQuery = tab === 'saved' ? savedQuery : appliedQuery;

  function openJob(j: PublicJob) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId: j.id });
  }

  return (
    <Screen edges={[]}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: theme.text.primary,
              flex: 1,
            }}
          >
            {t('my_jobs.title')}
          </Text>
        </View>

        {/* Tabs */}
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
          {(['saved', 'applied'] as TabKey[]).map((tabKey) => {
            const active = tab === tabKey;
            const count = tabKey === 'saved' ? savedJobs.length : appliedJobs.length;
            return (
              <Pressable
                key={tabKey}
                onPress={() => {
                  haptic('selection');
                  setTab(tabKey);
                }}
                style={{
                  flex: 1,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.md,
                  alignItems: 'center',
                  backgroundColor: active ? theme.bg.canvas : 'transparent',
                  borderWidth: active ? 0.5 : 0,
                  borderColor: theme.border.default,
                }}
              >
                <Text
                  variant="footnote"
                  weight={active ? 'medium' : 'regular'}
                  style={{
                    color: active ? theme.brand.primary : theme.text.secondary,
                  }}
                >
                  {tabKey === 'saved' ? t('my_jobs.tabs.saved') : t('my_jobs.tabs.applied')}
                  {count > 0 ? `  (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activeQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : activeQuery.isError ? (
        <ErrorPanel error={activeQuery.error} onRetry={() => void activeQuery.refetch()} />
      ) : activeList.length === 0 ? (
        <EmptyState
          glyph={tab === 'saved' ? '♡' : '✉'}
          eyebrow={tab === 'saved' ? t('my_jobs.empty.saved_eyebrow') : t('my_jobs.empty.applied_eyebrow')}
          title={tab === 'saved' ? t('my_jobs.empty.saved_title') : t('my_jobs.empty.applied_title')}
          message={
            tab === 'saved'
              ? t('my_jobs.empty.saved_message')
              : t('my_jobs.empty.applied_message')
          }
          cta={{
            label: t('my_jobs.empty.cta'),
            onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
          }}
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.md,
          }}
          data={activeList}
          keyExtractor={(j) => j.id}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => void activeQuery.refetch()}
              tintColor={theme.brand.accent}
            />
          }
          renderItem={({ item }) => <JobRow t={t} job={item} onPress={() => openJob(item)} />}
        />
      )}
    </Screen>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function JobRow({ t, job, onPress }: { t: TFn; job: PublicJob; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          padding: spacing.lg,
          gap: spacing.sm,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{ fontSize: 16, fontWeight: '600', color: theme.text.primary }}
              numberOfLines={1}
            >
              {job.title}
            </Text>
            <Text style={{ fontSize: 13, color: theme.text.secondary }} numberOfLines={1}>
              {job.employer?.companyName ?? job.employer?.name ?? t('jobs.card.default_employer')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {job.location.city}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: theme.accent.amber,
            }}
          >
            {formatPay(job.pay, t)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  const lo = (pay.amount / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;
  const periodKey =
    pay.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : pay.period === 'day'
        ? 'common.pay_period.suffix_day'
        : pay.period === 'week'
          ? 'common.pay_period.suffix_week'
          : pay.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return hi
    ? `${symbol}${lo}–${hi}${t(periodKey)}`
    : `${symbol}${lo}${t(periodKey)}`;
}

export function MyJobsScreen() {
  return (
    <SeekerThemeOverride>
      <MyJobsInner />
    </SeekerThemeOverride>
  );
}
