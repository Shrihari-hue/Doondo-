/**
 * SeekerHomeScreen — the worker's tab-1 dashboard, premium blue palette.
 *
 * Sections, top to bottom:
 *   1. Header — Doondo wordmark + notification bell with live badge,
 *      sits below the system status bar with proper safe-area padding
 *   2. Location pill — current city + nearby-jobs count (real, from API)
 *   3. Voice search card — gradient blue CTA → VoiceSearch
 *   4. Job categories — 5 tile shortcuts with colored emoji backgrounds
 *   5. Nearby jobs — real /jobs/nearby data, capped to 6 here; full list
 *      lives in the Jobs tab.
 *
 * Premium touches:
 *   - Safe-area aware top padding so nothing collides with the status bar
 *   - LinearGradient on the voice card (blue → deeper blue) for depth
 *   - Subtle drop shadow + hairline border on every job card
 *   - Tightened typography hierarchy (display title is heavier)
 *   - Champagne-gold pay amount for premium money-feel
 *
 * Every data point is real. No mock numbers, no hardcoded job cards.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii, categoryTints, blue } from '@doondo/tokens';
import { Screen, Text, NotificationsBell } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { jobsApi } from '@/api/jobs.api';
import { getCurrentCoords, type Coords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { getSecure, setSecure } from '@/lib/secureStore';
import { DenseJobFeed } from './home/DenseJobFeed';
import { AvailabilityBeaconChip } from './home/AvailabilityBeacon';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type HomeMode = 'today' | 'this_week' | 'career';
const HOME_MODES: HomeMode[] = ['today', 'this_week', 'career'];
const HOME_MODE_LABELS: Record<HomeMode, string> = {
  today: 'Today',
  this_week: 'This week',
  career: 'Career',
};

type Nav = NativeStackNavigationProp<AppStackParamList>;

// Bengaluru fallback so the screen never feels broken on permission denial.
// Tagged `manual` because it isn't device GPS — the UI uses `source` to show
// a "Detected your area" hint vs. a "Showing default city" hint.
const FALLBACK_COORDS: Coords = { lat: 12.9716, lng: 77.5946, source: 'manual' };

interface Category {
  key: string;
  label: string;
  emoji: string;
  /** Keyword fed into the Jobs tab's text-search box. */
  query: string;
  tint: { bg: string; fg: string };
}

const CATEGORIES: Category[] = [
  { key: 'delivery', label: 'Delivery', emoji: '🛵', query: 'delivery', tint: categoryTints.delivery },
  { key: 'driver', label: 'Driver', emoji: '🚗', query: 'driver', tint: categoryTints.driver },
  { key: 'electrician', label: 'Electrician', emoji: '⚡', query: 'electrician', tint: categoryTints.electrician },
  { key: 'helper', label: 'Helper', emoji: '🤝', query: 'helper', tint: categoryTints.helper },
  { key: 'mason', label: 'Mason', emoji: '🧱', query: 'mason', tint: categoryTints.mason },
];

