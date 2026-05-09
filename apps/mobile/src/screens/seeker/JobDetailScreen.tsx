/**
 * JobDetailScreen — modal-style detail view with Apply CTA.
 *
 * Phase 2 v1: full posting + employer card + sticky Apply button. The
 * cinematic apply success moment (3D champagne particle burst) lands in
 * the Apply flow polish step; this version shows a simple haptic-backed
 * success state so the loop is closed end-to-end.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { ApplyCelebration } from './apply-moment/ApplyCelebration';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobDetail'>;
type Route = RouteProp<AppStackParamList, 'JobDetail'>;

export function JobDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [appliedNow, setAppliedNow] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['job', route.params.jobId],
    queryFn: () => jobsApi.detail(route.params.jobId),
  });

  const applyMutation = useMutation({
    mutationFn: () => applicationsApi.apply(route.params.jobId),
    onSuccess: () => {
      setAppliedNow(true);
      setApplyError(null);
      setShowCelebration(true);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        setApplyError('You already applied to this job.');
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.code === 'JOB_NOT_OPEN') {
        setApplyError('This job is no longer accepting applications.');
      } else {
        setApplyError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    },
  });

  if (detail.isLoading) {
    // Skeleton arrangement that mirrors the silhouette of the loaded
    // detail — a hero block, a body block, and the employer card. Feels
    // like content settling rather than a blank wait.
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['3xl'],
            gap: spacing.lg,
          }}
        >
          <SkeletonCard lines={2} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </Screen>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow="UNAVAILABLE"
            title="Couldn't load this job"
            message="It may have been removed, or your connection dropped."
            cta={{ label: 'Close', onPress: () => navigation.goBack() }}
          />
        </View>
      </Screen>
    );
  }

  const job = detail.data.job;

  return (
    <Screen>
      {showCelebration && (
        <ApplyCelebration
          onClose={() => {
            setShowCelebration(false);
            navigation.goBack();
          }}
        />
      )}
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['7xl'],
          gap: spacing['2xl'],
        }}
      >
        {/* Close button */}
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            ← Back
          </Text>
        </Pressable>

        {/* Hero */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {formatType(job.type).toUpperCase()}
          </Text>
          <Text variant="display" weight="medium" display>
            {job.title}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Pill label={formatPay(job.pay)} tone="warning" />
            {job.distanceMeters != null && (
              <Pill
                label={
                  job.distanceMeters < 1000
                    ? `${job.distanceMeters} m away`
                    : `${(job.distanceMeters / 1000).toFixed(1)} km away`
                }
                tone="neutral"
              />
            )}
          </View>
        </View>

        {/* Employer */}
        <Card premium={job.employer?.isVerified}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium">
                {job.employer?.name ?? 'Doondo Employer'}
              </Text>
              <Text variant="footnote" tone="secondary">
                {job.location.address}
              </Text>
            </View>
            {job.employer?.isVerified && (
              <Pill label="Verified" tone="premium" leading="★" />
            )}
          </View>
        </Card>

        {/* Description */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            ABOUT THIS JOB
          </Text>
          <Text variant="body">{job.description}</Text>
        </View>

        {/* Skills */}
        {job.skills.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
              SKILLS
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {job.skills.map((s) => (
                <Pill key={s} label={s} tone="neutral" />
              ))}
            </View>
          </View>
        )}

        {/* Schedule */}
        {job.schedule?.hoursPerDay != null && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
              SCHEDULE
            </Text>
            <Text variant="body">{job.schedule.hoursPerDay} hours per day</Text>
          </View>
        )}

        {/* Apply CTA + post-apply state */}
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {appliedNow ? (
            <Card premium>
              <View style={{ gap: spacing.xs, alignItems: 'center' }}>
                <Text variant="bodyLarge" weight="medium" tone="hero">
                  Application sent
                </Text>
                <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                  Track its status in the Applications tab.
                </Text>
              </View>
            </Card>
          ) : (
            <Button
              label={applyMutation.isPending ? 'Sending…' : 'Apply now'}
              onPress={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            />
          )}
          {applyError && !appliedNow && (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              {applyError}
            </Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Formatting (duplicated tiny helpers — fine for Phase 2 v1) ──────────────

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
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

function formatType(t: PublicJob['type']): string {
  return (
    {
      full_time: 'Full-time',
      part_time: 'Part-time',
      gig: 'Gig',
      shift: 'Shift',
      contract: 'Contract',
    } as const
  )[t];
}
