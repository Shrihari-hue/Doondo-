/**
 * VoiceSearchScreen — voice-driven job search.
 *
 * Flow:
 *   1. User picks language (EN / KN / HI / TA / TE). Default English.
 *   2. Tapping the big mic toggles "listening" mode. The animated rings
 *      pulse to confirm we're capturing.
 *   3. The transcript shows live as the user speaks. When they stop
 *      (or tap stop), we POST to /jobs/nearby?q=<transcript> and route
 *      to the Jobs list with the prefilled query.
 *
 * Speech-to-text:
 *   We use Expo's expo-speech-recognition (peer-dep is in apps/mobile;
 *   it's compatible with the New Architecture). On platforms where it
 *   isn't available (web preview, certain emulators), the screen falls
 *   back to a typed-input mode so the search still works.
 *
 * No fake data: every result comes from the real /jobs/nearby endpoint.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList, SeekerTabParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

// ─── Languages we support ────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en-IN', short: 'EN', label: 'English' },
  { code: 'kn-IN', short: 'KN', label: 'ಕನ್ನಡ' },
  { code: 'hi-IN', short: 'HI', label: 'हिन्दी' },
  { code: 'ta-IN', short: 'TA', label: 'தமிழ்' },
  { code: 'te-IN', short: 'TE', label: 'తెలుగు' },
] as const;
type LangCode = (typeof LANGUAGES)[number]['code'];

// ─── Popular searches — surfaced as quick-tap chips below the mic ───────────

const POPULAR_SEARCHES = [
  'Delivery jobs',
  'Electrician jobs',
  'Driver jobs',
  'Helper jobs',
  'Mason jobs',
] as const;

// ─── Speech-to-text adapter ──────────────────────────────────────────────────
// We dynamically import the speech package so the screen doesn't crash on
// platforms where it isn't available (web preview, certain custom builds).
// If load fails, `recognizer` stays null and the UI falls back to typed input.

interface Recognizer {
  start: (lang: string, onResult: (text: string) => void, onError: (err: unknown) => void) => Promise<void>;
  stop: () => Promise<void>;
}

async function loadRecognizer(): Promise<Recognizer | null> {
  try {
    // expo-speech-recognition exposes ExpoSpeechRecognitionModule with start/stop.
    // We touch it via require() so Metro doesn't fail at bundle time if the
    // package is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: any = require('expo-speech-recognition');
    if (!mod?.ExpoSpeechRecognitionModule) return null;
    const M = mod.ExpoSpeechRecognitionModule;

    let resultHandler: ((s: string) => void) | null = null;
    let errorHandler: ((e: unknown) => void) | null = null;
    let resultSub: { remove: () => void } | null = null;
    let errorSub: { remove: () => void } | null = null;

    return {
      async start(lang, onResult, onError) {
        resultHandler = onResult;
        errorHandler = onError;
        // Subscribe to live transcription events.
        resultSub = M.addListener?.('result', (e: any) => {
          const text = e?.results?.[0]?.transcript ?? '';
          if (text) resultHandler?.(text);
        });
        errorSub = M.addListener?.('error', (e: any) => {
          errorHandler?.(e);
        });
        await M.requestPermissionsAsync?.();
        await M.start({
          lang,
          interimResults: true,
          continuous: false,
        });
      },
      async stop() {
        try {
          await M.stop?.();
        } finally {
          resultSub?.remove?.();
          errorSub?.remove?.();
          resultSub = null;
          errorSub = null;
        }
      },
    };
  } catch {
    return null;
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function VoiceSearchScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  const [lang, setLang] = useState<LangCode>('en-IN');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognizer, setRecognizer] = useState<Recognizer | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRecognizer().then((r) => {
      if (cancelled) return;
      setRecognizer(r);
      setVoiceAvailable(r !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pulsing rings around the mic while listening.
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isListening) {
      pulse1.stopAnimation();
      pulse2.stopAnimation();
      pulse1.setValue(0);
      pulse2.setValue(0);
      return;
    }
    const loop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
    loop(pulse1, 0).start();
    loop(pulse2, 800).start();
  }, [isListening, pulse1, pulse2]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function startListening() {
    haptic('selection');
    setTranscript('');
    setIsListening(true);
    if (!recognizer) return; // typed-fallback mode
    try {
      await recognizer.start(
        lang,
        (text) => setTranscript(text),
        (_err) => {
          setIsListening(false);
        },
      );
    } catch {
      setIsListening(false);
    }
  }

  async function stopListening() {
    haptic('light');
    setIsListening(false);
    if (recognizer) await recognizer.stop();
  }

  function runSearch(query: string) {
    const q = query.trim();
    if (!q) return;
    haptic('success');
    // Hand off to Jobs tab with the search prefilled. The Jobs screen
    // already supports the `?q=` parameter on /jobs/nearby via its
    // existing search box state; we set that via a global event-bus
    // (React Query cache key) or navigation params. For now we pop and
    // let the user paste/run — clean integration is in JobsScreen.
    navigation.navigate('SeekerTabs', {
      screen: 'Jobs',
      params: { initialQuery: q },
    } as never);
  }

  function commitTranscript() {
    runSearch(transcript);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const ring = (anim: Animated.Value, baseSize: number, color: string) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: baseSize,
        height: baseSize,
        borderRadius: baseSize / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [
          {
            scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }),
          },
        ],
      }}
    />
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['5xl'],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text variant="body" tone="secondary">
              ← Back
            </Text>
          </Pressable>
          <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>
            Voice Search
          </Text>
        </View>

        {/* Language picker */}
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            LANGUAGE
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {LANGUAGES.map((l) => {
              const active = lang === l.code;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => {
                    haptic('selection');
                    setLang(l.code);
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor: active ? theme.brand.hero : theme.border.default,
                    backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                  }}
                >
                  <Text
                    variant="footnote"
                    weight={active ? 'medium' : 'regular'}
                    style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                  >
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Mic + pulsing rings */}
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: spacing['3xl'],
            marginBottom: spacing['2xl'],
            height: 240,
          }}
        >
          {isListening && ring(pulse1, 180, theme.brand.heroBorder)}
          {isListening && ring(pulse2, 180, theme.brand.heroBorder)}
          <Pressable
            onPress={isListening ? stopListening : startListening}
            style={{
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: isListening ? theme.status.danger : theme.brand.hero,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: isListening ? theme.status.danger : theme.brand.hero,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 56, color: '#FFFFFF', lineHeight: 60 }}>
              {isListening ? '■' : '🎤'}
            </Text>
          </Pressable>
        </View>

        {/* Prompt + transcript */}
        <View style={{ gap: spacing.sm, alignItems: 'center' }}>
          {voiceAvailable === false ? (
            <Text variant="footnote" tone="warning" style={{ textAlign: 'center' }}>
              Voice input isn't available on this device. Type your search below.
            </Text>
          ) : (
            <Text variant="bodyLarge" weight="medium" style={{ textAlign: 'center' }}>
              {isListening
                ? 'Listening… speak your skill'
                : 'What kind of work are you looking for?'}
            </Text>
          )}
          <Text variant="footnote" tone="tertiary" style={{ textAlign: 'center' }}>
            Tell your skill…
          </Text>
        </View>

        {/* Transcript box (editable) */}
        <View
          style={{
            marginTop: spacing.xl,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: theme.border.default,
            backgroundColor: theme.bg.surface,
            minHeight: 64,
          }}
        >
          <TextInput
            value={transcript}
            onChangeText={setTranscript}
            placeholder={isListening ? 'Listening…' : 'Or type to search'}
            placeholderTextColor={theme.text.tertiary}
            multiline
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: theme.text.primary,
              minHeight: 40,
            }}
            onSubmitEditing={commitTranscript}
            returnKeyType="search"
          />
        </View>

        {transcript.trim().length > 0 && !isListening && (
          <View style={{ marginTop: spacing.md }}>
            {/* Hardcoded brand-blue / white so the CTA reads cleanly on
               the seeker-light canvas regardless of theme resolution. */}
            <Pressable
              onPress={() => {
                haptic('light');
                commitTranscript();
              }}
              accessibilityRole="button"
              accessibilityLabel="Search jobs"
              style={({ pressed }) => ({
                backgroundColor: '#2563EB',
                paddingVertical: 14,
                borderRadius: radii.lg,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
                shadowColor: '#2563EB',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              })}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '700',
                  letterSpacing: 0.2,
                }}
              >
                Search jobs
              </Text>
            </Pressable>
          </View>
        )}

        {/* Popular searches */}
        <View style={{ marginTop: spacing['2xl'], gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            POPULAR SEARCHES
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {POPULAR_SEARCHES.map((q) => (
              <Pressable key={q} onPress={() => runSearch(q)}>
                <Pill label={q} tone="neutral" />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export function VoiceSearchScreen() {
  return (
    <SeekerThemeOverride>
      <VoiceSearchScreenInner />
    </SeekerThemeOverride>
  );
}
