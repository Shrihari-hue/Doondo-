/**
 * PostsScreen — the employer's job postings.
 *
 * Lists jobs grouped by status. Each card now leads with a category icon
 * tile (decided from the job's title — Driver gets a steering glyph, Software
 * Engineer gets a laptop, etc.), title + status pill at the top, a full-width
 * "View applicants" row, and prominent Pause / Close action buttons. A Tip
 * card sits below the active list, matching the v2 employer mockups.
 *
 * Tapping the View applicants row opens JobApplicants for that job.
 *
 * Top-right "+ New" CTA opens the PostJob modal.
 */

import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Card, Pill, Button, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { jobsApi } from '@/api/jobs.api';
import { haptic } from '@/lib/haptics';
import type { JobStatus, PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { JobIcon } from './JobIcon';

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
              <Section
                title={t('employer.posts.section_open')}
                jobs={active}
                t={t}
              />
            )}
            {closed.length > 0 && (
              <Section
                title={t('employer.posts.section_closed')}
                jobs={closed}
                t={t}
              />
            )}
            <TipCard t={t} />
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
        <Text variant="caption" tone="hero" weight="medium" style={{ letterSpacing: 1.4 }}>
          {t('employer.posts.eyebrow')}
        </Text>
        <Text variant="display" weight="medium" display>
          {t('employer.posts.title')}
        </Text>
        <Text variant="footnote" tone="secondary">
          {count > 0
            ? t('employer.posts.subtitle_manage')
            : t('employer.posts.subtitle_empty')}
        </Text>
      </View>
      <Button label={t('employer.posts.cta_new')} onPress={onPostJob} variant="primary" />
    </View>
  );
}

