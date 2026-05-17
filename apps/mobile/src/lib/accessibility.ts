/**
 * Accessibility settings — text scale + speak-on-tap (TTS).
 *
 * These live in their own provider so screens can pull the active scale
 * and TTS toggle without coupling to the theme system. Stored in
 * secure-store (preference, not secret — but our infra already namespaces
 * preferences there).
 *
 * Text scale: a global multiplier applied via React Native's
 * `Text.defaultProps.allowFontScaling = true` and our own `useTextScale`
 * hook. We DON'T set `I18nManager` or restart the app — the multiplier
 * is read on each render so changes apply immediately.
 *
 * TTS: when on, tapping any block of text speaks it out. Uses
 * `expo-speech` defensively (works without it — silent fallback).
 *
 * Defaults: scale=1.0, tts=false. Older / low-literacy workers can crank
 * the scale to 1.5 (max) from Settings → Accessibility.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSecure, setSecure } from './secureStore';

export const TEXT_SCALE_MIN = 1.0;
export const TEXT_SCALE_MAX = 1.5;
export const TEXT_SCALE_STEPS = [1.0, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALE_STEPS)[number];

interface AccessibilityContextValue {
  textScale: TextScale;
  setTextScale: (s: TextScale) => Promise<void>;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => Promise<void>;
  /** Speak the given string. No-op when TTS is off or expo-speech absent. */
  speak: (text: string, opts?: { lang?: string }) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

/** Read the saved scale. Returns 1.0 if missing or invalid. */
async function loadScale(): Promise<TextScale> {
  const raw = await getSecure('textScale');
  const n = raw ? Number.parseFloat(raw) : NaN;
  if (Number.isFinite(n) && (TEXT_SCALE_STEPS as readonly number[]).includes(n)) {
    return n as TextScale;
  }
  return 1.0;
}

async function loadTts(): Promise<boolean> {
  return (await getSecure('ttsEnabled')) === 'true';
}

function getSpeech(): typeof import('expo-speech') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-speech') as typeof import('expo-speech');
  } catch {
    return null;
  }
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [textScale, setScaleState] = useState<TextScale>(1.0);
  const [ttsEnabled, setTtsState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, t] = await Promise.all([loadScale(), loadTts()]);
      if (cancelled) return;
      setScaleState(s);
      setTtsState(t);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTextScale = useCallback(async (s: TextScale) => {
    setScaleState(s);
    await setSecure('textScale', String(s));
  }, []);

  const setTtsEnabled = useCallback(async (v: boolean) => {
    setTtsState(v);
    await setSecure('ttsEnabled', v ? 'true' : 'false');
  }, []);

  const speak = useCallback(
    (text: string, opts?: { lang?: string }) => {
      if (!ttsEnabled) return;
      const Speech = getSpeech();
      if (!Speech?.speak) return;
      try {
        // Stop any active utterance first — feels more responsive than
        // queueing up tap-tap-tap one after another.
        if (Speech.isSpeakingAsync) {
          void Speech.isSpeakingAsync().then((on) => {
            if (on) Speech.stop().catch(() => undefined);
          });
        }
        Speech.speak(text, { language: opts?.lang ?? 'en-IN', rate: 1.0 });
      } catch {
        /* silent */
      }
    },
    [ttsEnabled],
  );

  const value = useMemo<AccessibilityContextValue>(
    () => ({ textScale, setTextScale, ttsEnabled, setTtsEnabled, speak }),
    [textScale, setTextScale, ttsEnabled, setTtsEnabled, speak],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    // Returning a no-op shape rather than throwing — screens outside the
    // provider (rare; e.g. error boundaries) shouldn't blow up.
    return {
      textScale: 1.0,
      setTextScale: async () => undefined,
      ttsEnabled: false,
      setTtsEnabled: async () => undefined,
      speak: () => undefined,
    };
  }
  return ctx;
}

/** Convenience: returns just the multiplier for `fontSize * scale` math. */
export function useTextScale(): number {
  return useAccessibility().textScale;
}
