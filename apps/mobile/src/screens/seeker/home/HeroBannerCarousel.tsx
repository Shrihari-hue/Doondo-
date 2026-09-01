/**
 * HeroBannerCarousel — auto-sliding promotional hero at the top of the
 * Home feed.
 *
 * Slides:
 *   0  Explore Jobs      — deep-navy gradient + megaphone (existing hero)
 *   1  Same-day Swipe    — indigo-to-violet gradient + swipe cards visual
 *
 * Behaviour:
 *   • Auto-advances every 4.5 s; timer resets after a manual swipe.
 *   • Infinite-loop: after the last slide wraps back to the first.
 *   • Pagination dots track the active slide.
 *   • Active slide index is kept in a module-level ref so returning to
 *     the Home tab via bottom-nav restores the last position within the
 *     same JS session (no storage needed).
 *   • Respects reduced-motion: if the user has it on, slides cut instead
 *     of animate.
 *
 * Dimensions mirror the existing HeroCard exactly (minHeight 200,
 * borderRadius 20, the same shadow spec) so the carousel is a drop-in.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Pressable,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';
import type { TFn } from './heroBanner.types';

// ─── Session memory ───────────────────────────────────────────────────────────
// Survives tab-switches within the same JS session; resets on cold start.
let _sessionSlide = 0;

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_ADVANCE_MS = 4500;
const SLIDE_ANIM_MS = 380;
const { width: SCREEN_W } = Dimensions.get('window');

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Props {
  onExploreJobs: () => void;
  navigation: Nav;
  t: TFn;
}

export function HeroBannerCarousel({ onExploreJobs, navigation, t }: Props) {
  const { theme } = useTheme();
  const [activeIndex, setActiveIndex] = useState(_sessionSlide);
  const [reducedMotion, setReducedMotion] = useState(false);

  // translateX controls the slide position. We keep it in a ref so
  // the gesture handler can update it synchronously without re-renders.
  const translateX = useRef(new Animated.Value(-_sessionSlide * SCREEN_W)).current;
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last tap time to debounce rapid double-taps on dots/slides.
  const lastTapRef = useRef(0);

  // Gesture tracking
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
  }, []);

  const SLIDE_COUNT = 2;

  // ─── Core slide transition ──────────────────────────────────────────────
  const goToSlide = useCallback(
    (idx: number, animated = true) => {
      const clamped = ((idx % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT;
      _sessionSlide = clamped;
      setActiveIndex(clamped);
      if (animated && !reducedMotion) {
        Animated.timing(translateX, {
          toValue: -clamped * SCREEN_W,
          duration: SLIDE_ANIM_MS,
          useNativeDriver: true,
        }).start();
      } else {
        translateX.setValue(-clamped * SCREEN_W);
      }
    },
    [reducedMotion, translateX],
  );

  // ─── Auto-advance ───────────────────────────────────────────────────────
  const scheduleNext = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      setActiveIndex((cur) => {
        const next = (cur + 1) % SLIDE_COUNT;
        goToSlide(next);
        return next;
      });
    }, AUTO_ADVANCE_MS);
  }, [goToSlide]);

  useEffect(() => {
    scheduleNext();
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [scheduleNext]);

  // ─── Manual swipe (pan gesture on the outer wrapper) ───────────────────
  const handleTouchStart = (x: number) => {
    touchStartX.current = x;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (x: number) => {
    const dx = x - touchStartX.current;
    const dt = Date.now() - touchStartTime.current;
    const isSwipe = Math.abs(dx) > 40 && dt < 400;
    if (!isSwipe) return;
    haptic('selection');
    const dir = dx < 0 ? 1 : -1; // swipe left → next, swipe right → prev
    goToSlide(activeIndex + dir);
    scheduleNext(); // reset auto-timer after manual interaction
  };

  // ─── CTA handlers ──────────────────────────────────────────────────────
  const handleExploreJobs = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) return;
    lastTapRef.current = now;
    haptic('selection');
    onExploreJobs();
  };

  const handleSwiping = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) return;
    lastTapRef.current = now;
    haptic('selection');
    navigation.navigate('JobSwipe');
  };

  return (
    <View
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: theme.brand.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
        elevation: 8,
      }}
      onTouchStart={(e) => handleTouchStart(e.nativeEvent.pageX)}
      onTouchEnd={(e) => handleTouchEnd(e.nativeEvent.pageX)}
      accessibilityRole="adjustable"
      accessibilityLabel={t('home.hero_carousel.a11y_label')}
      accessibilityHint={t('home.hero_carousel.a11y_hint')}
    >
      {/* Slide track */}
      <Animated.View
        style={{
          flexDirection: 'row',
          width: SCREEN_W * SLIDE_COUNT,
          transform: [{ translateX }],
        }}
      >
        {/* Slide 0 — Explore Jobs (existing hero, pixel-identical) */}
        <View style={{ width: SCREEN_W - spacing.xl * 2 }}>
          <ExploreJobsSlide onPress={handleExploreJobs} t={t} />
        </View>

        {/* Slide 1 — Same-day Swipe */}
        <View style={{ width: SCREEN_W - spacing.xl * 2 }}>
          <SameDaySwipeSlide onPress={handleSwiping} t={t} />
        </View>
      </Animated.View>

      {/* Pagination dots */}
      <View
        style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
          <View
            key={i}
            style={{
              width: i === activeIndex ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                i === activeIndex
                  ? theme.text.onBrand
                  : 'rgba(255,255,255,0.38)',
              // Smooth pill-expand on active dot
              ...(reducedMotion ? {} : { transition: 'width 0.3s' }),
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Slide 0: Explore Jobs ────────────────────────────────────────────────────

function ExploreJobsSlide({ onPress, t }: { onPress: () => void; t: TFn }) {
  const { theme } = useTheme();
  return (
    <LinearGradient
      colors={theme.brand.primaryBannerGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.xl,
        minHeight: 200,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 2,
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          {t('home.hero.eyebrow')}
        </Text>
        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: '700',
            color: theme.text.onBrand,
            letterSpacing: -0.5,
            maxWidth: 220,
          }}
        >
          {t('home.hero.headline')}
        </Text>
        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: spacing.xs,
            borderRadius: radii.pill,
            backgroundColor: theme.text.onBrand,
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.22,
            shadowRadius: 10,
            elevation: 4,
          }}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={t('home.hero.cta_a11y')}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View
              style={{
                paddingVertical: 12,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: '800', color: theme.brand.primaryCard, letterSpacing: 0.1 }}
              >
                {t('home.hero.cta')}
              </Text>
              <Text style={{ fontSize: 14, color: theme.brand.primaryCard, fontWeight: '800' }}>→</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Megaphone illustration — identical to existing hero */}
      <View
        style={{
          position: 'absolute',
          right: -20,
          top: 10,
          bottom: 10,
          width: 180,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.85,
        }}
        pointerEvents="none"
      >
        <Text style={{ fontSize: 140, lineHeight: 160 }}>📣</Text>
      </View>
    </LinearGradient>
  );
}

