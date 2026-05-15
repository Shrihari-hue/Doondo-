/**
 * EmployerDetailScreen — the public "About this employer" page.
 *
 * Reached two ways:
 *   1. From a JobDetail screen via the "About employer" link.
 *   2. From a chat thread header tap.
 *
 * The trust card a seeker pulls up before deciding to apply. Renders:
 *   - Hero: company name + business type + verified badge + rating
 *   - Stats strip: Jobs · Hires · Member since
 *   - Recent active jobs (tap → JobDetail)
 *
 * No edit affordances here — that lives on the employer's own EmployerProfile
 * tab. This screen is read-only and public.
 */

import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { employersApi, type EmployerProfile } from '@/api/employers.api';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'EmployerDetail'>;

function EmployerDetailInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { userId } = route.params;

  const query = useQuery({
    queryKey: ['employer', userId],
    queryFn: () => employersApi.getProfile(userId),
    staleTime: 60_000,
  });

  const onJobPress = (jobId: string) => {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId });
  };

  if (query.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Screen>
        <EmptyState
          title="Couldn't load employer"
          message="Check your connection and try again."
          cta={{
            label: 'Retry',
            onPress: () => {
              haptic('selection');
              void query.refetch();
            },
          }}
        />
      </Screen>
    );
  }

  const profile = query.data;
  const { employer, stats, recentJobs } = profile;
  const displayName = employer.companyName ?? employer.name;

  return (
    <Screen edges={[]}>
      <FlatList
        data={recentJobs}
        keyExtractor={(j) => j.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
        ListHeaderComponent={
          <Header
            profile={profile}
            insets={insets}
            displayName={displayName}
            onBack={() => navigation.goBack()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            glyph="📭"
            eyebrow="NO ACTIVE JOBS"
            title="No openings right now"
            message={`${displayName} doesn't have any active jobs at the moment. Check back soon.`}
          />
        }
        contentContainerStyle={{
          paddingBottom: spacing['5xl'],
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <JobRow job={item} onPress={() => onJobPress(item.id)} />
          </View>
        )}
        ListFooterComponent={
          stats.jobsCount > stats.activeJobsCount ? (
            <Text
              style={{
                fontSize: 11,
                color: theme.text.tertiary,
                textAlign: 'center',
                marginTop: spacing.lg,
                paddingHorizontal: spacing.xl,
              }}
            >
              {stats.jobsCount - stats.activeJobsCount} older
              {stats.jobsCount - stats.activeJobsCount === 1 ? ' job' : ' jobs'} have been
              filled or closed.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  profile,
  insets,
  displayName,
  onBack,
}: {
  profile: EmployerProfile;
  insets: { top: number };
  displayName: string;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const { employer, stats } = profile;
  const memberSince = formatMemberSince(employer.createdAt);
  const subtitle = [
    employer.businessType ? prettyBusinessType(employer.businessType) : null,
    employer.employerLocation?.city ?? employer.location?.city ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl + spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        {/* Top row — back + title */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={{ fontSize: 22, color: '#FFFFFF' }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}
            numberOfLines={1}
          >
            About employer
          </Text>
        </View>

        {/* Avatar + identity */}
        <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
          <Avatar
            photoUrl={employer.photoUrl ?? null}
            name={displayName}
            size={72}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                flexWrap: 'wrap',
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: '#FFFFFF',
                  letterSpacing: -0.5,
                }}
                numberOfLines={2}
              >
                {displayName}
              </Text>
              {employer.isVerified && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.45)',
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '700' }}>
                    ✓ VERIFIED
                  </Text>
                </View>
              )}
            </View>
            {subtitle ? (
              <Text
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
            {employer.rating ? (
              <View style={{ marginTop: 2 }}>
                <Stars
                  score={employer.rating.avg}
                  count={employer.rating.count}
                  compact
                  style={{ color: '#FFFFFF' }}
                />
              </View>
            ) : (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                No ratings yet
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Stats strip — overlaps hero bottom */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: -spacing.lg,
          marginHorizontal: spacing.xl,
          backgroundColor: theme.bg.surface,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <Stat label="Jobs posted" value={stats.jobsCount} />
        <Divider />
        <Stat label="Hires made" value={stats.hiresCount} />
        <Divider />
        <Stat label="Member" value={memberSince} />
      </View>

      {/* Bio */}
      {profile.employer.bio ? (
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
              marginBottom: spacing.sm,
            }}
          >
            ABOUT
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.text.secondary }}>
            {profile.employer.bio}
          </Text>
        </View>
      ) : null}

      {/* Section label */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
          }}
        >
          ACTIVE JOBS · {stats.activeJobsCount}
        </Text>
      </View>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: theme.text.primary,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: theme.text.tertiary,
          marginTop: 2,
          fontWeight: '500',
          letterSpacing: 0.3,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function Divider() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 0.5,
        marginVertical: spacing.sm,
        backgroundColor: theme.border.subtle,
      }}
    />
  );
}

function JobRow({ job, onPress }: { job: PublicJob; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.7 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {job.title}
          </Text>
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            {formatPay(job.pay)} · {job.location.area ?? job.location.city}
          </Text>
        </View>
        <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
      </View>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function prettyBusinessType(t: string): string {
  // 'restaurant' → 'Restaurant'
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPay(pay: PublicJob['pay']): string {
  const rupees = Math.round(pay.amount / 100);
  const periodLabel: Record<PublicJob['pay']['period'], string> = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  };
  return `₹${rupees.toLocaleString()}${periodLabel[pay.period]}`;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function EmployerDetailScreen() {
  return (
    <SeekerThemeOverride>
      <EmployerDetailInner />
    </SeekerThemeOverride>
  );
}
