/**
 * VoiceAgentScreen — the conversational voice job-search agent.
 *
 * What it is: a worker speaks ("cook jobs near me"), the agent searches
 * real jobs, reads the results back aloud, and the worker applies by
 * voice ("apply to the first one"). It is built for the low-literacy
 * worker who can't comfortably read a job feed — the whole loop, search
 * to apply, can be done by ear.
 *
 * How a turn flows:
 *   1. The mic captures speech; expo-speech-recognition turns it into
 *      text on-device.
 *   2. The text goes to POST /voice-agent/turn, which parses the intent
 *      and runs a real search or a real application.
 *   3. The structured result is turned into a sentence in the worker's
 *      language (the reply text lives in the i18n files) and spoken back
 *      via expo-speech, while the same text + job cards render on screen.
 *
 * Honest degradation: with no speech-recognition module the screen falls
 * back to a typed box; with no text-to-speech the agent simply doesn't
 * speak — the reply is always on screen too. Nothing here is faked: a
 * search hits the live jobs index and an apply is a real application.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords } from '@/lib/location';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoiceAgent, type VoiceConversationTurn } from '@/hooks/useVoiceAgent';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, options?: Record<string, unknown>) => string;

// ─── Speech-to-text adapter ──────────────────────────────────────────────────
// expo-speech-recognition is loaded via require() so the bundle still works
// where it isn't present — the screen then falls back to a typed box.

interface Recognizer {
  start: (
    lang: string,
    onResult: (text: string) => void,
    onEnd: () => void,
    onError: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
}

async function loadRecognizer(): Promise<Recognizer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: any = require('expo-speech-recognition');
    if (!mod?.ExpoSpeechRecognitionModule) return null;
    const M = mod.ExpoSpeechRecognitionModule;

    let subs: Array<{ remove: () => void } | null> = [];
    const clear = () => {
      for (const s of subs) s?.remove?.();
      subs = [];
    };

    return {
      async start(lang, onResult, onEnd, onError) {
        subs.push(
          M.addListener?.('result', (e: any) => {
            const text = e?.results?.[0]?.transcript ?? '';
            if (text) onResult(text);
          }) ?? null,
        );
        subs.push(M.addListener?.('end', () => onEnd()) ?? null);
        subs.push(M.addListener?.('error', () => onError()) ?? null);
        await M.requestPermissionsAsync?.();
        await M.start({ lang, interimResults: true, continuous: false });
      },
      async stop() {
        try {
          await M.stop?.();
        } finally {
          clear();
        }
      },
    };
  } catch {
    return null;
  }
}

/** App locale → the BCP-47 tag the speech recogniser expects. */
const STT_LANG: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
};

// ─── Reply composition ───────────────────────────────────────────────────────
// Turns one structured agent result into the sentence the worker hears and
// reads. Kept in the view layer so all five languages stay in the i18n files.