// ─── Slide 1: Same-day Swipe ──────────────────────────────────────────────────

function SameDaySwipeSlide({ onPress, t }: { onPress: () => void; t: TFn }) {
  const { theme } = useTheme();
  return (
    <LinearGradient
      colors={[theme.brand.primary, theme.brand.primary, theme.brand.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.xl,
        minHeight: 200,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        {/* NEW FEATURE badge */}
        <View
          style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: radii.pill,
            backgroundColor: 'rgba(96,165,250,0.28)',
            borderWidth: 0.5,
            borderColor: 'rgba(96,165,250,0.55)',
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: '800',
              letterSpacing: 1.8,
              color: theme.brand.primaryBorder,
            }}
          >
            NEW FEATURE
          </Text>
        </View>

        <Text
          style={{
            fontSize: 24,
            lineHeight: 30,
            fontWeight: '700',
            color: theme.text.onBrand,
            letterSpacing: -0.5,
          }}
        >
          Same-day Swipe
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: 'rgba(255,255,255,0.75)',
            maxWidth: 200,
          }}
        >
          {t('home.hero_swipe.subtitle')}
        </Text>

        {/* Swipe Now CTA */}
        <View
          style={{
            alignSelf: 'flex-start',
            marginTop: spacing.xs,
            borderRadius: radii.pill,
            backgroundColor: theme.brand.primary,
            shadowColor: theme.brand.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={t('home.hero_swipe.cta_a11y')}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View
              style={{
                paddingVertical: 12,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: '800', color: theme.text.onBrand, letterSpacing: 0.1 }}
              >
                {t('home.hero_swipe.cta')}
              </Text>
              <Text style={{ fontSize: 14, color: theme.text.onBrand, fontWeight: '800' }}>→</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* Swipe cards illustration — stacked cards with swipe arrow */}
      <View
        style={{
          position: 'absolute',
          right: 16,
          top: 0,
          bottom: 0,
          width: 130,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        <SwipeIllustration />
      </View>
    </LinearGradient>
  );
}

/**
 * A lightweight inline SVG-style illustration of stacked swipe cards.
 * Built entirely from View primitives — no asset import needed.
 */
function SwipeIllustration() {
  const { theme } = useTheme();
  return (
    <View style={{ width: 110, height: 130, position: 'relative' }}>
      {/* Card 3 — bottom of stack, rotated right */}
      <View
        style={{
          position: 'absolute',
          width: 80,
          height: 100,
          borderRadius: 14,
          backgroundColor: 'rgba(37,99,235,0.45)',
          borderWidth: 1,
          borderColor: 'rgba(96,165,250,0.35)',
          top: 20,
          left: 25,
          transform: [{ rotate: '10deg' }],
        }}
      />
      {/* Card 2 — middle, slight left tilt */}
      <View
        style={{
          position: 'absolute',
          width: 80,
          height: 100,
          borderRadius: 14,
          backgroundColor: 'rgba(29,78,216,0.6)',
          borderWidth: 1,
          borderColor: 'rgba(96,165,250,0.45)',
          top: 12,
          left: 15,
          transform: [{ rotate: '-5deg' }],
        }}
      />
      {/* Card 1 — front card, white-ish */}
      <View
        style={{
          position: 'absolute',
          width: 80,
          height: 100,
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.3)',
          top: 4,
          left: 5,
        }}
      >
        {/* Mini job card content */}
        <View style={{ padding: 10, gap: 6 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>💼</Text>
          </View>
          <View
            style={{
              width: 50,
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          />
          <View
            style={{
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.3)',
            }}
          />
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.22)',
            }}
          />
        </View>
      </View>

      {/* Swipe arrows — the ← ✕ ✓ → row */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: 'rgba(239,68,68,0.25)',
            borderWidth: 1,
            borderColor: 'rgba(239,68,68,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: theme.status.danger }}>✕</Text>
        </View>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: 'rgba(52,211,153,0.25)',
            borderWidth: 1,
            borderColor: 'rgba(52,211,153,0.5)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: theme.success }}>✓</Text>
        </View>
      </View>
    </View>
  );
}
