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
import { ScrollView } from 'react-native-gesture-handler';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { setSecure } from '@/lib/secureStore';
import { haptic } from '@/lib/haptics';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  emoji: string;
  eyebrow: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '🎤',
    eyebrow: 'JUST SPEAK',
    title: 'Find work by voice',
    body:
      "Tell us what you're looking for in your language — English, Kannada, Hindi, Tamil, or Telugu. We do the searching.",
  },
  {
    emoji: '⚡',
    eyebrow: 'ONE TAP',
    title: 'Apply in seconds',
    body:
      'See nearby jobs that match your skills. Tap Apply Now and you’re done. The employer sees your profile right away.',
  },
  {
    emoji: '⭐',
    eyebrow: 'BUILD TRUST',
    title: 'Get hired, get rated',
    body:
      "Every hire shows up in your earnings. After the work's done, you and the employer rate each other — your reputation grows.",
  },
];

const ONBOARDING_SEEN_KEY = 'onboardingSeen';

export function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
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
        colors={[blue[700], blue[600], blue[500]]}
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
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: '#FFFFFF',
              letterSpacing: -0.5,
            }}
          >
            Doondo
          </Text>
          <Pressable onPress={skip} hitSlop={12}>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
              Skip
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
            <SlideView key={i} slide={s} />
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
                color: blue[700],
              }}
            >
              {index === SLIDES.length - 1 ? 'Get started' : 'Next'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function SlideView({ slide }: { slide: Slide }) {
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
        <Text style={{ fontSize: 64 }}>{slide.emoji}</Text>
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
          {slide.eyebrow}
        </Text>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '700',
            textAlign: 'center',
            letterSpacing: -0.5,
            paddingHorizontal: spacing.lg,
          }}
        >
          {slide.title}
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
          {slide.body}
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
