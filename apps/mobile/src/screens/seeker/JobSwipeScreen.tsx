/**
 * JobSwipeScreen — Tinder-style same-day discovery for Today-mode jobs.
 *
 * Gestures:
 *   - Swipe right → "I'm interested" (calls express-interest, same as
 *     the Today-mode JobDetail CTA)
 *   - Swipe left  → skip (no API call; just advances)
 *   - Swipe up    → save the job for later
 *   - Tap card    → open full JobDetail
 *
 * Visual identity (the V2 redesign):
 *   Each card adopts the visual personality of the job's trade — a
 *   trade-coloured hero gradient, an oversized motif glyph, and a small
 *   circular badge that names the role at a glance. The personality is
 *   resolved by `flavourForJob` (see ./job-swipe/jobFlavour.ts) which
 *   maps the job's first known skill slug (or a keyword in the title)
 *   to a `JobFlavour` token. Adding a new trade is one entry in that
 *   file — the layout below is fully trade-agnostic.
 *
 * Uses react-native-gesture-handler's PanGestureHandler with Reanimated
 * for the snap-back / fly-off animations. Loaded defensively so a build
 * without those deps just doesn't expose the swipe action — JobsScreen
 * still works fine.
 *
 * Data source: /jobs/today (same one the Today tab uses). Bounded to
 * 30 cards per session to keep memory predictable; the worker re-opens
 * if they exhaust the deck.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords, type Coords } from '@/lib/location';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

import { flavourForJob, type JobFlavour } from './job-swipe/jobFlavour';
import { JobHeroScene } from './job-swipe/JobHeroScene';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.25;
const CARD_RADIUS = 24;

function formatPay(p: PublicJob['pay'], t: TFn): string {
  const min = Math.round(p.amount / 100);
  const max = p.amountMax ? Math.round(p.amountMax / 100) : null;
  // 'en-IN' grouping for the lakh/crore comma format Indian users expect.
  const range =
    max && max !== min
      ? `₹${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}`
      : `₹${min.toLocaleString('en-IN')}`;
  const periodKey =
    p.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : p.period === 'day'
        ? 'common.pay_period.suffix_day'
        : p.period === 'week'
          ? 'common.pay_period.suffix_week'
          : p.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return `${range}${t(periodKey)}`;
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const t = useTranslate();

  const [coords, setCoords] = useState<Coords | null>(null);
  useMemo(() => {
    void (async () => {
      const c = await getCurrentCoords().catch(() => null);
      setCoords(
        c ?? { lat: 12.9716, lng: 77.5946, source: 'fallback' as Coords['source'] },
      );
    })();
  }, []);

  const todayQ = useQuery({
    queryKey: ['jobs', 'today', 'swipe', coords?.lat, coords?.lng],
    queryFn: () =>
      jobsApi.today({
        lat: coords!.lat,
        lng: coords!.lng,
        limit: 30,
      }),
    enabled: coords != null,
  });
  const jobs = todayQ.data?.jobs ?? [];

  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const pan = useRef(new Animated.ValueXY()).current;
  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const likeOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const saveOpacity = pan.y.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const interestMut = useMutation({
    mutationFn: (jobId: string) => applicationsApi.expressInterest(jobId),
  });
  const saveMut = useMutation({
    mutationFn: (jobId: string) => jobsApi.save(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', 'saved'] }),
  });

  function advance() {
    pan.setValue({ x: 0, y: 0 });
    setIndex((i) => i + 1);
  }

  function fly(direction: 'left' | 'right' | 'up', after: () => void) {
    const target =
      direction === 'left'
        ? { x: -SCREEN_W * 1.4, y: 0 }
        : direction === 'right'
          ? { x: SCREEN_W * 1.4, y: 0 }
          : { x: 0, y: -SCREEN_H };
    Animated.timing(pan, {
      toValue: target,
      duration: 240,
      useNativeDriver: true,
    }).start(() => {
      after();
      advance();
    });
  }

  // ─── PanResponder wiring ──────────────────────────────────────────
  // PanResponder.create() is captured once via useRef so the handler
  // identity stays stable across renders — but its closures would
  // otherwise pin the FIRST render's `jobs` / `index` / callbacks,
  // which is empty + stale once the query resolves and the user starts
  // swiping. The fix: read everything through live refs that we keep
  // in sync each render below.
  const liveRef = useRef({
    jobs: jobs as PublicJob[],
    index,
    fly,
    interestMut,
    saveMut,
    setSaved,
    navigation,
  });
  liveRef.current = {
    jobs,
    index,
    fly,
    interestMut,
    saveMut,
    setSaved,
    navigation,
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim moves only — taps stay with us via onPanResponderRelease.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      // We also need to claim the touch on start so child Pressables /
      // hero scene can't steal it before a move is detected.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      // Never let iOS yank the responder away mid-gesture (e.g., when
      // a parent ScrollView would otherwise claim it).
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        const live = liveRef.current;
        const job = live.jobs[live.index];
        if (!job) {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          return;
        }
        // Tap (negligible drag) → open detail. We handle taps here
        // instead of using a nested Pressable, which would compete
        // with the PanResponder for the touch on iOS.
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          live.navigation.navigate('JobDetail', { jobId: job.id });
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          return;
        }
        if (g.dx > SWIPE_THRESHOLD) {
          haptic('success');
          live.fly('right', () => live.interestMut.mutate(job.id));
        } else if (g.dx < -SWIPE_THRESHOLD) {
          haptic('selection');
          live.fly('left', () => undefined);
        } else if (g.dy < -SWIPE_THRESHOLD) {
          haptic('selection');
          live.fly('up', () => {
            live.saveMut.mutate(job.id);
            live.setSaved((s) => new Set(s).add(job.id));
          });
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const remaining = jobs.slice(index, index + 3); // top + 2 stacked behind

  return (
    <Screen edges={[]}>
      {/* ─── Header ─────────────────────────────────────────────────────
          Back button lives inside a soft white card to match the
          reference comp — feels like a "control surface" sitting on
          the canvas rather than a flat chrome bar. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.lg,
          gap: spacing.md,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: theme.bg.surface,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 2,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={theme.text.primary}
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            variant="title"
            weight="semibold"
            display
            style={{ color: theme.text.primary }}
          >
            {t('jobs.swipe.title')}
          </Text>
          <Text variant="footnote" style={{ color: theme.text.tertiary }}>
            {t('jobs.swipe.hint')}
          </Text>
        </View>
      </View>

      {/* ─── Deck ───────────────────────────────────────────────────── */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        {todayQ.isLoading ? (
          <LoadingSpinner />
        ) : remaining.length === 0 ? (
          <EmptyState
            glyph="🌙"
            eyebrow={t('jobs.swipe.empty_eyebrow')}
            title={t('jobs.swipe.empty_title')}
            message={t('jobs.swipe.empty_message')}
          />
        ) : (
          remaining.map((job, i) => {
            const isTop = i === 0;
            const flavour = flavourForJob(job);
            const baseTransform = isTop
              ? [
                  { translateX: pan.x as unknown as number },
                  { translateY: pan.y as unknown as number },
                  { rotate: rotate as unknown as string },
                ]
              : [{ translateY: i * 6 }, { scale: 1 - i * 0.04 }];
            return (
              <Animated.View
                key={job.id}
                {...(isTop ? panResponder.panHandlers : {})}
                style={{
                  position: 'absolute',
                  width: SCREEN_W - spacing.xl * 2,
                  height: SCREEN_H * 0.62,
                  borderRadius: CARD_RADIUS,
                  backgroundColor: theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  overflow: 'hidden',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.18,
                  shadowRadius: 22,
                  elevation: 8,
                  transform: baseTransform as never,
                  zIndex: 10 - i,
                }}
              >
                {/* No Pressable wrapper here: it would race the
                    PanResponder for the touch on iOS and swipes would
                    intermittently fail to register. Taps are detected
                    inside onPanResponderRelease via a small-distance
                    threshold and navigate to JobDetail there. */}
                <View style={{ flex: 1 }} pointerEvents="box-none">
                  <CardBody job={job} flavour={flavour} t={t} />
                </View>

                {/* Like / Nope / Save overlays — only top card. */}
                {isTop && (
                  <>
                    <Animated.View
                      style={{
                        position: 'absolute',
                        top: 28,
                        left: 24,
                        opacity: likeOpacity,
                        transform: [{ rotate: '-15deg' }],
                        borderWidth: 3,
                        borderColor: '#10B981',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: '#10B981', fontWeight: '900', fontSize: 24 }}>
                        {t('jobs.swipe.overlay_interested')}
                      </Text>
                    </Animated.View>
                    <Animated.View
                      style={{
                        position: 'absolute',
                        top: 28,
                        right: 24,
                        opacity: nopeOpacity,
                        transform: [{ rotate: '15deg' }],
                        borderWidth: 3,
                        borderColor: '#EF4444',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 24 }}>
                        {t('jobs.swipe.overlay_skip')}
                      </Text>
                    </Animated.View>
                    <Animated.View
                      style={{
                        position: 'absolute',
                        bottom: 96,
                        alignSelf: 'center',
                        opacity: saveOpacity,
                        borderWidth: 3,
                        borderColor: '#2563EB',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: '#2563EB', fontWeight: '900', fontSize: 22 }}>
                        {t('jobs.swipe.overlay_save')}
                      </Text>
                    </Animated.View>
                  </>
                )}
              </Animated.View>
            );
          })
        )}
      </View>

      {/* Big tap buttons — accessibility alternative for swipe gestures. */}
      {jobs[index] && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          }}
        >
          <ActionButton
            iconName="close"
            onPress={() => fly('left', () => undefined)}
            color="#B91C1C"
          />
          <ActionButton
            iconName="star"
            onPress={() => {
              const j = jobs[index];
              if (!j) return;
              fly('up', () => {
                saveMut.mutate(j.id);
                setSaved((s) => new Set(s).add(j.id));
              });
            }}
            color="#2563EB"
          />
          <ActionButton
            iconName="check"
            onPress={() => {
              const j = jobs[index];
              if (!j) return;
              fly('right', () => interestMut.mutate(j.id));
            }}
            color="#047857"
          />
        </View>
      )}
    </Screen>
  );
}

