/**
 * EmployerHomeScreen — the employer command center.
 *
 * Answers "what needs me now?" without the employer hunting:
 *   - a warm greeting with the business identity and a lifestyle vignette
 *     whose table-lamp silhouette quietly reflects the business type
 *   - the one nudge — the single most important prompt right now
 *   - a pulse strip of live counts (active jobs · new applicants · hired)
 *     with iconified pastel tiles
 *   - a coral-gradient post-a-job CTA
 *   - the applicants waiting on the employer, oldest first
 *   - an empty state celebrating the inbox-zero moment, plus a tip card
 *
 * Renders identically against both light and dark schemes — all colors
 * read from `useTheme().theme` and a small `isLight` derived flag.
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
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue, coral, amber, jade } from '@doondo/tokens';
import {
  Screen,
  Text,
  LoadingSpinner,
  Avatar,
  EmployerHomeIllustration,
} from '@/components';
import type { EmployerVibe } from '@/components/EmployerHomeIllustration';
import type { BusinessType } from '@/api/types';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const DAY_MS = 24 * 60 * 60 * 1000;

export function EmployerHomeScreen() {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
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

  // Pick the illustration vibe. Start from the canonical BusinessType
  // (when set), then — if the type is generic ('individual' / 'other'
  // / 'shop' — i.e. the employer hasn't picked something specific) —
  // look at the dominant skill keyword across their active jobs to
  // promote a blue-collar variant. This is presentation only: no
  // backend field, no migration.
  const employerVibe: EmployerVibe = useMemo(() => {
    const fallback: EmployerVibe = user?.businessType ?? 'individual';
    const candidate = vibeFromJobs(activeJobs.map((j) => j.skills ?? []).flat());
    if (!candidate) return fallback;
    // Specific BusinessType wins over a guessed vibe — don't override a
    // 'restaurant' employer just because they happened to post a driver job.
    const specific: BusinessType[] = ['restaurant', 'salon', 'agency', 'startup', 'enterprise'];
    if (user?.businessType && specific.includes(user.businessType)) return user.businessType;
    return candidate;
  }, [user?.businessType, activeJobs]);

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

  // Header gradient — soft cream-to-white on light, deep warm-dark on dark.
  // The vignette sits on top, theme-tinted from inside the illustration.
  const headerColors: [string, string, string] = isLight
    ? ['#FFFFFF', '#FBF6EE', '#F4E9D8']
    : ['#0C0A0E', '#131216', '#1A1813'];
  const headerTextPrimary = isLight ? '#1A1814' : '#ECE8DF';
  const headerTextSecondary = isLight ? '#57534B' : '#9C988F';

  return (
    <Screen edges={[]}>
      {/* Greeting header with lifestyle vignette */}
      <LinearGradient
        colors={headerColors}
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
          <View style={{ flex: 1, zIndex: 2 }}>
            <Text
              style={{ fontSize: 13, color: headerTextSecondary }}
            >
              {timeGreeting()} 👋
            </Text>
            <Text
              style={{ fontSize: 26, fontWeight: '800', color: headerTextPrimary, marginTop: 2 }}
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
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Feather
              name="bell"
              size={18}
              color={headerTextPrimary}
            />
            {/* Notification dot */}
            <View
              style={{
                position: 'absolute',
                top: 9,
                right: 10,
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: coral[500],
                borderWidth: 1.5,
                borderColor: isLight ? '#FBF6EE' : '#131216',
              }}
            />
          </Pressable>
        </View>

        {/* Vignette anchored to the right side of the header */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: spacing.md,
            top: insets.top + 4,
            opacity: 0.95,
          }}
        >
          <EmployerHomeIllustration
            businessType={employerVibe}
            isLight={isLight}
          />
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

          {/* Pulse strip — iconified pastel stat tiles */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile
              icon="briefcase"
              tint="blue"
              label="Active jobs"
              value={activeJobs.length}
              onPress={() => navigation.navigate('EmployerJobs' as never)}
            />
            <StatTile
              icon="users"
              tint="purple"
              label="New applicants"
              value={pending.length}
            />
            <StatTile
              icon="user-check"
              tint="green"
              label="Hired"
              value={hiredCount}
              onPress={() => navigation.navigate('Workers' as never)}
            />
          </View>

          {/* Post a job — coral gradient CTA */}
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('PostJob');
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: radii.pill,
              overflow: 'hidden',
              opacity: pressed ? 0.9 : 1,
              shadowColor: coral[500],
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            })}
          >
            <LinearGradient
              colors={[coral[400], coral[500], coral[600]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: spacing.md,
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="plus" size={18} color={coral[600]} />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '700',
                }}
              >
                Post a job
              </Text>
              <Feather name="chevron-right" size={20} color="#FFFFFF" />
            </LinearGradient>
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
              <EmptyInboxCard />
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

          {/* Tip card */}
          <TipCard
            text="Tip: Keep your jobs updated to attract the best talent."
            onPress={() => navigation.navigate('EmployerJobs' as never)}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

