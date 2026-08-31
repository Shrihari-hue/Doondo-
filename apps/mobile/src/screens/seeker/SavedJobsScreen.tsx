/**
 * SavedJobsScreen — the seeker's bookmarks.
 *
 * Lists every job the user has saved (bookmark icon on a job card flips it
 * here). Tapping a card opens the full JobDetail. Swipe-to-unsave is a
 * later polish; for now the unsave action lives on the card itself.
 *
 * Pull-to-refresh re-fetches /jobs/saved so a freshly-saved job from
 * another device shows up without a tab switch.
 */

import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import {
  Avatar,
  Card,
  EmptyState,
  Pill,
  Screen,
  SkeletonCard,
  Text,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function SavedJobsScreen() {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const t = useTranslate();

  const query = useQuery({
    queryKey: ['jobs', 'saved'],
    queryFn: () => jobsApi.listSaved(),
    enabled: isAuthenticated,
  });

  const unsave = useMutation({
    mutationFn: (jobId: string) => jobsApi.unsave(jobId),
    onMutate: async (jobId) => {
      // Optimistic — drop from the local list immediately.
      await qc.cancelQueries({ queryKey: ['jobs', 'saved'] });
      const prev = qc.getQueryData<{ jobs: PublicJob[] }>(['jobs', 'saved']);
      qc.setQueryData<{ jobs: PublicJob[] }>(['jobs', 'saved'], (old) =>
        old ? { jobs: old.jobs.filter((j) => j.id !== jobId) } : old,
      );
      return { prev };
    },
    onError: (_err, _jobId, ctx) => {
      // Roll back on failure.
      if (ctx?.prev) qc.setQueryData(['jobs', 'saved'], ctx.prev);
      haptic('error');
    },
  });

  const jobs = query.data?.jobs ?? [];

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.accent}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('saved_jobs.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('saved_jobs.title')}
          </Text>
        </View>

        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('saved_jobs.error.eyebrow')}
            title={t('saved_jobs.error.title')}
            message={t('saved_jobs.error.message')}
            tall
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            glyph="☆"
            tone="hero"
            eyebrow={t('saved_jobs.empty.eyebrow')}
            title={t('saved_jobs.empty.title')}
            message={t('saved_jobs.empty.message')}
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {jobs.map((job) => (
              <SavedJobCard
                key={job.id}
                t={t}
                job={job}
                onOpen={() => {
                  haptic('selection');
                  navigation.navigate('JobDetail', { jobId: job.id });
                }}
                onUnsave={() => {
                  haptic('light');
                  unsave.mutate(job.id);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function SavedJobCard({
  t,
  job,
  onOpen,
  onUnsave,
}: {
  t: TFn;
  job: PublicJob;
  onOpen: () => void;
  onUnsave: () => void;
}) {
  const subtitle = [
    job.employer?.companyName ?? job.employer?.name,
    job.location.area ?? job.location.city,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable onPress={onOpen}>
      <Card premium={job.employer?.isVerified}>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
            }}
          >
            <Avatar
              name={job.employer?.companyName ?? job.employer?.name ?? t('jobs.swipe.fallback_employer')}
              photoUrl={job.employer?.photoUrl ?? null}
              size={44}
              premium={job.employer?.isVerified}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
                {job.title}
              </Text>
              {subtitle ? (
                <Text variant="footnote" tone="secondary" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable hitSlop={10} onPress={onUnsave}>
              <Text variant="bodyLarge" tone="hero">
                ★
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Pill label={formatPay(job.pay, t)} tone="warning" />
            {job.employer?.isVerified && (
              <Pill label={t('jobs.card.verified')} tone="premium" leading="★" />
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
  // 'en-IN' grouping for lakh/crore display, language-independent.
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