/**
 * CardBody — the per-job content tree. Separated so the swipe screen
 * can compose it inside an animated wrapper without re-running layout
 * work on every gesture frame.
 */
function CardBody({
  job,
  flavour,
  t,
}: {
  job: PublicJob;
  flavour: JobFlavour;
  t: TFn;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      {/* ─── Top: pills + trade glyph badge ───────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingTop: spacing.lg,
          paddingHorizontal: spacing.lg,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.xs,
          }}
        >
          {job.urgent && (
            <Pill label={t('jobs.card.urgent')} tone="warning" leading="⚡" />
          )}
          <Pill label={formatPay(job.pay, t)} tone="warning" />
          {job.safeForWomen && (
            <Pill
              label={t('jobs.card.women_safe')}
              tone="success"
              leading="🛡"
            />
          )}
        </View>

        {/* The "steering wheel in a circle" motif from the reference,
            generalised per-trade via flavour.iconName. */}
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.premium.goldSubtle,
            borderWidth: 0.5,
            borderColor: theme.premium.goldBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons
            name={flavour.iconName}
            size={28}
            color={theme.premium.gold}
          />
        </View>
      </View>

      {/* ─── Title ─────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text
          variant="display"
          weight="semibold"
          display
          style={{ color: theme.text.primary }}
          numberOfLines={1}
        >
          {job.title}
        </Text>
      </View>

      {/* ─── Location with map-pin ────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xs,
        }}
      >
        <MaterialCommunityIcons
          name="map-marker-outline"
          size={16}
          color={theme.text.secondary}
        />
        <Text variant="footnote" style={{ color: theme.text.secondary }}>
          {job.employer?.companyName ??
            job.employer?.name ??
            t('jobs.swipe.fallback_employer')}
          {job.location.area ? ` · ${job.location.area}` : ''}
        </Text>
      </View>

      {/* ─── Champagne accent rule (brand-constant, never theme-flavoured) ─ */}
      <View
        style={{
          marginTop: spacing.md,
          marginHorizontal: spacing.lg,
          width: 32,
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.premium.gold,
        }}
      />

      {/* ─── Description ───────────────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}
      >
        <Text
          numberOfLines={3}
          variant="bodyLarge"
          style={{ color: theme.text.secondary, lineHeight: 24 }}
        >
          {job.description}
        </Text>
      </View>

      {/* ─── Hero scene (fills remainder) ─────────────────────────── */}
      <View style={{ flex: 1, position: 'relative' }}>
        <JobHeroScene flavour={flavour} bottomRadius={CARD_RADIUS} />

        {/* "Tap to see full details ▾" — floating pill near hero bottom.
            Sits inside the card boundaries (overflow: hidden on parent),
            so it never clips weirdly across the rounded corners. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: spacing.lg,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              backgroundColor: theme.bg.surface,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <Text variant="footnote" style={{ color: theme.text.secondary }}>
              {t('jobs.swipe.tap_for_details')}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={14}
              color={theme.text.secondary}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * ActionButton — large tap target for accessibility-mode swipe input.
 * Now icon-driven (instead of ASCII glyphs) so they read crisply on
 * any density and inherit the icon font's perfect optical sizing.
 */
function ActionButton({
  iconName,
  onPress,
  color,
}: {
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        shadowColor: color,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 6,
      })}
    >
      <MaterialCommunityIcons name={iconName} size={30} color={color} />
    </Pressable>
  );
}

export function JobSwipeScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
