/**
 * MyApplicationsScreen — seeker's application timeline.
 *
 * Lists every job the seeker has applied to, newest first. Each card
 * shows: job title, employer name, status pill, applied date, and a
 * subtle right-chevron that opens the job detail (so the seeker can
 * see the full posting and current state in one tap).
 *
 * Status pills are color-tinted per status:
 *   pending      → neutral
 *   viewed       → info blue
 *   shortlisted  → success green
 *   rejected     → danger
 *   hired        → success-strong (also gets an interview card if one is scheduled)
 *   withdrawn    → muted
 *
 * No fake data. Empty state when there are no applications yet.
 */

import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, PaymentConfirmationPanel, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { useUnratedApplications } from '@/hooks/useRatings';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { ApplicationStatus, PublicApplication } from '@/api/types';
import type { UnratedApp } from '@/api/ratings.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function MyApplicationsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();

  const query = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 30_000,
  });

  // Pending ratings the seeker can leave. Indexed by applicationId for
  // O(1) lookup as we render each row.
  const unratedQuery = useUnratedApplications();
  const unratedByAppId = new Map<string, UnratedApp>();
  for (const u of unratedQuery.data?.unrated ?? []) {
    unratedByAppId.set(u.applicationId, u);
  }

  const applications = query.data?.applications ?? [];

  // Pipeline filter — defaults to "Open" (anything not terminal) since
  // that's what seekers want to see day-to-day. Counts drive the chip
  // labels so the screen reads as a real status dashboard.
  const [filter, setFilter] = useState<
    'open' | 'all' | ApplicationStatus
  >('open');

  const counts = useMemo(() => {
    const c: Record<ApplicationStatus, number> = {
      pending: 0,
      viewed: 0,
      shortlisted: 0,
      rejected: 0,
      hired: 0,
      withdrawn: 0,
    };
    for (const a of applications) c[a.status]++;
    return {
      ...c,
      open: c.pending + c.viewed + c.shortlisted,
      all: applications.length,
    };
  }, [applications]);

  const filtered = useMemo(() => {
    if (filter === 'all') return applications;
    if (filter === 'open') {
      return applications.filter((a) =>
        ['pending', 'viewed', 'shortlisted'].includes(a.status),
      );
    }
    return applications.filter((a) => a.status === filter);
  }, [applications, filter]);

  // Whether someone has an interview scheduled — surfaced as a callout
  // because it's the highest-value status to know about at a glance.
  const interviewCount = applications.filter(
    (a) => a.interview && a.interview.status === 'scheduled',
  ).length;

  function openJob(jobId: string) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId });
  }

  return (
    <Screen edges={[]}>
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
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
          {t('applications.title')}
        </Text>
      </View>

      {/* Pipeline summary line — what's actually moving right now. */}
      {applications.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
          <Text
            style={{
              fontSize: 13,
              color: theme.text.secondary,
              lineHeight: 19,
            }}
          >
            {t(
              interviewCount === 1
                ? 'applications.pipeline_summary_one'
                : 'applications.pipeline_summary_other',
              {
                open: counts.open,
                shortlisted: counts.shortlisted,
                interviewCount,
                hired: counts.hired,
              },
            )}
          </Text>
        </View>
      ) : null}

      {/* Status filter chips */}
      {applications.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            gap: spacing.xs,
            paddingBottom: spacing.sm,
          }}
        >
          {(
            [
              { key: 'open', labelKey: 'applications.filters.open', count: counts.open },
              { key: 'shortlisted', labelKey: 'applications.filters.shortlisted', count: counts.shortlisted },
              { key: 'hired', labelKey: 'applications.filters.hired', count: counts.hired },
              { key: 'rejected', labelKey: 'applications.filters.rejected', count: counts.rejected },
              { key: 'all', labelKey: 'applications.filters.all', count: counts.all },
            ] as const
          ).map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  haptic('selection');
                  setFilter(f.key);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm - 2,
                  borderRadius: radii.pill,
                  backgroundColor: active ? '#2563EB' : theme.bg.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: theme.border.default,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: active ? '#FFFFFF' : theme.text.primary,
                  }}
                >
                  {t(f.labelKey)}
                  {f.count > 0 ? ` · ${f.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      ) : applications.length === 0 ? (
        <EmptyState
          glyph="✉"
          eyebrow={t('applications.empty.eyebrow')}
          title={t('applications.empty.title')}
          message={t('applications.empty.message')}
          cta={{
            label: t('applications.empty.cta'),
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
          data={filtered}
          keyExtractor={(a) => a.id}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={theme.brand.hero}
            />
          }
          renderItem={({ item }) => {
            const unrated = unratedByAppId.get(item.id);
            return (
            <Pressable onPress={() => openJob(item.jobId)}>
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
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: theme.text.primary,
                      }}
                      numberOfLines={1}
                    >
                      {item.job?.title ?? t('applications.fallback.job_application')}
                    </Text>
                    <Text
                      style={{ fontSize: 13, color: theme.text.secondary }}
                      numberOfLines={1}
                    >
                      {item.job?.employer?.companyName ?? item.job?.employer?.name ?? t('applications.fallback.employer')}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
                      {t('applications.applied_when', { when: formatRelative(item.timeline.appliedAt, t) })}
                    </Text>
                  </View>
                  <StatusPill t={t} status={item.status} />
                </View>

                {/* Payment confirmation — only when hired. */}
                {item.status === 'hired' ? (
                  <PaymentConfirmationPanel
                    application={item}
                    role="seeker"
                    invalidateQueryKeys={[['applications', 'me']]}
                  />
                ) : null}

                {item.interview && item.status === 'hired' && (
                  <View
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.md,
                      backgroundColor: theme.status.successSubtle,
                      borderWidth: 0.5,
                      borderColor: theme.status.successBorder,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: theme.status.success,
                      }}
                    >
                      {t('applications.interview_scheduled', { when: formatInterviewWhen(item.interview.scheduledFor) })}
                    </Text>
                  </View>
                )}

                {/* Rate-now prompt — only when the application is hired
                    AND the seeker hasn't yet rated. Tap pushes the
                    LeaveRating modal with the employer pre-filled. */}
                {unrated && (
                  <Pressable
                    onPress={() => {
                      haptic('selection');
                      navigation.navigate('LeaveRating', {
                        applicationId: unrated.applicationId,
                        revieweeName: unrated.otherPartyName,
                        jobTitle: unrated.jobTitle,
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.sm,
                      borderRadius: radii.md,
                      backgroundColor: theme.brand.heroSubtle,
                      borderWidth: 0.5,
                      borderColor: theme.brand.heroBorder,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 16, lineHeight: 18 }}>⭐</Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: '600',
                        color: theme.brand.hero,
                      }}
                    >
                      {t('applications.rate_now_title', { name: unrated.otherPartyName })}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.brand.hero,
                        fontWeight: '600',
                      }}
                    >
                      {t('applications.rate_now_cta')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ t, status }: { t: TFn; status: ApplicationStatus }) {
  const { theme } = useTheme();
  const meta = statusMeta(status, theme, t);
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radii.pill,
        backgroundColor: meta.bg,
        borderWidth: 0.5,
        borderColor: meta.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: meta.fg,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function statusMeta(
  status: ApplicationStatus,
  theme: ReturnType<typeof useTheme>['theme'],
  t: TFn,
) {
  // Labels come from applications.status.* — colors stay local since they're
  // theme-driven rather than translatable content.
  const label = t(`applications.status.${status}`);
  switch (status) {
    case 'pending':
      return {
        label,
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.secondary,
      };
    case 'viewed':
      return {
        label,
        bg: theme.status.infoSubtle,
        border: theme.status.infoBorder,
        fg: theme.status.info,
      };
    case 'shortlisted':
      return {
        label,
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'rejected':
      return {
        label,
        bg: theme.status.dangerSubtle,
        border: theme.status.dangerBorder,
        fg: theme.status.danger,
      };
    case 'hired':
      return {
        label,
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'withdrawn':
      return {
        label,
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.tertiary,
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return t('applications.time.just_now');
  if (diffMin < 60) return t('applications.time.min_ago', { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('applications.time.hr_ago', { n: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7)
    return t(
      diffDay === 1 ? 'applications.time.day_ago_one' : 'applications.time.day_ago_other',
      { n: diffDay },
    );
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatInterviewWhen(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} at ${new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function MyApplicationsScreen() {
  return (
    <SeekerThemeOverride>
      <MyApplicationsInner />
    </SeekerThemeOverride>
  );
}
