/**
 * EmployerVoiceAgentScreen — voice assistant for employers.
 *
 * Employers speak a request ("find me an experienced cook nearby",
 * "show my applicants", "post a new job") and the agent routes them
 * to the right screen or searches available workers.
 *
 * Intents handled client-side (no extra backend required):
 *   - find / search workers → AvailableWorkers
 *   - show applicants / applications → ApplicantsScreen
 *   - post a job → PostJob
 *   - analytics / stats → EmployerAnalytics
 *   - help → help text
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { speak, stopSpeaking } from '@/lib/speech';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

// ─── Speech-to-text adapter (same as seeker screen) ─────────────────────────

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
    const clear = () => { for (const s of subs) s?.remove?.(); subs = []; };
    return {
      async start(lang, onResult, onEnd, onError) {
        subs.push(M.addListener?.('result', (e: any) => {
          const text = e?.results?.[0]?.transcript ?? '';
          if (text) onResult(text);
        }) ?? null);
        subs.push(M.addListener?.('end', () => onEnd()) ?? null);
        subs.push(M.addListener?.('error', () => onError()) ?? null);
        await M.requestPermissionsAsync?.();
        await M.start({ lang, interimResults: true, continuous: false });
      },
      async stop() { try { await M.stop?.(); } finally { clear(); } },
    };
  } catch { return null; }
}

// ─── Intent matching ─────────────────────────────────────────────────────────

type AgentReply = { text: string; action?: () => void };

const INTRO = "Hi! Tell me what you need — for example, 'find me a cook nearby' or 'show my applicants'.";

const EXAMPLES = [
  'Find me a cook',
  'Show my applicants',
  'What can I say?',
];

const HELP_TEXT =
  "You can say things like 'find me an electrician', 'show my applicants', 'post a new job', or 'open analytics'. What do you need?";

function matchIntent(transcript: string, nav: Nav): AgentReply {
  const t = transcript.toLowerCase().trim();

  // applicants
  if (/applicant|application|candidate|pipeline/.test(t)) {
    return {
      text: "Opening your applicants.",
      action: () => nav.navigate('Applicants' as any),
    };
  }
  // post job
  if (/post.*(job|role|position)|hire someone|new job/.test(t)) {
    return {
      text: "Let's post a new job.",
      action: () => nav.navigate('PostJob'),
    };
  }
  // analytics
  if (/analytic|stat|report|insight|data/.test(t)) {
    return {
      text: "Opening analytics.",
      action: () => nav.navigate('EmployerAnalytics' as any),
    };
  }
  // workers / roster
  if (/worker|employee|roster|team|crew|staff/.test(t)) {
    return {
      text: "Opening your workers.",
      action: () => nav.navigate('Workers' as any),
    };
  }
  // find / search available workers
  if (/find|search|look|need|want|hire|available/.test(t)) {
    // Extract what kind of worker they want
    const typeMatch = t.match(
      /(?:find|search|need|want|hire|get)\s+(?:me\s+)?(?:an?\s+)?([a-z ]+?)(?:\s+near|\s+around|\s+in|\s+for|$)/,
    );
    const workerType = typeMatch?.[1]?.trim();
    const replyText = workerType
      ? `Searching for ${workerType} near you.`
      : 'Opening available workers near you.';
    return {
      text: replyText,
      action: () => nav.navigate('AvailableWorkers' as any),
    };
  }
  // help
  if (/help|what can|what.*say|command/.test(t)) {
    return { text: HELP_TEXT };
  }
  // repeat
  if (/repeat|again|say again/.test(t)) {
    return { text: INTRO };
  }

  return {
    text: "Sorry, I didn't catch that. Try saying 'find me a worker', 'show applicants', or 'post a job'.",
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Turn {
  id: string;
  userText: string;
  agentText: string;
  action?: () => void;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function EmployerVoiceAgentScreen() {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();

  const BLUE = '#2563EB';

  const [recognizer, setRecognizer] = useState<Recognizer | null>(null);
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [typed, setTyped] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  const transcriptRef = useRef('');
  const scrollRef = useRef<ScrollView>(null);
  const introSpokenRef = useRef(false);

  // Setup
  useEffect(() => {
    let cancelled = false;
    void loadRecognizer().then((r) => {
      if (cancelled) return;
      setRecognizer(r);
      setVoiceAvailable(r !== null);
    });
    if (!introSpokenRef.current) {
      introSpokenRef.current = true;
      speak(INTRO);
    }
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [turns, busy]);

  // Pulsing rings
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isListening) {
      pulse1.stopAnimation(); pulse2.stopAnimation();
      pulse1.setValue(0); pulse2.setValue(0);
      return;
    }
    const loop = (anim: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]));
    loop(pulse1, 0).start();
    loop(pulse2, 800).start();
  }, [isListening, pulse1, pulse2]);

  // Submit
  const sendTranscript = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    stopSpeaking();
    setBusy(true);
    const reply = matchIntent(trimmed, navigation);
    const newTurn: Turn = {
      id: `${Date.now()}-${Math.random()}`,
      userText: trimmed,
      agentText: reply.text,
      action: reply.action,
    };
    setTurns((prev) => [...prev, newTurn]);
    speak(reply.text);
    setBusy(false);
    // Execute navigation action after a short delay so the reply renders first
    if (reply.action) {
      setTimeout(() => { reply.action?.(); }, 900);
    }
  }, [busy, navigation]);

  // Listening control
  const finishListening = useCallback(async () => {
    setIsListening(false);
    if (recognizer) await recognizer.stop();
    const captured = transcriptRef.current.trim();
    setLiveTranscript('');
    transcriptRef.current = '';
    if (captured) void sendTranscript(captured);
  }, [recognizer, sendTranscript]);

  const startListening = useCallback(async () => {
    if (busy) return;
    haptic('selection');
    stopSpeaking();
    setLiveTranscript('');
    transcriptRef.current = '';
    setIsListening(true);
    if (!recognizer) return;
    try {
      await recognizer.start('en-IN',
        (text) => { transcriptRef.current = text; setLiveTranscript(text); },
        () => { void finishListening(); },
        () => { setIsListening(false); },
      );
    } catch { setIsListening(false); }
  }, [busy, recognizer, finishListening]);

  const onMicPress = useCallback(() => {
    if (isListening) { haptic('light'); void finishListening(); }
    else void startListening();
  }, [isListening, finishListening, startListening]);

  const micDisabled = busy;

  const statusText = busy
    ? 'One moment…'
    : isListening
      ? liveTranscript || 'Listening…'
      : 'Tap the mic and speak';

  // Render helpers
  const ring = (anim: Animated.Value, size: number) => (
    <Animated.View style={{
      position: 'absolute', width: size, height: size,
      borderRadius: size / 2, borderWidth: 1.5, borderColor: BLUE,
      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    }} />
  );

  function Bubble({ who, text }: { who: 'you' | 'agent'; text: string }) {
    const mine = who === 'you';
    return (
      <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', marginBottom: spacing.sm }}>
        <Text style={{ fontSize: 11, color: theme.text.tertiary, marginBottom: 2,
          marginLeft: mine ? 0 : 2, textAlign: mine ? 'right' : 'left' }}>
          {mine ? 'You' : 'Doondo'}
        </Text>
        <View style={{
          backgroundColor: mine ? BLUE : theme.bg.surface,
          borderWidth: mine ? 0 : 1, borderColor: theme.border.default,
          borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
        }}>
          <Text style={{ fontSize: 15, color: mine ? '#FFFFFF' : theme.text.primary, lineHeight: 22 }}>
            {text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm,
      }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ fontSize: 15, color: theme.text.secondary }}>Back</Text>
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: theme.text.primary }}>
          Voice assistant
        </Text>
      </View>

      {/* Conversation */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Bubble who="agent" text={INTRO} />
        {turns.map((turn) => (
          <View key={turn.id}>
            <Bubble who="you" text={turn.userText} />
            <Bubble who="agent" text={turn.agentText} />
          </View>
        ))}
        {busy && (
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: spacing.xs }}>
            One moment…
          </Text>
        )}
      </ScrollView>

      {/* Bottom panel */}
      <View style={{
        borderTopWidth: 1, borderTopColor: theme.border.default,
        paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg,
        gap: spacing.sm,
      }}>
        <Text style={{ fontSize: 13, color: theme.text.secondary, textAlign: 'center', minHeight: 18 }}>
          {statusText}
        </Text>

        {voiceAvailable === false ? (
          // Typed fallback
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, textAlign: 'center' }}>
              Voice input isn't available on this device. Type your request instead.
            </Text>
            <View style={{
              borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.lg,
              backgroundColor: theme.bg.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
            }}>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder="Type what you need…"
                placeholderTextColor={theme.text.tertiary}
                style={{ fontSize: 16, color: theme.text.primary, minHeight: 38 }}
                returnKeyType="send"
                onSubmitEditing={() => { const text = typed; setTyped(''); void sendTranscript(text); }}
              />
            </View>
            <Pressable
              onPress={() => { const text = typed; setTyped(''); void sendTranscript(text); }}
              disabled={busy || !typed.trim()}
              style={({ pressed }) => ({
                backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 13,
                alignItems: 'center', opacity: pressed || busy || !typed.trim() ? 0.6 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Send</Text>
            </Pressable>
          </View>
        ) : (
          // Mic button
          <View style={{ alignItems: 'center', justifyContent: 'center', height: 132 }}>
            {isListening && ring(pulse1, 116)}
            {isListening && ring(pulse2, 116)}
            <Pressable
              onPress={onMicPress}
              disabled={micDisabled}
              accessibilityRole="button"
              accessibilityLabel="Voice assistant microphone"
              style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: isListening ? '#EF4444' : micDisabled ? theme.border.default : BLUE,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: isListening ? '#EF4444' : BLUE,
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: micDisabled ? 0 : 0.32,
                shadowRadius: 14, elevation: micDisabled ? 0 : 7,
              }}
            >
              <Text style={{ fontSize: 40, color: '#FFFFFF', lineHeight: 44 }}>
                {isListening ? '■' : '🎤'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Example prompts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs }}>
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => void sendTranscript(example)}
              disabled={busy}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.md, paddingVertical: 6,
                borderRadius: radii.pill, borderWidth: 1,
                borderColor: theme.border.default,
                backgroundColor: isLight ? '#F9FAFB' : '#1F2937',
                opacity: busy || pressed ? 0.5 : 1,
              })}
            >
              <Text style={{ fontSize: 13, color: theme.text.secondary }}>
                {`"${example}"`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
