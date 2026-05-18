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
import { useTranslate } from '@/i18n/useTranslate';
import { jobsApi } from '@/api/jobs.api';
import { haptic } from '@/lib/haptics';
import type { JobStatus, PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function PostsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const t = useTranslate();

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
        <Header onPostJob={onPostJob} count={jobs.length} t={t} />

        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('employer.posts.offline_eyebrow')}
            title={t('employer.posts.offline_title')}
            message={t('employer.posts.offline_message')}
            tall
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            glyph="+"
            tone="hero"
            eyebrow={t('employer.posts.empty_eyebrow')}
            title={t('employer.posts.empty_title')}
            message={t('employer.posts.empty_message')}
            cta={{ label: t('employer.posts.cta_post'), onPress: onPostJob }}
            tall
          />
        ) : (
          <>
            {active.length > 0 && (
              <Section title={t('employer.posts.section_open')} jobs={active} t={t} />
            )}
            {closed.length > 0 && (
              <Section title={t('employer.posts.section_closed')} jobs={closed} t={t} />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Header({ onPostJob, count, t }: { onPostJob: () => void; count: number; t: TFn }) {
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
          {t('employer.posts.eyebrow')}
        </Text>
        <Text variant="display" weight="medium" display>
          {t('employer.posts.title')}
        </Text>
        <Text variant="footnote" tone="secondary">
          {count > 0
            ? t('employer.posts.subtitle', { count, n: count })
            : t('employer.posts.subtitle_empty')}
        </Text>
      </View>
      <Button label={t('employer.posts.cta_new')} onPress={onPostJob} variant="secondary" />
    </View>
  );
}

function Section({ title, jobs, t }: { title: string; jobs: PublicJob[]; t: TFn }) {
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
        <PostCard key={j.id} job={j} t={t} />
      ))}
    </View>
  );
}

function PostCard({ job, t }: { job: PublicJob; t: TFn }) {
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
                {formatType(job.type, t)}
              </Text>
            </View>
            <StatusPill status={job.status} t={t} />
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
              label={t('employer.posts.applicants', {
                count: job.applicantsCount,
                n: job.applicantsCount,
              })}
              tone="info"
            />
            {open && (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {job.status === 'active' ? (
                  <ActionPill
                    label={t('employer.posts.action_pause')}
                    onPress={() => transition.mutate('paused')}
                  />
                ) : (
                  <ActionPill
                    label={t('employer.posts.action_reopen')}
                    onPress={() => transition.mutate('active')}
                  />
                )}
                <ActionPill label={t('employer.posts.action_close')} onPress={() => transition.mutate('expired')} />
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

function StatusPill({ status, t }: { status: JobStatus; t: TFn }) {
  const map: Record<JobStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'premium' }> = {
    active: { label: t('employer.posts.status_active'), tone: 'success' },
    paused: { label: t('employer.posts.status_paused'), tone: 'warning' },
    filled: { label: t('employer.posts.status_filled'), tone: 'premium' },
    expired: { label: t('employer.posts.status_expired'), tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

function formatType(type: PublicJob['type'], t: TFn): string {
  const map: Record<PublicJob['type'], string> = {
    full_time: t('employer.posts.type_full_time'),
    part_time: t('employer.posts.type_part_time'),
    gig: t('employer.posts.type_gig'),
    shift: t('employer.posts.type_shift'),
    contract: t('employer.posts.type_contract'),
  };
  return map[type];
}
