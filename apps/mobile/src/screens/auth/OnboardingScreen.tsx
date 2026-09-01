/**
 * OnboardingScreen — 3-slide first-launch walkthrough.
 *
 * Shows ONCE — gated on a flag in expo-secure-store. After the user
 * taps "Get started" on the last slide (or "Skip" anytime), the flag
 * is set and they never see this again on this install.
 *
 * Lives inside the AuthNavigator as the very first screen. After
 * completion we navigate.reset to RolePicker so back-button can't
 * return here.
 *
 * The 3 slides communicate the three things a worker most needs to
 * understand before they can use the app:
 *   1. Find work by voice — most powerful, least obvious feature
 *   2. Apply in one tap — friction is zero
 *   3. Get paid + rated — trust loop
 */

import { useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, DoondoMark } from '@/components';
import { setSecure } from '@/lib/secureStore';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  icon: FeatherIconName;
  eyebrowKey: string;
  titleKey: string;
  bodyKey: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'mic',
    eyebrowKey: 'auth.onboarding.slide1_eyebrow',
    titleKey: 'auth.onboarding.slide1_title',
    bodyKey: 'auth.onboarding.slide1_body',
  },
  {
    icon: 'zap',
    eyebrowKey: 'auth.onboarding.slide2_eyebrow',
    titleKey: 'auth.onboarding.slide2_title',
    bodyKey: 'auth.onboarding.slide2_body',
  },
  {
    icon: 'star',
    eyebrowKey: 'auth.onboarding.slide3_eyebrow',
    titleKey: 'auth.onboarding.slide3_title',
    bodyKey: 'auth.onboarding.slide3_body',
  },
];

const ONBOARDING_SEEN_KEY = 'onboardingSeen';

export function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (i !== index) {
      setIndex(i);
      haptic('selection');
    }
  }

  function next() {
    haptic('selection');
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * SCREEN_WIDTH, animated: true });
    } else {
      void finish();
    }
  }

  async function finish() {
    haptic('success');
    try {
      await setSecure(ONBOARDING_SEEN_KEY, 'true');
    } catch {
      // Persisting failed; not fatal — worst case they see the
      // walkthrough again on next launch.
    }
    // Reset so back can't return here.
    navigation.reset({ index: 0, routes: [{ name: 'RolePicker' }] });
  }

  function skip() {
    haptic('light');
    void finish();
  }

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={theme.brand.primaryImmersiveGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {/* Top bar: brand wordmark + Skip */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <DoondoMark size={22} color={theme.text.onBrand} accent="#FFFFFF" />
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.onBrand,
                letterSpacing: -0.5,
              }}
            >
              {t('auth.onboarding.brand')}
            </Text>
          </View>
          <Pressable onPress={skip} hitSlop={12}>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
              {t('auth.onboarding.skip')}
            </Text>
          </Pressable>
        </View>

        {/* Slides — horizontal pager */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {SLIDES.map((s, i) => (
            <SlideView key={i} slide={s} t={t} />
          ))}
        </ScrollView>

        {/* Pager dots */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            marginBottom: spacing.xl,
          }}
        >
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === index ? 28 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </View>

        {/* CTA */}
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
          <Pressable
            onPress={next}
            style={({ pressed }) => ({
              backgroundColor: '#FFFFFF',
              paddingVertical: spacing.md + 2,
              borderRadius: radii.pill,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: theme.brand.primaryHover,
              }}
            >
              {index === SLIDES.length - 1 ? t('auth.onboarding.get_started') : t('auth.onboarding.next')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function SlideView({ slide, t }: { slide: Slide; t: TFn }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: SCREEN_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
        gap: spacing.xl,
      }}
    >
      <View
        style={{
          width: 140,
          height: 140,
          borderRadius: 70,
          backgroundColor: 'rgba(255,255,255,0.18)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.32)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={slide.icon} size={56} color={theme.text.onBrand} />
      </View>

      <View style={{ gap: spacing.sm, alignItems: 'center' }}>
        <Text
          style={{
            color: 'rgba(255,255,255,0.78)',
            fontSize: 12,
            fontWeight: '600',
            letterSpacing: 1.8,
          }}
        >
          {t(slide.eyebrowKey)}
        </Text>
        <Text
          style={{
            color: theme.text.onBrand,
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '700',
            textAlign: 'center',
            letterSpacing: -0.5,
            paddingHorizontal: spacing.lg,
          }}
        >
          {t(slide.titleKey)}
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 15,
            lineHeight: 22,
            textAlign: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          {t(slide.bodyKey)}
        </Text>
      </View>
    </View>
  );
}

/**
 * Helper for AuthNavigator to decide whether to show OnboardingScreen
 * as the initial route. Returns true if the user has already seen it.
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const { getSecure } = await import('@/lib/secureStore');
    const v = await getSecure(ONBOARDING_SEEN_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}
