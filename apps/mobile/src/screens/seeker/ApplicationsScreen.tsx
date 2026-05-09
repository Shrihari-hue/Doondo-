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
import type { ApplicationStatus, PublicApplication } from '@/api/types';

const ACTIVE_STATUSES: ApplicationStatus[] = ['pending', 'viewed', 'shortlisted'];

export function ApplicationsScreen() {
  const { theme } = useTheme();
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
            tintColor={theme.brand.hero}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            APPLICATIONS
          </Text>
          <Text variant="display" weight="medium" display>
            Where you stand.
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
            eyebrow="OFFLINE"
            title="Couldn't load your applications"
            message="Check your connection and pull down to retry."
            tall
          />
        ) : apps.length === 0 ? (
          <EmptyState
            glyph="✓"
            tone="hero"
            eyebrow="NOTHING IN FLIGHT"
            title="No applications yet"
            message="Apply to a nearby job and you'll see its status here in real time."
            tall
          />
        ) : (
          <>
            {active.length > 0 && (
              <Section title="Active" apps={active} />
            )}
            {past.length > 0 && (
              <Section title="Past" apps={past} />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, apps }: { title: string; apps: PublicApplication[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
        {title.toUpperCase()}
      </Text>
      {apps.map((a) => (
        <ApplicationCard key={a.id} app={a} />
      ))}
    </View>
  );
}

function ApplicationCard({ app }: { app: PublicApplication }) {
  // Hired = the rare, magical outcome. Highlight with the champagne hairline
  // border so it stands out from the rest of the list.
  return (
    <Card premium={app.status === 'hired'}>
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
              {app.job?.title ?? 'Job'}
            </Text>
            <Text variant="footnote" tone="secondary">
              {app.job?.employer?.name ?? '—'}
            </Text>
          </View>
          <StatusPill status={app.status} />
        </View>
        <Text variant="footnote" tone="tertiary">
          {timeSince(app.timeline.appliedAt)}
        </Text>
      </View>
    </Card>
  );
}

function StatusPill({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { label: string; tone: 'neutral' | 'success' | 'danger' | 'info' | 'premium' | 'warning' }> = {
    pending: { label: 'Sent', tone: 'info' },
    viewed: { label: 'Viewed', tone: 'info' },
    shortlisted: { label: 'Shortlisted', tone: 'success' },
    rejected: { label: 'Not selected', tone: 'neutral' },
    hired: { label: 'Hired', tone: 'premium' },
    withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
