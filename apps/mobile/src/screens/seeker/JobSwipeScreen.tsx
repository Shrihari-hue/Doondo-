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

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        const job = jobs[index];
        if (!job) {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
          return;
        }
        if (g.dx > SWIPE_THRESHOLD) {
          haptic('success');
          fly('right', () => interestMut.mutate(job.id));
        } else if (g.dx < -SWIPE_THRESHOLD) {
          haptic('selection');
          fly('left', () => undefined);
        } else if (g.dy < -SWIPE_THRESHOLD) {
          haptic('selection');
          fly('up', () => {
            saveMut.mutate(job.id);
            setSaved((s) => new Set(s).add(job.id));
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
            {t('jobs.swipe.title')}
          </Text>
          <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
            {t('jobs.swipe.hint')}
          </Text>
        </View>
      </View>

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
                  height: SCREEN_H * 0.55,
                  borderRadius: 24,
                  backgroundColor: theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  padding: spacing.lg,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.18,
                  shadowRadius: 18,
                  elevation: 8,
                  transform: baseTransform as never,
                  zIndex: 10 - i,
                }}
              >
                <Pressable
                  onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
                  style={{ flex: 1, gap: spacing.sm }}
                >
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {job.urgent && <Pill label={t('jobs.card.urgent')} tone="warning" leading="●" />}
                    {job.safeForWomen && <Pill label={t('jobs.card.women_safe')} tone="success" leading="🛡" />}
                    <Pill label={formatPay(job.pay, t)} tone="warning" />
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text.primary }}>
                    {job.title}
                  </Text>
                  <Text style={{ fontSize: 14, color: theme.text.secondary }}>
                    {job.employer?.companyName ?? job.employer?.name ?? t('jobs.swipe.fallback_employer')}
                    {job.location.area ? ` · ${job.location.area}` : ''}
                  </Text>
                  <Text numberOfLines={5} style={{ fontSize: 13, color: theme.text.secondary, lineHeight: 18 }}>
                    {job.description}
                  </Text>
                  <View style={{ marginTop: 'auto', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
                      {t('jobs.swipe.tap_for_details')}
                    </Text>
                  </View>
                </Pressable>

                {/* Like/Nope/Save overlays — only render on top card */}
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
                        bottom: 28,
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

      {/* Big tap buttons as accessibility alternative for swipes */}
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
            label="✕"
            onPress={() => fly('left', () => undefined)}
            bg="#FEE2E2"
            color="#B91C1C"
          />
          <ActionButton
            label="★"
            onPress={() => {
              const j = jobs[index];
              if (!j) return;
              fly('up', () => {
                saveMut.mutate(j.id);
                setSaved((s) => new Set(s).add(j.id));
              });
            }}
            bg="#DBEAFE"
            color="#2563EB"
          />
          <ActionButton
            label="✓"
            onPress={() => {
              const j = jobs[index];
              if (!j) return;
              fly('right', () => interestMut.mutate(j.id));
            }}
            bg="#D1FAE5"
            color="#047857"
          />
        </View>
      )}
    </Screen>
  );
}

function ActionButton({
  label,
  onPress,
  bg,
  color,
}: {
  label: string;
  onPress: () => void;
  bg: string;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        shadowColor: color,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
      })}
    >
      <Text style={{ fontSize: 28, color, fontWeight: '800' }}>{label}</Text>
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
