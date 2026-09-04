/**
 * SeekerHomeScreen — the worker's Home, organised around one question:
 * what kind of work are you looking for right now?
 *
 * Structure, top to bottom (design/layout.md §1–§3 — one gutter, one
 * left edge, 24px between sections):
 *   1. Header      — Doondo wordmark, language toggle, notification bell
 *   2. Location    — current area + live nearby-job count
 *   3. Greeting    — time-aware, by name
 *   4. Work type   — [Short Term] [Long Term] [Both]. Persistent, and the
 *                    feed below re-sections the instant it changes.
 *   5. Beacon      — broadcast availability (orthogonal to work type)
 *   6. Feed        — Quick Work offers → preferred trades → nearest for
 *                    you → other preferences → more jobs
 *   7. Below the feed — voice search, browse by category, and the
 *      supplementary rails (Pulse, wage band, recommended, hired nearby)
 *
 * The old Today / This week / Career mode toggle is gone: its two
 * short-horizon modes are what Short Term now means, and every widget
 * that used to live behind "Career" is still rendered here, below the
 * job feed, where it supplements rather than competes with it.
 *
 * Every data point is real. No mock numbers, no hardcoded job cards.
 */

import { useEffect, useMemo, useState } from 'react';
import {
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
import { useTranslate } from '@/i18n/useTranslate';
import { useWorkTypeStore, useWorkTypeMode, type WorkTypeMode } from '@/stores/workType.store';
import { AvailabilityBeaconChip } from './home/AvailabilityBeacon';
import { LocalWageWidget } from './home/LocalWageWidget';
import { RecommendedForYouRail } from './home/RecommendedForYouRail';
import { HiredNearbyRail } from './home/HiredNearbyRail';
import { DoondoPulse } from './home/DoondoPulse';
import { WorkTypeSelector } from './home/WorkTypeSelector';
import { WorkTypeFeed } from './home/WorkTypeFeed';
import {
  SEEKER_GUTTER,
  SEEKER_SECTION_GAP,
  SEEKER_TAB_SCROLL_INSET,
} from './onboarding/layout';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

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
  const festival = useFestival();

  const [coords, setCoords] = useState<ResolvedCoords | null>(null);

  // Work type — Short Term by default, persisted on-device. Hydrate once
  // so a returning Long Term worker never sees a flash of the Short Term
  // feed before their preference loads.
  const workTypeMode = useWorkTypeMode();
  const workTypeHydrated = useWorkTypeStore((s) => s.hydrated);
  const setWorkTypeMode = useWorkTypeStore((s) => s.setMode);

  useEffect(() => {
    if (!workTypeHydrated) void useWorkTypeStore.getState().hydrate();
  }, [workTypeHydrated]);

  function pickWorkType(next: WorkTypeMode) {
    void setWorkTypeMode(next);
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

  // Small, separate count query for the location pill — the feed's own
  // query is scoped to its sections, and this line just needs a number.
  const countQuery = useQuery({
    queryKey: ['jobs', 'nearby', coords?.lat, coords?.lng],
    queryFn: () => jobsApi.nearby({ lat: coords!.lat, lng: coords!.lng, radius: 10_000, limit: 20 }),
    enabled: coords !== null,
    staleTime: 60_000,
  });
  const nearbyCount = countQuery.data?.jobs.length ?? 0;

  const cityLabel = useMemo(
    () =>
      user?.location?.city ??
      user?.location?.area ??
      (coords ? t('home.location.your_area') : t('home.location.locating')),
    [user?.location, coords, t],
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('work_type.greeting_morning');
    if (hour < 17) return t('work_type.greeting_afternoon');
    return t('work_type.greeting_evening');
  }, [t]);

  const trades = user?.skills ?? [];

  function openVoice() {
    haptic('selection');
    navigation.navigate('VoiceAgent');
  }

  function openJobsTab(initialQuery?: string) {
    haptic('selection');
    navigation.navigate('SeekerTabs', {
      screen: 'Jobs',
      ...(initialQuery ? { params: { initialQuery } } : {}),
    } as never);
  }

  // Top inset that respects the status bar. On Android, expo-status-bar's
  // translucent=false reserves vertical space already, so we add a smaller
  // pad. On iOS the safe-area inset gives us what we need.
  const topPad = Math.max(insets.top, RNStatusBar.currentHeight ?? 0) + spacing.sm;

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SEEKER_GUTTER,
          paddingTop: topPad,
          paddingBottom: SEEKER_TAB_SCROLL_INSET,
          gap: SEEKER_SECTION_GAP,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={countQuery.isRefetching}
            onRefresh={() => void countQuery.refetch()}
            tintColor={theme.brand.primary}
          />
        }
      >
        {/* 1 — Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            variant="titleLarge"
            weight="semibold"
            style={{
              // Festival Mode gives the wordmark a seasonal tint.
              color: festival ? festival.accent : theme.brand.primary,
              letterSpacing: -0.5,
            }}
          >
            {festival ? `Doondo ${festival.emoji}` : 'Doondo'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <LanguageToggle />
            <NotificationsBell onPress={() => navigation.navigate('Notifications')} />
          </View>
        </View>

        {/* 2 — Location + live nearby count */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radii.pill,
              backgroundColor: theme.brand.primarySubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="map-pin" size={16} color={theme.brand.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
              {cityLabel}
            </Text>
            <Text variant="footnote" tone="secondary">
              {countQuery.isLoading
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

        {/* 3 — Greeting */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="title" weight="semibold" numberOfLines={1}>
            {user?.name ? `${greeting}, ${user.name} 👋` : `${greeting} 👋`}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('work_type.greeting_sub')}
          </Text>
        </View>

        {/* 4 — Work type. The one control that changes what Home is. */}
        <WorkTypeSelector value={workTypeMode} onChange={pickWorkType} t={t} />

        {/* 5 — Availability beacon. Broadcasting is orthogonal to which
            feed the worker is browsing, so it sits above both. */}
        <AvailabilityBeaconChip coords={coords} user={user ?? null} />

        {/* Festival Mode — self-hides outside festival windows. */}
        <FestivalBanner />

        {/* 6 — The feed. Waits for the stored work-type preference so the
            worker never sees the wrong sections flash first. */}
        {workTypeHydrated ? (
          <WorkTypeFeed
            mode={workTypeMode}
            coords={coords}
            trades={trades}
            t={t}
            gutter={SEEKER_GUTTER}
            onEditPreferences={() => {
              haptic('selection');
              navigation.navigate('JobPreferences', { mode: 'edit' });
            }}
            onSelectTrade={(slug) => openJobsTab(slug.replace(/_/g, ' '))}
            onSeeAll={() => openJobsTab()}
          />
        ) : null}

        {/* 7 — Below the feed: everything supplementary. */}
        <Pressable onPress={openVoice} accessibilityRole="button">
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
              overflow: 'hidden',
            }}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="bodyLarge" weight="semibold" tone="onBrand">
                {t('home.voice_card.title')}
              </Text>
              <Text variant="footnote" style={{ color: 'rgba(255,255,255,0.82)' }}>
                {t('home.voice_card.hint')}
              </Text>
            </View>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radii.pill,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.35)',
              }}
            >
              <Feather name="mic" size={26} color={theme.text.onBrand} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Browse by category — the generic counterpart to the personalised
            preferred-trades rail inside the feed. */}
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="body" weight="semibold" style={{ flex: 1 }}>
              {t('home.categories_section_label')}
            </Text>
            <Pressable hitSlop={8} onPress={() => openJobsTab()} accessibilityRole="button">
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.primary }}>
                {t('home.view_all')}
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => openJobsTab(c.query)}
                accessibilityRole="button"
                accessibilityLabel={t(c.labelKey)}
                // Five equal columns — design/layout.md §5.
                style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radii.lg,
                    backgroundColor: c.tint.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
                </View>
                <Text variant="caption" weight="medium" numberOfLines={1}>
                  {t(c.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Momentum snapshot — self-hides until it loads. */}
        <DoondoPulse />

        {/* Local wage band — self-hides without a trade + city + sample. */}
        <LocalWageWidget user={user ?? null} />

        {/* Personalised "for you" rail — self-hides when empty. */}
        <RecommendedForYouRail />

        {/* "Hired near you today" social proof — self-hides when empty. */}
        <HiredNearbyRail />
      </ScrollView>
    </Screen>
  );
}
