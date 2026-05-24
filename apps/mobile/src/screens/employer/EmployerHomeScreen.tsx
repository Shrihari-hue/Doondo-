/**
 * EmployerHomeScreen — the employer command center (Phase E1).
 *
 * Answers "what needs me now?" without the employer hunting:
 *   - a greeting with the business identity
 *   - the one nudge — the single most important prompt right now
 *   - a pulse strip of live counts (active jobs · new applicants · hired)
 *   - the applicants waiting on the employer, oldest first
 *   - a persistent Post-a-job CTA
 *
 * Built entirely on the shared jobs + applications modules — no new
 * backend. This is the Home tab of the 5-tab employer navigator.
 */

import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function EmployerHomeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }),
    staleTime: 30_000,
  });

  const appsQuery = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 100 }),
    staleTime: 30_000,
  });

  const activeJobs = jobsQuery.data?.jobs ?? [];
  const applications = useMemo(
    () => appsQuery.data?.applications ?? [],
    [appsQuery.data],
  );

  const pending = useMemo(
    () => applications.filter((a) => a.status === 'pending'),
    [applications],
  );
  const hiredCount = useMemo(
    () => applications.filter((a) => a.status === 'hired').length,
    [applications],
  );

  // Applicants waiting on the employer — oldest application first, so the
  // ones closest to the anti-ghost SLA surface at the top.
  const waiting = useMemo(
    () =>
      [...pending].sort(
        (a, b) =>
          new Date(a.timeline.appliedAt).getTime() -
          new Date(b.timeline.appliedAt).getTime(),
      ),
    [pending],
  );
  const waitingOverDay = waiting.filter(
    (a) => Date.now() - new Date(a.timeline.appliedAt).getTime() > DAY_MS,
  ).length;

  const loading = jobsQuery.isLoading || appsQuery.isLoading;
  const refreshing = jobsQuery.isRefetching || appsQuery.isRefetching;
  const refetch = () => {
    void jobsQuery.refetch();
    void appsQuery.refetch();
  };

  // The one nudge — a single most-important prompt, or nothing.
  let nudge: string | null = null;
  if (waitingOverDay === 1) {
    nudge =
      '1 applicant has been waiting over a day. Review them before they move on.';
  } else if (waitingOverDay > 1) {
    nudge = `${waitingOverDay} applicants have been waiting over a day. Review them before they move on.`;
  } else if (!loading && activeJobs.length === 0) {
    nudge = 'You have no active jobs. Post one to start receiving applicants.';
  }

  return (
    <Screen edges={[]}>
      {/* Gradient greeting header */}
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              {timeGreeting()}
            </Text>
            <Text
              style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}
              numberOfLines={1}
            >
              {user?.name ?? 'Welcome'}
              {user?.isVerified ? '  ✓' : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('Notifications');
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Text style={{ fontSize: 20, color: '#FFFFFF' }}>🔔</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.lg,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refetch}
              tintColor={theme.brand.hero}
            />
          }
        >
          {/* The one nudge */}
          {nudge && (
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                padding: spacing.md,
                borderRadius: radii.lg,
                borderWidth: 0.5,
                borderColor: theme.status.warningBorder,
                backgroundColor: theme.status.warningSubtle,
              }}
            >
              <Text style={{ fontSize: 16 }}>⚡</Text>
              <Text
                variant="footnote"
                weight="medium"
                style={{ flex: 1, color: theme.status.warning, lineHeight: 18 }}
              >
                {nudge}
              </Text>
            </View>
          )}

          {/* Pulse strip */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              label="Active jobs"
              value={activeJobs.length}
              onPress={() => navigation.navigate('EmployerJobs' as never)}
            />
            <StatTile label="New applicants" value={pending.length} />
            <StatTile
              label="Hired"
              value={hiredCount}
              onPress={() => navigation.navigate('Workers' as never)}
            />
          </View>

          {/* Post a job */}
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('PostJob');
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: blue[600],
              paddingVertical: 15,
              borderRadius: radii.pill,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
              + Post a job
            </Text>
          </Pressable>

          {/* Applicants waiting on you */}
          <View style={{ gap: spacing.sm }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.4,
                color: theme.text.tertiary,
              }}
            >
              APPLICANTS WAITING ON YOU
            </Text>
            {waiting.length === 0 ? (
              <View
                style={{
                  padding: spacing.lg,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  backgroundColor: theme.bg.surface,
                  alignItems: 'center',
                }}
              >
                <Text variant="footnote" tone="tertiary">
                  Nobody waiting — you’re all caught up.
                </Text>
              </View>
            ) : (
              waiting.slice(0, 5).map((entry) => (
                <WaitingRow
                  key={entry.id}
                  entry={entry}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('ApplicantDetail', {
                      applicationId: entry.id,
                    });
                  }}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const tileStyle = {
    flex: 1,
    backgroundColor: theme.bg.surface,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center' as const,
  };
  const content = (
    <>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text.primary }}>
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: theme.text.tertiary,
          marginTop: 2,
          fontWeight: '600',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View style={tileStyle}>{content}</View>;
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [tileStyle, { opacity: pressed ? 0.8 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

function WaitingRow({
  entry,
  onPress,
}: {
  entry: ApplicantEntry;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const name = entry.seeker?.name ?? 'Applicant';
  const jobTitle = entry.job?.title ?? 'your job';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Avatar
        name={name}
        photoUrl={entry.seeker?.photoUrl ?? null}
        size={42}
        premium={entry.seeker?.isVerified}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: theme.text.primary }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.text.tertiary }}
          numberOfLines={1}
        >
          Applied to “{jobTitle}” · {timeAgo(entry.timeline.appliedAt)}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