export function SeekerHomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [coords, setCoords] = useState<Coords | null>(null);

  // Mode toggle — Today / This week / Career. Default is 'today' for fresh
  // installs (the blue-collar-first experience) but we honour whatever the
  // seeker last picked. Hydrate async so the toggle doesn't flicker.
  const [mode, setMode] = useState<HomeMode>('today');
  const [modeHydrated, setModeHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getSecure('homeMode');
      if (cancelled) return;
      if (stored && (HOME_MODES as string[]).includes(stored)) {
        setMode(stored as HomeMode);
      }
      setModeHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickMode(next: HomeMode) {
    if (next === mode) return;
    haptic('selection');
    setMode(next);
    // Best-effort persistence; failure just means next launch is back to
    // the default, which is fine.
    void setSecure('homeMode', next).catch(() => undefined);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await getCurrentCoords().catch(() => null);
      if (cancelled) return;
      setCoords(c ?? FALLBACK_COORDS);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real nearby-jobs query for the home preview.
  const jobsQuery = useQuery({
    queryKey: ['jobs', 'nearby', coords?.lat, coords?.lng],
    queryFn: () =>
      jobsApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: 10_000,
        limit: 6,
      }),
    enabled: coords !== null,
    staleTime: 60_000,
  });

  const jobs: PublicJob[] = jobsQuery.data?.jobs ?? [];
  const nearbyCount = jobs.length;

  const cityLabel = useMemo(() => {
    return (
      user?.location?.city ??
      user?.location?.area ??
      (coords ? 'Your area' : 'Locating…')
    );
  }, [user?.location, coords]);

  function openVoice() {
    haptic('selection');
    navigation.navigate('VoiceSearch');
  }

  function openCategory(c: Category) {
    haptic('selection');
    navigation.navigate('SeekerTabs', {
      screen: 'Jobs',
      params: { initialQuery: c.query },
    } as never);
  }

  function openJob(j: PublicJob) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId: j.id });
  }

  function openNotifications() {
    navigation.navigate('Notifications');
  }

  // Top inset that respects the status bar. On Android, expo-status-bar's
  // translucent=false reserves vertical space already, so we add a smaller
  // pad. On iOS the safe-area inset gives us what we need.
  const topPad = Math.max(insets.top, RNStatusBar.currentHeight ?? 0) + spacing.sm;

  // ─── Today / This week branch ─────────────────────────────────────────────
  // The Career path below is the original Home screen, untouched. To make
  // sure we never regress it, the non-career modes short-circuit here and
  // render an entirely separate tree (dense feed + trade chips). Toggling
  // back to Career restores the original tree exactly.
  if (modeHydrated && mode !== 'career') {
    return (
      <Screen edges={[]}>
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: topPad,
            gap: spacing.md,
          }}
        >
          <HomeHeader
            theme={theme}
            onNotificationsPress={openNotifications}
            cityLabel={cityLabel}
          />
          <ModeToggle value={mode} onChange={pickMode} />
          <AvailabilityBeaconChip coords={coords} user={user ?? null} />
        </View>
        <View
          style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md }}
        >
          <DenseJobFeed coords={coords} mode={mode} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: topPad,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={jobsQuery.isRefetching}
            onRefresh={() => void jobsQuery.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        {/* Header — Doondo wordmark + bell */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: spacing.sm,
            paddingBottom: spacing.xs,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              lineHeight: 30,
              fontWeight: '700',
              color: theme.brand.hero,
              letterSpacing: -0.5,
            }}
          >
            Doondo
          </Text>
          <NotificationsBell onPress={openNotifications} />
        </View>

        {/* Mode toggle — Today / This week / Career. Renders inline above
           the existing Career sections so a worker who prefers same-day
           gigs can switch with one tap and never see Career again. */}
        <ModeToggle value={mode} onChange={pickMode} />

        {/* Availability beacon — always available across all three modes
           because broadcasting is orthogonal to which feed the worker is
           browsing. Sits between the toggle and the location pill so it
           reads as a top-priority action. */}
        <AvailabilityBeaconChip coords={coords} user={user ?? null} />

        {/* Location pill */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.xs,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.brand.heroSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16 }}>📍</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 18,
                lineHeight: 22,
                fontWeight: '600',
                color: theme.text.primary,
              }}
            >
              {cityLabel}
            </Text>
            <Text
              variant="footnote"
              style={{ color: theme.text.secondary, marginTop: 1 }}
            >
              {jobsQuery.isLoading
                ? 'Finding nearby jobs…'
                : `${nearbyCount} nearby ${nearbyCount === 1 ? 'job' : 'jobs'}`}
            </Text>
          </View>
        </View>

        {/* Voice search hero card — gradient + shadow for premium depth */}
        <Pressable onPress={openVoice}>
          <LinearGradient
            colors={[blue[600], blue[700], blue[800]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              padding: spacing.lg,
              borderRadius: radii.xl,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              shadowColor: blue[700],
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.32,
              shadowRadius: 22,
              elevation: 10,
              overflow: 'hidden',
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  fontSize: 19,
                  lineHeight: 24,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  letterSpacing: -0.2,
                }}
              >
                Find jobs through voice
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: 'rgba(255,255,255,0.82)',
                }}
              >
                Tell us what work you want
              </Text>
            </View>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.35)',
              }}
            >
              <Text style={{ fontSize: 28, color: '#FFFFFF' }}>🎤</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Categories */}
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                lineHeight: 14,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              JOB CATEGORIES
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never)}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.brand.hero,
                }}
              >
                View all
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => openCategory(c)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 16,
                    backgroundColor: c.tint.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: c.tint.fg,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
                </View>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: theme.text.primary,
                  }}
                  numberOfLines={1}
                >
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Nearby jobs */}
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                lineHeight: 14,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              NEARBY JOBS
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never)}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.brand.hero,
                }}
              >
                See more
              </Text>
            </Pressable>
          </View>

          {jobsQuery.isLoading && (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.brand.hero} />
            </View>
          )}

          {!jobsQuery.isLoading && jobs.length === 0 && (
            <View
              style={{
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.border.default,
              }}
            >
              <Text variant="body" tone="secondary">
                No jobs near you right now. Pull to refresh.
              </Text>
            </View>
          )}

          {jobs.map((j) => (
            <Pressable key={j.id} onPress={() => openJob(j)}>
              <View
                style={{
                  padding: spacing.lg,
                  borderRadius: radii.lg,
                  backgroundColor: theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  gap: spacing.md,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  elevation: 2,
                }}
              >
                {/* Title row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        fontSize: 17,
                        lineHeight: 22,
                        fontWeight: '600',
                        color: theme.text.primary,
                      }}
                      numberOfLines={1}
                    >
                      {j.title}
                    </Text>
                    <Text
                      variant="footnote"
                      style={{ color: theme.text.secondary }}
                      numberOfLines={1}
                    >
                      {j.employer?.companyName ?? j.employer?.name ?? 'Doondo Employer'}
                      {j.employer?.isVerified ? '  ✓' : ''}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: theme.text.tertiary, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {j.location.city}
                      {j.distanceMeters != null
                        ? ` · ${formatDistance(j.distanceMeters)}`
                        : ''}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radii.pill,
                      backgroundColor: theme.bg.muted,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '500',
                        color: theme.text.secondary,
                      }}
                    >
                      {formatType(j.type)}
                    </Text>
                  </View>
                </View>

                {/* Pay + apply */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      lineHeight: 22,
                      fontWeight: '700',
                      color: theme.accent.amber,
                    }}
                  >
                    {formatPay(j.pay)}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 8,
                      borderRadius: radii.pill,
                      backgroundColor: theme.brand.hero,
                      shadowColor: theme.brand.hero,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.28,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: '#288f16',
                      }}
                    >
                      Apply Now
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Mode toggle + shared header ─────────────────────────────────────────────