type StatTint = 'blue' | 'purple' | 'green';

function StatTile({
  icon,
  tint,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: StatTint;
  label: string;
  value: number;
  onPress?: () => void;
}) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';

  // Each tile gets a tint that reads as a colored "chip" badge in light
  // mode and a deep tinted card with a glowing icon in dark mode.
  const tintMap: Record<
    StatTint,
    { lightTileBg: string; lightIconBg: string; lightIconFg: string;
      darkTileBg: string; darkIconBg: string; darkIconFg: string; }
  > = {
    blue: {
      lightTileBg: '#EFF3FB',
      lightIconBg: '#DBEAFE',
      lightIconFg: blue[600],
      darkTileBg: 'rgba(37, 99, 235, 0.10)',
      darkIconBg: 'rgba(37, 99, 235, 0.22)',
      darkIconFg: '#7BB0FF',
    },
    purple: {
      lightTileBg: '#F4F0FB',
      lightIconBg: '#EDE9FE',
      lightIconFg: '#7C3AED',
      darkTileBg: 'rgba(139, 92, 246, 0.10)',
      darkIconBg: 'rgba(139, 92, 246, 0.22)',
      darkIconFg: '#C4B5FD',
    },
    green: {
      lightTileBg: '#EEF7F2',
      lightIconBg: '#DCFCE7',
      lightIconFg: jade[500],
      darkTileBg: 'rgba(34, 197, 94, 0.10)',
      darkIconBg: 'rgba(34, 197, 94, 0.22)',
      darkIconFg: '#86EFAC',
    },
  };
  const t = tintMap[tint];
  const tileBg = isLight ? t.lightTileBg : t.darkTileBg;
  const iconBg = isLight ? t.lightIconBg : t.darkIconBg;
  const iconFg = isLight ? t.lightIconFg : t.darkIconFg;

  const tileStyle = {
    flex: 1,
    backgroundColor: tileBg,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-start' as const,
    gap: 8,
  };

  const content = (
    <>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={17} color={iconFg} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text.primary }}>
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: theme.text.tertiary,
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

function EmptyInboxCard() {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  return (
    <View
      style={{
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        backgroundColor: isLight ? '#FBF1E6' : theme.bg.surface,
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <EnvelopeWithSparkle isLight={isLight} />
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: theme.text.primary,
          }}
        >
          Nobody waiting —
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.text.secondary,
            marginTop: 2,
          }}
        >
          you’re all caught up.
        </Text>
      </View>
    </View>
  );
}

/**
 * Envelope-with-sparkle empty-state mark — code-only, no asset needed.
 * Three little gold sparkles fan out above an open envelope.
 */
function EnvelopeWithSparkle({ isLight }: { isLight: boolean }) {
  const envBody = isLight ? '#A37958' : '#5F4A35';
  const envFlap = isLight ? '#7E5C3F' : '#3C2C1E';
  const star = amber[isLight ? 400 : 200];
  return (
    <View style={{ width: 56, height: 50 }}>
      {/* Sparkles */}
      {[
        { left: 18, top: 0, size: 8 },
        { left: 30, top: 6, size: 10 },
        { left: 40, top: 2, size: 6 },
      ].map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            transform: [{ rotate: '45deg' }],
            backgroundColor: star,
            borderRadius: 1,
          }}
        />
      ))}
      {/* Envelope body */}
      <View
        style={{
          position: 'absolute',
          left: 6,
          bottom: 0,
          width: 44,
          height: 30,
          borderRadius: 4,
          backgroundColor: envBody,
        }}
      />
      {/* Envelope flap (triangle approximation with rotated square) */}
      <View
        style={{
          position: 'absolute',
          left: 13,
          bottom: 14,
          width: 30,
          height: 30,
          backgroundColor: envFlap,
          transform: [{ rotate: '45deg' }],
          borderTopLeftRadius: 4,
        }}
      />
      {/* Paper peeking out */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          bottom: 18,
          width: 28,
          height: 16,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          backgroundColor: amber[isLight ? 300 : 200],
        }}
      />
    </View>
  );
}

