/**
 * PostsScreen — the employer's job postings.
 *
 * Lists jobs grouped by status. Each card shows title, status pill,
 * applicant count badge, and a row of inline actions (Pause / Reopen /
 * Close). Tapping a card opens JobApplicants for that job.
 *
 * Top-right "+ New" CTA opens the PostJob modal.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Card, Pill, Button, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { haptic } from '@/lib/haptics';
import type { JobStatus, PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function PostsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();

  const query = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => jobsApi.listMine({ limit: 100 }),
  });

  const jobs = query.data?.jobs ?? [];
  const active = jobs.filter((j) => j.status === 'active' || j.status === 'paused');
  const closed = jobs.filter((j) => j.status === 'filled' || j.status === 'expired');

  const onPostJob = () => {
    haptic('selection');
    navigation.navigate('PostJob');
  };

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
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        <Header onPostJob={onPostJob} count={jobs.length} />

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
            title="Couldn't load your posts"
            message="Pull down to retry, or check your connection."
            tall
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            glyph="+"
            tone="hero"
            eyebrow="NO POSTS YET"
            title="Post your first job"
            message="Tap the + New button above and be hiring in under a minute."
            cta={{ label: 'Post a job', onPress: onPostJob }}
            tall
          />
        ) : (
          <>
            {active.length > 0 && (
              <Section title="Open" jobs={active} />
            )}
            {closed.length > 0 && (
              <Section title="Closed" jobs={closed} />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({ onPostJob, count }: { onPostJob: () => void; count: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
          POSTS
        </Text>
        <Text variant="display" weight="medium" display>
          Your jobs.
        </Text>
        <Text variant="footnote" tone="secondary">
          {count > 0 ? `${count} total · pull down to refresh` : 'Post a job to start hiring'}
        </Text>
      </View>
      <Button label="+ New" onPress={onPostJob} variant="secondary" />
    </View>
  );
}

function Section({ title, jobs }: { title: string; jobs: PublicJob[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {title.toUpperCase()}
      </Text>
      {jobs.map((j) => (
        <PostCard key={j.id} job={j} />
      ))}
    </View>
  );
}

function PostCard({ job }: { job: PublicJob }) {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const transition = useMutation({
    mutationFn: (next: Exclude<JobStatus, 'expired'> | 'expired') => {
      if (next === 'paused') return jobsApi.pause(job.id);
      if (next === 'active') return jobsApi.reopen(job.id);
      return jobsApi.close(job.id);
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
    },
    onError: () => haptic('error'),
  });

  const open = job.status === 'active' || job.status === 'paused';

  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        navigation.navigate('JobApplicants', { jobId: job.id, jobTitle: job.title });
      }}
    >
      {/* Filled jobs are the magical outcome — same gold ring treatment we
          use on hired applications, so the win-state stands out from the
          everyday Open / Closed cards. */}
      <Card premium={job.status === 'filled'}>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
                {job.title}
              </Text>
              <Text variant="footnote" tone="secondary">
                {job.location.area ? `${job.location.area} · ` : ''}
                {formatType(job.type)}
              </Text>
            </View>
            <StatusPill status={job.status} />
          </View>

          {/* Applicant count + actions */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <Pill
              label={`${job.applicantsCount} applicant${
                job.applicantsCount === 1 ? '' : 's'
              }`}
              tone="info"
            />
            {open && (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {job.status === 'active' ? (
                  <ActionPill
                    label="Pause"
                    onPress={() => transition.mutate('paused')}
                  />
                ) : (
                  <ActionPill
                    label="Reopen"
                    onPress={() => transition.mutate('active')}
                  />
                )}
                <ActionPill label="Close" onPress={() => transition.mutate('expired')} />
              </View>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      hitSlop={6}
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 0.5,
        borderColor: theme.border.default,
      }}
    >
      <Text variant="footnote" tone="hero" weight="medium">
        {label}
      </Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'premium' }> = {
    active: { label: 'Active', tone: 'success' },
    paused: { label: 'Paused', tone: 'warning' },
    filled: { label: 'Filled', tone: 'premium' },
    expired: { label: 'Closed', tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
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