function Section({ title, jobs, t }: { title: string; jobs: PublicJob[]; t: TFn }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.brand.hero,
            }}
          />
          <Text
            variant="footnote"
            weight="medium"
            tone="hero"
            style={{ letterSpacing: 1.2 }}
          >
            {title.toUpperCase()}
          </Text>
        </View>
        <Text variant="footnote" tone="secondary">
          {t('employer.posts.count', { n: jobs.length, count: jobs.length })}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>
        {jobs.map((j) => (
          <PostCard key={j.id} job={j} t={t} />
        ))}
      </View>
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

  const repost = useMutation({
    mutationFn: () => jobsApi.repost(job.id),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
    },
    onError: () => haptic('error'),
  });

  const open = job.status === 'active' || job.status === 'paused';

  const goToApplicants = () => {
    haptic('selection');
    navigation.navigate('JobApplicants', { jobId: job.id, jobTitle: job.title });
  };

  return (
    <Card premium={job.status === 'filled'}>
      <View style={{ gap: spacing.md }}>
        {/* Row 1 — icon, title block, status pill, kebab */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.md,
          }}
        >
          <JobIcon title={job.title} type={job.type} />

          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
              {job.title}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexWrap: 'wrap',
              }}
            >
              {job.location.area ? (
                <>
                  <Text variant="footnote" tone="secondary">
                    📍 {job.location.area}
                  </Text>
                  <Text variant="footnote" tone="tertiary">
                    ·
                  </Text>
                </>
              ) : null}
              <Text variant="footnote" tone="secondary">
                {formatType(job.type, t)}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <StatusPill status={job.status} t={t} />
            <KebabButton
              onPress={() => {
                haptic('light');
                goToApplicants();
              }}
              color={theme.text.tertiary}
            />
          </View>
        </View>

        {/* Auto-escalation badge — boosted, or needs the employer's attention. */}
        <EscalationBadge job={job} t={t} />

        {/* Row 2 — full-width "View applicants" inset row */}
        <Pressable onPress={goToApplicants}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: theme.bg.muted,
              borderRadius: radii.md,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text variant="body" tone="secondary">
              👥
            </Text>
            <Text variant="body" weight="medium" style={{ flex: 1 }}>
              {t('employer.posts.view_applicants')}
            </Text>
            <View
              style={{
                minWidth: 32,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.heroSubtle,
                borderWidth: 0.5,
                borderColor: theme.brand.heroBorder,
                alignItems: 'center',
              }}
            >
              <Text variant="footnote" tone="hero" weight="medium">
                {job.applicantsCount}
              </Text>
            </View>
            <Text variant="body" tone="tertiary">
              ›
            </Text>
          </View>
        </Pressable>

        {/* Row 3 — primary actions, only on open jobs */}
        {open && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {job.status === 'active' ? (
              <ActionButton
                glyph="⏸"
                label={t('employer.posts.action_pause')}
                tone="warning"
                onPress={() => transition.mutate('paused')}
              />
            ) : (
              <ActionButton
                glyph="▶"
                label={t('employer.posts.action_reopen')}
                tone="success"
                onPress={() => transition.mutate('active')}
              />
            )}
            <ActionButton
              glyph="✕"
              label={t('employer.posts.action_close')}
              tone="danger"
              onPress={() => transition.mutate('expired')}
            />
          </View>
        )}

        {/* Re-post — for closed / filled jobs: "same as last time". */}
        {!open && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ActionButton
              glyph="↻"
              label={t('employer.posts.action_repost')}
              tone="success"
              onPress={() => repost.mutate()}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

function ActionButton({
  glyph,
  label,
  tone,
  onPress,
}: {
  glyph: string;
  label: string;
  tone: 'warning' | 'danger' | 'success';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const map = {
    warning: {
      bg: theme.status.warningSubtle,
      border: theme.status.warningBorder,
      fg: theme.status.warning,
    },
    danger: {
      bg: theme.status.dangerSubtle,
      border: theme.status.dangerBorder,
      fg: theme.status.danger,
    },
    success: {
      bg: theme.status.successSubtle,
      border: theme.status.successBorder,
      fg: theme.status.success,
    },
  };
  const c = map[tone];

  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: c.bg,
        borderWidth: 0.5,
        borderColor: c.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="footnote" weight="medium" style={{ color: c.fg }}>
        {glyph}
      </Text>
      <Text variant="footnote" weight="medium" style={{ color: c.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

function KebabButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="title" style={{ color, lineHeight: 18 }}>
        ⋮
      </Text>
    </Pressable>
  );
}

function StatusPill({ status, t }: { status: JobStatus; t: TFn }) {
  const map: Record<
    JobStatus,
    { label: string; tone: 'success' | 'warning' | 'neutral' | 'premium' }
  > = {
    active: { label: t('employer.posts.status_active'), tone: 'success' },
    paused: { label: t('employer.posts.status_paused'), tone: 'warning' },
    filled: { label: t('employer.posts.status_filled'), tone: 'premium' },
    expired: { label: t('employer.posts.status_expired'), tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

/**
 * Auto-escalation badge. A stalling job that's been boosted shows a
 * "Boosted" chip; once it reaches the recommendation stages it reads as
 * "Needs attention" so the employer knows to act (raise wage, widen, etc.).
 * Renders nothing for healthy posts (stage 0) or closed ones.
 */
function EscalationBadge({ job, t }: { job: PublicJob; t: TFn }) {
  if (job.status !== 'active' || (job.escalationStage ?? 0) < 1) return null;
  const boosted = job.boostedUntil != null && new Date(job.boostedUntil).getTime() > Date.now();
  if (job.escalationStage >= 2) {
    return <Pill label={t('employer.posts.escalation_attention')} tone="warning" />;
  }
  if (boosted) {
    return <Pill label={t('employer.posts.escalation_boosted')} tone="info" />;
  }
  return null;
}

function TipCard({ t }: { t: TFn }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        backgroundColor: theme.brand.heroSubtle,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.brand.heroBorder,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.md,
          backgroundColor: theme.brand.heroSubtle,
          borderWidth: 0.5,
          borderColor: theme.brand.heroBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="title" style={{ color: theme.brand.hero }}>
          💡
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" weight="medium" tone="hero">
          {t('employer.posts.tip_title')}
        </Text>
        <Text variant="footnote" tone="secondary">
          {t('employer.posts.tip_body')}
        </Text>
      </View>
      <Text variant="body" tone="hero">
        ›
      </Text>
    </View>
  );
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
