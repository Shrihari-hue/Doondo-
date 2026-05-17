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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TabKey = 'saved' | 'applied';

function MyJobsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
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
            My Jobs
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
          {(['saved', 'applied'] as TabKey[]).map((t) => {
            const active = tab === t;
            const count = t === 'saved' ? savedJobs.length : appliedJobs.length;
            return (
              <Pressable
                key={t}
                onPress={() => {
                  haptic('selection');
                  setTab(t);
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
                    color: active ? theme.brand.hero : theme.text.secondary,
                  }}
                >
                  {t === 'saved' ? 'Saved' : 'Applied'}
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
          eyebrow={tab === 'saved' ? 'NOTHING SAVED' : 'NO APPLICATIONS'}
          title={tab === 'saved' ? 'No saved jobs yet' : 'No applied jobs yet'}
          message={
            tab === 'saved'
              ? 'Tap the heart on any job to save it for later.'
              : 'Browse nearby jobs and tap Apply Now.'
          }
          cta={{
            label: 'Browse jobs',
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
              tintColor={theme.brand.hero}
            />
          }
          renderItem={({ item }) => <JobRow job={item} onPress={() => openJob(item)} />}
        />
      )}
    </Screen>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function JobRow({ job, onPress }: { job: PublicJob; onPress: () => void }) {
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
              {job.employer?.companyName ?? job.employer?.name ?? 'Doondo Employer'}
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
            {formatPay(job.pay)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  const lo = (pay.amount / minor).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null;
  const periodMap = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  } as const;
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}

export function MyJobsScreen() {
  return (
    <SeekerThemeOverride>
      <MyJobsInner />
    </SeekerThemeOverride>
  );
}
