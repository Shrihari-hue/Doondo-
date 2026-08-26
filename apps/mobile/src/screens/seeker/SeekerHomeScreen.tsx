/**
 * SeekerHomeScreen — the worker's tab-1 dashboard, premium blue palette.
 *
 * Sections, top to bottom:
 *   1. Header — Doondo wordmark + notification bell with live badge,
 *      sits below the system status bar with proper safe-area padding
 *   2. Location pill — current city + nearby-jobs count (real, from API)
 *   3. Voice search card — gradient blue CTA → VoiceAgent (the
 *      conversational voice agent; this card replaced the old center
 *      mic FAB when the tab bar moved to six tabs)
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
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii, categoryTints, blue } from '@doondo/tokens';
import { Screen, Text, NotificationsBell, LanguageToggle, FestivalBanner } from '@/components';
import { useFestival } from '@/lib/festivals';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { jobsApi } from '@/api/jobs.api';
import { resolveCoords, type ResolvedCoords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { getSecure, setSecure } from '@/lib/secureStore';
import { useTranslate } from '@/i18n/useTranslate';
import { DenseJobFeed } from './home/DenseJobFeed';
import { AvailabilityBeaconChip } from './home/AvailabilityBeacon';
import { LocalWageWidget } from './home/LocalWageWidget';
import { RecommendedForYouRail } from './home/RecommendedForYouRail';
import { HiredNearbyRail } from './home/HiredNearbyRail';
import { DoondoPulse } from './home/DoondoPulse';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type HomeMode = 'today' | 'this_week' | 'career';
const HOME_MODES: HomeMode[] = ['today', 'this_week', 'career'];
// Each mode maps to a translation key in `home.modes.*`. Resolved at render
// time so the segmented control follows the active locale.
const HOME_MODE_I18N_KEYS: Record<HomeMode, string> = {
  today: 'home.modes.today',
  this_week: 'home.modes.this_week',
  career: 'home.modes.career',
};

/** Local alias matching the one in home/DenseJobFeed for helper signatures. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

type Nav = NativeStackNavigationProp<AppStackParamList>;

// Bengaluru fallback so the screen never feels broken on permission denial.
// Tagged `manual` because it isn't device GPS — the UI uses `source` to show
// a "Detected your area" hint vs. a "Showing default city" hint.

interface Category {
  key: string;
  /** Translation key in `home.categories.*`. Resolved at render time. */
  labelKey: string;
  emoji: string;
  /** Keyword fed into the Jobs tab's text-search box. */
  query: string;
  tint: { bg: string; fg: string };
}

const CATEGORIES: Category[] = [
  { key: 'delivery', labelKey: 'home.categories.delivery', emoji: '🛵', query: 'delivery', tint: categoryTints.delivery },
  { key: 'driver', labelKey: 'home.categories.driver', emoji: '🚗', query: 'driver', tint: categoryTints.driver },
  { key: 'electrician', labelKey: 'home.categories.electrician', emoji: '⚡', query: 'electrician', tint: categoryTints.electrician },
  { key: 'helper', labelKey: 'home.categories.helper', emoji: '🤝', query: 'helper', tint: categoryTints.helper },
  { key: 'mason', labelKey: 'home.categories.mason', emoji: '🧱', query: 'mason', tint: categoryTints.mason },
];

