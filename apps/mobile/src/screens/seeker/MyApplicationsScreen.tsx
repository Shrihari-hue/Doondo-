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

import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { ApplicationStatus, PublicApplication } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function MyApplicationsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 30_000,
  });

  const applications = query.data?.applications ?? [];

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
          My Applications
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : query.isError ? (
        <EmptyState
          title="Couldn't load applications"
          message="Check your connection and try again."
          cta={{ label: 'Retry', onPress: () => void query.refetch() }}
        />
      ) : applications.length === 0 ? (
        <EmptyState
          glyph="✉"
          eyebrow="NO APPLICATIONS YET"
          title="You haven't applied to any jobs"
          message="Browse nearby jobs and tap Apply — you'll see every application's status here."
          cta={{
            label: 'Browse jobs',
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
          data={applications}
          keyExtractor={(a) => a.id}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={theme.brand.hero}
            />
          }
          renderItem={({ item }) => (
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
                      {item.job?.title ?? 'Job application'}
                    </Text>
                    <Text
                      style={{ fontSize: 13, color: theme.text.secondary }}
                      numberOfLines={1}
                    >
                      {item.job?.employer?.companyName ?? item.job?.employer?.name ?? 'Employer'}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
                      Applied {formatRelative(item.timeline.appliedAt)}
                    </Text>
                  </View>
                  <StatusPill status={item.status} />
                </View>

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
                      Interview {formatInterviewWhen(item.interview.scheduledFor)}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ApplicationStatus }) {
  const { theme } = useTheme();
  const meta = statusMeta(status, theme);
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
) {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.secondary,
      };
    case 'viewed':
      return {
        label: 'Viewed',
        bg: theme.status.infoSubtle,
        border: theme.status.infoBorder,
        fg: theme.status.info,
      };
    case 'shortlisted':
      return {
        label: 'Shortlisted',
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'rejected':
      return {
        label: 'Not selected',
        bg: theme.status.dangerSubtle,
        border: theme.status.dangerBorder,
        fg: theme.status.danger,
      };
    case 'hired':
      return {
        label: '✓ Hired',
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'withdrawn':
      return {
        label: 'Withdrawn',
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.tertiary,
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
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
