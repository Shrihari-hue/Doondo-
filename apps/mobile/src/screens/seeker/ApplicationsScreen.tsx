/**
 * ApplicationsScreen — list of the seeker's applications, grouped by
 * Active vs Past, with status pill and time-since-applied.
 *
 * Phase 2 v1: read-only list. Live socket updates (status changes pushing
 * to React Query cache) land in the Applications task polish step.
 */

import { RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { spacing } from '@doondo/tokens';
import { Screen, Text, Card, Pill, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { useTranslate } from '@/i18n/useTranslate';
import type { ApplicationStatus, PublicApplication } from '@/api/types';

const ACTIVE_STATUSES: ApplicationStatus[] = ['pending', 'viewed', 'shortlisted'];
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function ApplicationsScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
  });

  const apps = query.data?.applications ?? [];
  const active = apps.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const past = apps.filter((a) => !ACTIVE_STATUSES.includes(a.status));

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
            tintColor={theme.brand.primary}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('applications.legacy.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('applications.legacy.heading')}
          </Text>
        </View>

        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('applications.legacy.error_eyebrow')}
            title={t('applications.legacy.error_title')}
            message={t('applications.legacy.error_message')}
            tall
          />
        ) : apps.length === 0 ? (
          <EmptyState
            glyph="✓"
            tone="hero"
            eyebrow={t('applications.legacy.empty_eyebrow')}
            title={t('applications.legacy.empty_title')}
            message={t('applications.legacy.empty_message')}
            tall
          />
        ) : (
          <>
            {active.length > 0 && (
              <Section t={t} title={t('applications.legacy.section_active')} apps={active} />
            )}
            {past.length > 0 && (
              <Section t={t} title={t('applications.legacy.section_past')} apps={past} />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ t, title, apps }: { t: TFn; title: string; apps: PublicApplication[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
        {title.toUpperCase()}
      </Text>
      {apps.map((a) => (
        <ApplicationCard key={a.id} t={t} app={a} />
      ))}
    </View>
  );
}

function ApplicationCard({ t, app }: { t: TFn; app: PublicApplication }) {
  // Hired = the rare, magical outcome. Highlight with the champagne hairline
  // border so it stands out from the rest of the list. An active interview
  // also earns the premium border so the moment feels meaningful.
  const hasActiveInterview = app.interview?.status === 'scheduled';
  return (
    <Card premium={app.status === 'hired' || hasActiveInterview}>
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
              {app.job?.title ?? t('applications.fallback.job')}
            </Text>
            <Text variant="footnote" tone="secondary">
              {app.job?.employer?.name ?? '—'}
            </Text>
          </View>
          <StatusPill t={t} status={app.status} />
        </View>
        <Text variant="footnote" tone="tertiary">
          {timeSince(app.timeline.appliedAt, t)}
        </Text>
        {hasActiveInterview ? <InterviewNote t={t} interview={app.interview!} /> : null}
      </View>
    </Card>
  );
}

function InterviewNote({ t, interview }: { t: TFn; interview: NonNullable<PublicApplication['interview']> }) {
  const when = new Date(interview.scheduledFor).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const where =
    interview.mode === 'in_person'
      ? interview.location
        ? t('applications.legacy.interview_at', { location: interview.location })
        : ''
      : interview.mode === 'video'
        ? interview.meetingLink
          ? t('applications.legacy.interview_video_link')
          : t('applications.legacy.interview_video')
        : t('applications.legacy.interview_phone');
  return (
    <View style={{ marginTop: spacing.xs }}>
      <Pill label={t('applications.legacy.interview_pill', { when, where })} tone="premium" leading="★" />
    </View>
  );
}

function StatusPill({ t, status }: { t: TFn; status: ApplicationStatus }) {
  // Legacy screen uses the older "Sent" wording for pending and a non-prefixed
  // "Hired" label, distinct from MyApplicationsScreen's "Pending" / "✓ Hired".
  // We keep that voice intact via a dedicated map of translation keys.
  const labelKey: Record<ApplicationStatus, string> = {
    pending: 'applications.legacy.status_sent',
    viewed: 'applications.status.viewed',
    shortlisted: 'applications.status.shortlisted',
    rejected: 'applications.status.rejected',
    hired: 'applications.filters.hired',
    withdrawn: 'applications.status.withdrawn',
  };
  const toneMap: Record<ApplicationStatus, 'neutral' | 'success' | 'danger' | 'info' | 'premium' | 'warning'> = {
    pending: 'info',
    viewed: 'info',
    shortlisted: 'success',
    rejected: 'neutral',
    hired: 'premium',
    withdrawn: 'neutral',
  };
  return <Pill label={t(labelKey[status])} tone={toneMap[status]} />;
}

function timeSince(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t('applications.time.just_now');
  if (m < 60)
    return t(
      m === 1 ? 'applications.time.minute_ago_one' : 'applications.time.minute_ago_other',
      { n: m },
    );
  const h = Math.floor(m / 60);
  if (h < 24)
    return t(
      h === 1 ? 'applications.time.hour_ago_one' : 'applications.time.hour_ago_other',
      { n: h },
    );
  const d = Math.floor(h / 24);
  if (d < 7)
    return t(
      d === 1 ? 'applications.time.day_ago_one' : 'applications.time.day_ago_other',
      { n: d },
    );
  return new Date(iso).toLocaleDateString();
}