function TipCard({ text, onPress }: { text: string; onPress?: () => void }) {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          haptic('selection');
          onPress();
        }
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        backgroundColor: isLight ? '#FBF1E6' : theme.bg.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isLight ? '#FCE3C7' : 'rgba(224, 167, 68, 0.18)',
        }}
      >
        <Feather
          name="zap"
          size={15}
          color={isLight ? '#B45309' : amber[200]}
        />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: theme.text.secondary,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
      <Feather name="chevron-right" size={18} color={theme.text.tertiary} />
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
      <Feather name="chevron-right" size={20} color={theme.text.tertiary} />
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

/**
 * Map a flat list of job skill slugs to the best illustration vibe.
 *
 * Doondo's job posts carry free-form skill slugs (e.g. "delivery", "mason",
 * "nurse", "kitchen-helper"). We don't have a strict employer-category
 * field, so we sniff the dominant skill family from the employer's own
 * active jobs to pick a more characterful lamp.
 *
 * Returns null when nothing matches — the caller falls back to the
 * employer's businessType.
 */
function vibeFromJobs(skills: string[]): EmployerVibe | null {
  if (skills.length === 0) return null;
  const buckets: Record<EmployerVibe, string[]> = {
    construction: ['mason', 'masonry', 'helper', 'labour', 'labor', 'painter', 'plumber', 'carpenter', 'welder', 'tile', 'construction', 'site'],
    garage: ['mechanic', 'auto', 'garage', 'tyre', 'tire', 'denter', 'puncture'],
    factory: ['factory', 'warehouse', 'packing', 'loading', 'assembly', 'machine-operator', 'godown'],
    delivery: ['delivery', 'rider', 'courier', 'logistics', 'pickup'],
    hospital: ['nurse', 'ward', 'attendant', 'caretaker', 'pharmacy', 'medical', 'hospital', 'clinic'],
    farm: ['farm', 'agri', 'agriculture', 'dairy', 'plantation', 'harvest', 'crop'],
    hotel: ['hotel', 'housekeeping', 'concierge', 'bellboy', 'front-desk', 'receptionist'],
    school: ['teacher', 'tutor', 'school', 'aaya', 'ayah', 'daycare', 'preschool'],
    // Office-style vibes — also keep a few keywords so they can win if jobs hint that way
    restaurant: ['cook', 'chef', 'waiter', 'kitchen', 'kitchen-helper', 'restaurant', 'cafe'],
    salon: ['salon', 'beautician', 'stylist', 'spa', 'barber'],
    shop: ['shop', 'retail', 'cashier', 'sales-boy', 'sales-girl', 'storekeeper'],
    agency: ['security', 'guard', 'agency', 'housekeeping'],
    startup: ['developer', 'engineer', 'designer', 'sales-rep'],
    enterprise: ['executive', 'manager', 'analyst', 'admin'],
    individual: [],
    other: [],
  };

  const counts: Partial<Record<EmployerVibe, number>> = {};
  const lower = skills.map((s) => s.toLowerCase());
  (Object.entries(buckets) as [EmployerVibe, string[]][]).forEach(([vibe, keys]) => {
    for (const k of keys) {
      const hits = lower.filter((s) => s.includes(k)).length;
      if (hits > 0) counts[vibe] = (counts[vibe] ?? 0) + hits;
    }
  });

  let best: EmployerVibe | null = null;
  let bestCount = 0;
  for (const [vibe, n] of Object.entries(counts) as [EmployerVibe, number][]) {
    if (n > bestCount) {
      best = vibe;
      bestCount = n;
    }
  }
  return best;
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
