/**
 * MyJobScreen — the worker's "My Job" tab.
 *
 * Centers on the worker's *active employment*: a glanceable attendance
 * header (days + hours this month, across all employers) and a card per
 * employer they're currently hired by. Tapping an employer opens the
 * per-employer hub (attendance, salary slip, payment status, schedule,
 * shift tools, rate, …).
 *
 * Active employers are derived from the worker's own hired applications
 * grouped by employer — no new list endpoint needed. The attendance
 * header comes from the worker attendance rollup.
 */

import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Avatar, EmptyState, LoadingSpinner } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import { workerJobApi } from '@/api/workerJob.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function hoursLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

interface EmployerGroup {
  employerId: string;
  employerName: string;
  isVerified: boolean;
  jobCount: number;
  nextShiftAt: string | null;
  awaitingPayment: number;
}

export function MyJobScreen() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();

  const query = useQuery({
    queryKey: ['applications', 'me', 'hired'],
    queryFn: () => applicationsApi.listMine({ status: 'hired', limit: 50 }),
    staleTime: 30_000,
  });

  const attendanceQuery = useQuery({
    queryKey: ['my-job', 'attendance'],
    queryFn: () => workerJobApi.attendance(),
    staleTime: 60_000,
  });
  const attendance = attendanceQuery.data;

  const groups = useMemo<EmployerGroup[]>(() => {
    const apps = query.data?.applications ?? [];
    const byEmp = new Map<string, EmployerGroup>();
    for (const a of apps) {
      const emp = a.job?.employer;
      if (!emp?.id) continue;
      if (!byEmp.has(emp.id)) {
        byEmp.set(emp.id, {
          employerId: emp.id,
          employerName: emp.name ?? 'Employer',
          isVerified: Boolean(emp.isVerified),
          jobCount: 0,
          nextShiftAt: null,
          awaitingPayment: 0,
        });
      }
      const g = byEmp.get(emp.id)!;
      g.jobCount += 1;
      // Soonest upcoming shift across this employer's jobs.
      if (a.nextShiftAt && (!g.nextShiftAt || a.nextShiftAt < g.nextShiftAt)) {
        g.nextShiftAt = a.nextShiftAt;
      }
      // "Owed" = employer hasn't confirmed payment yet on a hire.
      if (!a.paymentConfirmation?.employerConfirmedAt) g.awaitingPayment += 1;
    }
    return [...byEmp.values()];
  }, [query.data]);

  const loading = query.isLoading;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
              void attendanceQuery.refetch();
            }}
            tintColor={theme.brand.hero}
          />
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('my_job.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('my_job.title')}
          </Text>
        </View>

        {/* Attendance header — this month at a glance. */}
        {attendance && attendance.totalShifts > 0 ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <Stat label={t('my_job.stat_days')} value={String(attendance.totalDays)} theme={theme} />
              <Stat label={t('my_job.stat_shifts')} value={String(attendance.totalShifts)} theme={theme} />
              <Stat
                label={t('my_job.stat_hours')}
                value={hoursLabel(attendance.totalMinutes)}
                theme={theme}
              />
            </View>
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {t('my_job.stat_caption', { month: attendance.month })}
            </Text>
          </Card>
        ) : null}

        {loading ? (
          <LoadingSpinner />
        ) : groups.length === 0 ? (
          <EmptyState
            glyph="★"
            tone="hero"
            eyebrow={t('my_job.empty_eyebrow')}
            title={t('my_job.empty_title')}
            message={t('my_job.empty_body')}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {groups.map((g) => (
              <Pressable
                key={g.employerId}
                onPress={() => {
                  haptic('selection');
                  navigation.navigate('MyEmployerJob', {
                    employerId: g.employerId,
                    employerName: g.employerName,
                  });
                }}
                accessibilityRole="button"
              >
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Avatar name={g.employerName} size={44} premium={g.isVerified} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                        {g.employerName}
                      </Text>
                      <Text variant="footnote" tone="secondary">
                        {t('my_job.job_count', { n: g.jobCount })}
                        {g.nextShiftAt
                          ? ` · ${t('my_job.next_shift', {
                              when: new Date(g.nextShiftAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              }),
                            })}`
                          : ''}
                      </Text>
                      {g.awaitingPayment > 0 ? (
                        <Text variant="caption" tone="warning">
                          {t('my_job.awaiting_payment', { n: g.awaitingPayment })}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: theme.text.tertiary, fontSize: 20 }}>›</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text variant="title" weight="semibold" style={{ color: theme.brand.hero }}>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}