/**
 * The Today / This week / Career segmented control. Renders identically
 * in both branches of the screen (Career ScrollView header and the
 * non-Career fixed top), so the user sees no jump when they switch.
 */
function ModeToggle({
  value,
  onChange,
}: {
  value: HomeMode;
  onChange: (next: HomeMode) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#EFF6FF', // blue-50
        borderRadius: radii.pill,
        padding: 4,
        gap: 4,
      }}
    >
      {HOME_MODES.map((m) => {
        const active = m === value;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityLabel={`${HOME_MODE_LABELS[m]}${active ? ', selected' : ''}`}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 6,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? '#2563EB' : 'transparent',
              opacity: pressed ? 0.85 : 1,
              shadowColor: active ? '#2563EB' : 'transparent',
              shadowOpacity: active ? 0.25 : 0,
              shadowRadius: active ? 8 : 0,
              shadowOffset: { width: 0, height: 2 },
              elevation: active ? 3 : 0,
            })}
          >
            {/* numberOfLines + adjustsFontSizeToFit guarantee that 'This week'
               renders intact on narrow devices instead of being truncated
               to 'This' as it was on the 720-wide screenshot. */}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: active ? '#FFFFFF' : '#1E40AF',
                letterSpacing: 0.1,
                textAlign: 'center',
              }}
            >
              {HOME_MODE_LABELS[m]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The wordmark + notification bell row used by the non-Career branch.
 * The Career branch keeps its own inline header so the original tree is
 * untouched.
 */
function HomeHeader({
  theme,
  onNotificationsPress,
  cityLabel,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onNotificationsPress: () => void;
  cityLabel: string;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: spacing.sm,
          paddingBottom: spacing.xs,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            lineHeight: 30,
            fontWeight: '700',
            color: theme.brand.hero,
            letterSpacing: -0.5,
          }}
        >
          Doondo
        </Text>
        <NotificationsBell onPress={onNotificationsPress} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: theme.brand.heroSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16 }}>📍</Text>
        </View>
        <Text
          style={{
            fontSize: 18,
            lineHeight: 22,
            fontWeight: '600',
            color: theme.text.primary,
          }}
          numberOfLines={1}
        >
          {cityLabel}
        </Text>
      </View>
    </View>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatType(t: PublicJob['type']): string {
  return ({
    full_time: 'Full-time',
    part_time: 'Part-time',
    gig: 'Gig',
    shift: 'Shift',
    contract: 'Contract',
  } as const)[t];
}

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  const lo = (pay.amount / minor).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null;
  const periodMap = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  } as const;
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}
