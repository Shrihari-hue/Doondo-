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
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function SavedJobsScreen() {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

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
            tintColor={theme.brand.hero}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            SAVED
          </Text>
          <Text variant="display" weight="medium" display>
            Your shortlist.
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
            eyebrow="OFFLINE"
            title="Couldn't load your saved jobs"
            message="Pull down to retry, or check your connection."
            tall
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            glyph="☆"
            tone="hero"
            eyebrow="NOTHING SAVED"
            title="Your shortlist is empty"
            message="Tap the bookmark on any job card and it'll appear here for later."
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {jobs.map((job) => (
              <SavedJobCard
                key={job.id}
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
  job,
  onOpen,
  onUnsave,
}: {
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
              name={job.employer?.companyName ?? job.employer?.name ?? 'Employer'}
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
            <Pill label={formatPay(job.pay)} tone="warning" />
            {job.employer?.isVerified && (
              <Pill label="Verified" tone="premium" leading="★" />
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
  const lo = (pay.amount / minor).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null;
  const periodMap: Record<PublicJob['pay']['period'], string> = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  };
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}