function composeReply(turns: VoiceConversationTurn[], idx: number, t: TFn): string {
  const { result } = turns[idx]!;
  switch (result.outcome) {
    case 'results': {
      const count = result.jobs.length;
      const job = result.jobs[0]?.title ?? '';
      return count === 1
        ? t('voice_agent.reply.results_one', { job })
        : t('voice_agent.reply.results_many', { count, job });
    }
    case 'no_results':
      return t('voice_agent.reply.no_results');
    case 'applied':
      return t('voice_agent.reply.applied', { job: result.appliedJob?.title ?? '' });
    case 'already_applied':
      return t('voice_agent.reply.already_applied', {
        job: result.appliedJob?.title ?? '',
      });
    case 'apply_failed':
      return t('voice_agent.reply.apply_failed');
    case 'need_search_first':
      return t('voice_agent.reply.need_search_first');
    case 'help':
      return t('voice_agent.reply.help');
    case 'not_understood':
      return t('voice_agent.reply.not_understood');
    case 'repeat': {
      // Re-state the most recent reply that wasn't itself a "repeat".
      for (let i = idx - 1; i >= 0; i--) {
        if (turns[i]!.result.outcome !== 'repeat') return composeReply(turns, i, t);
      }
      return t('voice_agent.reply.nothing_to_repeat');
    }
    default:
      return t('voice_agent.reply.not_understood');
  }
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function distanceLabel(job: PublicJob, t: TFn): string | null {
  if (job.distanceMeters == null) return null;
  return job.distanceMeters < 1000
    ? t('common.units.meters_short', { n: job.distanceMeters })
    : t('common.units.kilometers_short', {
        n: (job.distanceMeters / 1000).toFixed(1),
      });
}

function payLabel(pay: PublicJob['pay'], t: TFn): string {
  // `amount` is in the smallest unit (paise for INR).
  const symbol =
    pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : `${pay.currency} `;
  const lo = (pay.amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })
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
  return `${symbol}${hi ? `${lo}–${hi}` : lo}${t(periodKey)}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function VoiceAgentScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const { locale } = useLocale();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsFailed, setCoordsFailed] = useState(false);
  const [recognizer, setRecognizer] = useState<Recognizer | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [typed, setTyped] = useState('');

  const { turns, busy, error, submit, applyJob } = useVoiceAgent(coords);

  // The latest recognised text, mirrored into a ref so the recogniser's
  // "end" callback can read it without capturing stale state.
  const transcriptRef = useRef('');
  const scrollRef = useRef<ScrollView>(null);
  const spokenCountRef = useRef(0);
  const introSpokenRef = useRef(false);

  // ─── Setup: location + speech-to-text + intro line ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    void getCurrentCoords().then((c) => {
      if (cancelled) return;
      if (c) setCoords({ lat: c.lat, lng: c.lng });
      else setCoordsFailed(true);
    });
    void loadRecognizer().then((r) => {
      if (cancelled) return;
      setRecognizer(r);
      setVoiceAvailable(r !== null);
    });
    if (!introSpokenRef.current) {
      introSpokenRef.current = true;
      speak(t('voice_agent.intro'), { locale });
    }
    return () => {
      cancelled = true;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Speak each new agent reply as it arrives ───────────────────────────────
  useEffect(() => {
    if (turns.length <= spokenCountRef.current) return;
    spokenCountRef.current = turns.length;
    const line = composeReply(turns, turns.length - 1, t);
    speak(line, { locale });
  }, [turns, t, locale]);

  // ─── Keep the conversation scrolled to the newest turn ──────────────────────
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [turns, busy]);

  // ─── Pulsing rings while listening ──────────────────────────────────────────
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

  // ─── Turn submission ────────────────────────────────────────────────────────

  const sendTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      stopSpeaking();
      const turn = await submit(trimmed);
      if (!turn) speak(t('voice_agent.reply.error'), { locale });
    },
    [busy, submit, t, locale],
  );

  // ─── Listening control ──────────────────────────────────────────────────────

  const finishListening = useCallback(async () => {
    setIsListening(false);
    if (recognizer) await recognizer.stop();
    const captured = transcriptRef.current.trim();
    setLiveTranscript('');
    transcriptRef.current = '';
    if (captured) void sendTranscript(captured);
  }, [recognizer, sendTranscript]);

  const startListening = useCallback(async () => {
    if (busy || !coords) return;
    haptic('selection');
    stopSpeaking();
    setLiveTranscript('');
    transcriptRef.current = '';
    setIsListening(true);
    if (!recognizer) return; // typed-fallback mode — nothing to start
    try {
      await recognizer.start(
        STT_LANG[locale] ?? 'en-IN',
        (text) => {
          transcriptRef.current = text;
          setLiveTranscript(text);
        },
        () => {
          void finishListening();
        },
        () => {
          setIsListening(false);
        },
      );
    } catch {
      setIsListening(false);
    }
  }, [busy, coords, recognizer, locale, finishListening]);

  const onMicPress = useCallback(() => {
    if (isListening) {
      haptic('light');
      void finishListening();
    } else {
      void startListening();
    }
  }, [isListening, finishListening, startListening]);

  // ─── Card actions ───────────────────────────────────────────────────────────

  const appliedIds = useMemo(() => {
    const set = new Set<string>();
    for (const turn of turns) {
      const o = turn.result.outcome;
      if ((o === 'applied' || o === 'already_applied') && turn.result.appliedJob) {
        set.add(turn.result.appliedJob.id);
      }
    }
    return set;
  }, [turns]);

  const onCardApply = useCallback(
    async (jobId: string) => {
      if (busy) return;
      haptic('selection');
      stopSpeaking();
      const turn = await applyJob(jobId);
      if (!turn) speak(t('voice_agent.reply.error'), { locale });
    },
    [busy, applyJob, t, locale],
  );

  const onCardOpen = useCallback(
    (jobId: string) => {
      haptic('light');
      navigation.navigate('JobDetail', { jobId });
    },
    [navigation],
  );

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const ring = (anim: Animated.Value, size: number, color: string) => (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
        transform: [
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
        ],
      }}
    />
  );

  function Bubble({ who, text }: { who: 'you' | 'agent'; text: string }) {
    const mine = who === 'you';
    return (
      <View
        style={{
          alignSelf: mine ? 'flex-end' : 'flex-start',
          maxWidth: '86%',
          marginBottom: spacing.sm,
        }}
      >
        <Text
          variant="caption"
          tone="tertiary"
          style={{ marginBottom: 2, marginLeft: mine ? 0 : 2, textAlign: mine ? 'right' : 'left' }}
        >
          {mine ? t('voice_agent.you_label') : t('voice_agent.assistant_label')}
        </Text>
        <View
          style={{
            backgroundColor: mine ? theme.brand.hero : theme.bg.surface,
            borderWidth: mine ? 0 : 1,
            borderColor: theme.border.default,
            borderRadius: radii.lg,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <Text
            variant="body"
            style={{ color: mine ? '#FFFFFF' : theme.text.primary, lineHeight: 22 }}
          >
            {text}
          </Text>
        </View>
      </View>
    );
  }

  function JobResultCard({ job, position }: { job: PublicJob; position: number }) {
    const applied = appliedIds.has(job.id);
    const distance = distanceLabel(job, t);
    return (
      <Pressable
        onPress={() => onCardOpen(job.id)}
        style={{
          borderWidth: 1,
          borderColor: theme.border.default,
          backgroundColor: theme.bg.canvas,
          borderRadius: radii.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: theme.brand.heroSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="footnote" weight="semibold" style={{ color: theme.brand.hero }}>
              {position}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="medium" numberOfLines={2}>
              {job.title}
            </Text>
            {job.employer?.name ? (
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {job.employer.companyName || job.employer.name}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginTop: 4,
              }}
            >
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                {payLabel(job.pay, t)}
              </Text>
              {distance ? (
                <Text variant="footnote" tone="tertiary">
                  {distance}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Pressable
            onPress={() => void onCardApply(job.id)}
            disabled={applied || busy}
            accessibilityRole="button"
            style={{
              flex: 1,
              backgroundColor: applied ? theme.bg.surface : theme.brand.hero,
              borderWidth: applied ? 1 : 0,
              borderColor: theme.border.default,
              borderRadius: radii.md,
              paddingVertical: 9,
              alignItems: 'center',
              opacity: busy && !applied ? 0.6 : 1,
            }}
          >
            <Text
              variant="footnote"
              weight="semibold"
              style={{ color: applied ? theme.text.secondary : '#FFFFFF' }}
            >
              {applied ? t('voice_agent.card_applied') : t('voice_agent.card_apply')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onCardOpen(job.id)}
            accessibilityRole="button"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: theme.border.default,
              borderRadius: radii.md,
              paddingVertical: 9,
              alignItems: 'center',
            }}
          >
            <Text variant="footnote" weight="medium" tone="secondary">
              {t('voice_agent.card_open')}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  // ─── Status line under the mic ──────────────────────────────────────────────
  const statusText = coordsFailed
    ? t('voice_agent.location_failed')
    : !coords
      ? t('voice_agent.getting_location')
      : busy
        ? t('voice_agent.thinking')
        : isListening
          ? liveTranscript || t('voice_agent.listening')
          : t('voice_agent.tap_to_speak');

  const micDisabled = busy || !coords;

  const EXAMPLES: ReadonlyArray<string> = [
    t('voice_agent.example_search'),
    t('voice_agent.example_apply'),
    t('voice_agent.example_help'),
  ];

  return (
    <Screen>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('voice_agent.back')}
          </Text>
        </Pressable>
        <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>
          {t('voice_agent.title')}
        </Text>
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Bubble who="agent" text={t('voice_agent.intro')} />

        {turns.map((turn, idx) => (
          <View key={turn.id}>
            {turn.userText ? <Bubble who="you" text={turn.userText} /> : null}
            <Bubble who="agent" text={composeReply(turns, idx, t)} />
            {turn.result.jobs.length > 0 ? (
              <View style={{ marginBottom: spacing.md }}>
                {turn.result.jobs.map((job, i) => (
                  <JobResultCard key={job.id} job={job} position={i + 1} />
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {busy ? (
          <Text variant="footnote" tone="tertiary" style={{ marginTop: spacing.xs }}>
            {t('voice_agent.thinking')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="footnote" tone="danger" style={{ marginTop: spacing.xs }}>
            {t('voice_agent.reply.error')}
          </Text>
        ) : null}
      </ScrollView>

      {/* Bottom control panel */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.border.default,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
          gap: spacing.sm,
        }}
      >
        <Text
          variant="footnote"
          tone={coordsFailed ? 'danger' : 'secondary'}
          style={{ textAlign: 'center', minHeight: 18 }}
          numberOfLines={2}
        >
          {statusText}
        </Text>

        {voiceAvailable === false ? (
          // ─── Typed fallback (no speech-recognition module) ───────────────
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              {t('voice_agent.mic_unavailable')}
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: theme.border.default,
                borderRadius: radii.lg,
                backgroundColor: theme.bg.surface,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              }}
            >
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder={t('voice_agent.type_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                style={{ fontSize: 16, color: theme.text.primary, minHeight: 38 }}
                returnKeyType="send"
                onSubmitEditing={() => {
                  const text = typed;
                  setTyped('');
                  void sendTranscript(text);
                }}
              />
            </View>
            <Button
              label={t('voice_agent.send')}
              onPress={() => {
                const text = typed;
                setTyped('');
                void sendTranscript(text);
              }}
              disabled={busy || !typed.trim() || !coords}
            />
          </View>
        ) : (
          // ─── Mic button ──────────────────────────────────────────────────
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              height: 132,
            }}
          >
            {isListening && ring(pulse1, 116, theme.brand.heroBorder)}
            {isListening && ring(pulse2, 116, theme.brand.heroBorder)}
            <Pressable
              onPress={onMicPress}
              disabled={micDisabled}
              accessibilityRole="button"
              accessibilityLabel={t('voice_agent.a11y_mic')}
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: isListening
                  ? theme.status.danger
                  : micDisabled
                    ? theme.border.default
                    : theme.brand.hero,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: isListening ? theme.status.danger : theme.brand.hero,
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: micDisabled ? 0 : 0.32,
                shadowRadius: 14,
                elevation: micDisabled ? 0 : 7,
              }}
            >
              <Text style={{ fontSize: 40, color: '#FFFFFF', lineHeight: 44 }}>
                {isListening ? '■' : '🎤'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Example prompts */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: spacing.xs,
          }}
        >
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => void sendTranscript(example)}
              disabled={busy || !coords}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: theme.border.default,
                backgroundColor: theme.bg.surface,
                opacity: busy || !coords ? 0.5 : 1,
              }}
            >
              <Text variant="caption" tone="secondary">
                {`“${example}”`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

export function VoiceAgentScreen() {
  return (
    <SeekerThemeOverride>
      <VoiceAgentScreenInner />
    </SeekerThemeOverride>
  );
}