export function SeekerHomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  // Festival Mode — tints the wordmark during a festival window.
  const festival = useFestival();

  const [coords, setCoords] = useState<ResolvedCoords | null>(null);

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

  // Prefer live GPS → the worker's saved location → a flagged default, so
  // the availability beacon never silently publishes at a far-off default
  // city when GPS is unavailable.
  const savedCoords = user?.location?.coordinates ?? null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await resolveCoords(savedCoords);
      if (cancelled) return;
      setCoords(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [savedCoords]);

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
      (coords ? t('home.location.your_area') : t('home.location.locating'))
    );
  }, [user?.location, coords, t]);

  function openVoice() {
    haptic('selection');
    navigation.navigate('VoiceAgent');
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
  // Premium redesign: navy hero card → availability beacon → browse by
  // trade strip → premium job cards. The Career path below is untouched
  // so existing deep-links and the Jobs tab keep behaving as they did.
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
          <PremiumHomeHeader
            theme={theme}
            onNotificationsPress={openNotifications}
            cityLabel={cityLabel}
          />
          <ModeToggle value={mode} onChange={pickMode} t={t} />
        </View>
        <View
          style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md }}
        >
          <DenseJobFeed
            coords={coords}
            mode={mode}
            user={user ?? null}
            onExploreJobs={() =>
              navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never)
            }
          />
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
              // Festival Mode gives the wordmark a seasonal tint.
              color: festival ? festival.accent : theme.brand.hero,
              letterSpacing: -0.5,
            }}
          >
            {festival ? `Doondo ${festival.emoji}` : 'Doondo'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <LanguageToggle />
            <NotificationsBell onPress={openNotifications} />
          </View>
        </View>

        {/* Mode toggle — Today / This week / Career. Renders inline above
           the existing Career sections so a worker who prefers same-day
           gigs can switch with one tap and never see Career again. */}
        <ModeToggle value={mode} onChange={pickMode} t={t} />

        {/* Availability beacon — always available across all three modes
           because broadcasting is orthogonal to which feed the worker is
           browsing. Sits between the toggle and the location pill so it
           reads as a top-priority action. */}
        <AvailabilityBeaconChip coords={coords} user={user ?? null} />

        {/* Festival Mode — a themed banner during festival windows (Diwali,
           Onam, …) linking to the festival job board. Self-hides the rest
           of the year. */}
        <FestivalBanner />

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
            <Feather name="map-pin" size={16} color={theme.brand.hero} />
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
                ? t('home.location.finding_jobs')
                : t(
                    nearbyCount === 1
                      ? 'home.location.nearby_count_one'
                      : 'home.location.nearby_count_other',
                    { count: nearbyCount },
                  )}
            </Text>
          </View>
        </View>

        {/* Doondo Pulse — the worker's momentum snapshot (Doondo Score,
            apply streak, applications in play) + a single next-step
            nudge. Self-hides until the snapshot loads. */}
        <DoondoPulse />

        {/* Local wage band — renders only when we have a trade + city +
            sample size ≥ 5; otherwise self-hides so the home doesn't
            grow placeholder cards. */}
        <LocalWageWidget user={user ?? null} />

        {/* Personalised "for you" rail — driven by /jobs/recommended.
            Self-hides when no scoreable matches exist. */}
        <RecommendedForYouRail />

        {/* "Hired near you today" — anonymised social-proof rail.
            Self-hides when the feed is empty (new city, dormant area). */}
        <HiredNearbyRail />

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
                {t('home.voice_card.title')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 18,
                  color: 'rgba(255,255,255,0.82)',
                }}
              >
                {t('home.voice_card.hint')}
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
              <Feather name="mic" size={26} color="#FFFFFF" />
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
              {t('home.categories_section_label').toUpperCase()}
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
                {t('home.view_all')}
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
                  {t(c.labelKey)}
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
              {t('home.nearby_jobs').toUpperCase()}
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
                {t('home.see_more')}
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
                {t('home.jobs.empty_no_jobs_nearby')}
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
                      {j.employer?.companyName ?? j.employer?.name ?? t('home.jobs.default_employer')}
                      {j.employer?.isVerified ? '  ✓' : ''}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: theme.text.tertiary, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {j.location.city}
                      {j.distanceMeters != null
                        ? ` · ${formatDistance(j.distanceMeters, t)}`
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
                      {formatType(j.type, t)}
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
                    {formatPay(j.pay, t)}
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
                        color: '#FFFFFF',
                      }}
                    >
                      {t('home.jobs.apply_now')}
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
  t,
}: {
  value: HomeMode;
  onChange: (next: HomeMode) => void;
  t: TFn;
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
        const label = t(HOME_MODE_I18N_KEYS[m]);
        // The blue pill background lives on a wrapper View — not on the
        // Pressable's dynamic style function — so RN can't drop it during
        // state transitions the way it was doing previously, leaving
        // white-on-pale-blue text. The Pressable is now transparent and
        // only handles the press feedback.
        return (
          <View
            key={m}
            style={{
              flex: 1,
              borderRadius: radii.pill,
              backgroundColor: active ? '#2563EB' : 'transparent',
              shadowColor: active ? '#2563EB' : 'transparent',
              shadowOpacity: active ? 0.3 : 0,
              shadowRadius: active ? 8 : 0,
              shadowOffset: { width: 0, height: 3 },
              elevation: active ? 3 : 0,
            }}
          >
            <Pressable
              onPress={() => onChange(m)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 6,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
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
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Premium header for the Today/This week branch.
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Doondo                            🔔     │  ← bell in white pill
 *   │ ⌖ Ujire ⌄                                │  ← outline pin + chevron
 *   └──────────────────────────────────────────┘
 *
 * The Career branch keeps its own inline header so its tree is untouched.
 */
function PremiumHomeHeader({
  theme,
  onNotificationsPress,
  cityLabel,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  onNotificationsPress: () => void;
  cityLabel: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: spacing.sm,
          paddingBottom: 2,
        }}
      >
        <Text
          style={{
            fontSize: 30,
            lineHeight: 34,
            fontWeight: '700',
            color: theme.brand.hero,
            letterSpacing: -0.8,
          }}
        >
          Doondo
        </Text>
        {/* Language toggle + bell. The bell is wrapped in a white pill so
           it pops off the canvas the way the mockup shows; the red-dot
           badge already lives inside the NotificationsBell component. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <LanguageToggle />
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.bg.surface,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <NotificationsBell onPress={onNotificationsPress} />
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingBottom: spacing.xs,
        }}
      >
        <Feather name="map-pin" size={15} color={theme.text.secondary} />
        <Text
          style={{
            fontSize: 17,
            lineHeight: 21,
            fontWeight: '600',
            color: theme.text.primary,
          }}
          numberOfLines={1}
        >
          {cityLabel}
        </Text>
        <Feather
          name="chevron-down"
          size={15}
          color={theme.text.secondary}
          style={{ marginLeft: 2 }}
        />
      </View>
    </View>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDistance(m: number, t: TFn): string {
  return m < 1000
    ? t('common.units.meters_short', { n: m })
    : t('common.units.kilometers_short', { n: (m / 1000).toFixed(1) });
}

function formatType(type: PublicJob['type'], t: TFn): string {
  return t(`common.job_type.${type}`);
}

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  // 'en-IN' for lakh/crore grouping — see DenseJobFeed.formatPayPrimary.
  const lo = (pay.amount / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;
  const periodKey =
    pay.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : pay.period === 'day'
        ? 'common.pay_period.suffix_day'
        : pay.period === 'week'
          ? 'common.pay_period.suffix_week'
          : pay.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return hi
    ? `${symbol}${lo}–${hi}${t(periodKey)}`
    : `${symbol}${lo}${t(periodKey)}`;
}
