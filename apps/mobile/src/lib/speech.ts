/**
 * Text-to-speech — the voice agent's "voice".
 *
 * A thin wrapper over expo-speech. The native module is loaded with a
 * lazy `require()` (the same pattern used by `biometric.ts` and the
 * SQLite caches) so the bundle still builds, and the voice agent simply
 * degrades to a silent, read-on-screen mode, on any build where the
 * module isn't present — a web preview, an old custom client, etc.
 *
 * Why this matters: a blue-collar worker who can't read the screen
 * relies on the agent speaking back. But a worker on a build without
 * TTS should still get the agent — they just read the reply instead of
 * hearing it. Speech is an enhancement, never a hard dependency.
 */

interface ExpoSpeechModule {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => Promise<void> | void;
}

// `undefined` = not yet probed; `null` = probed, unavailable.
let cached: ExpoSpeechModule | null | undefined;

function load(): ExpoSpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-speech') as Partial<ExpoSpeechModule> | undefined;
    cached = mod && typeof mod.speak === 'function' ? (mod as ExpoSpeechModule) : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** App locale → a BCP-47 voice tag the device TTS engine understands. */
const VOICE_LANG: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
};

/** True when the device can speak text aloud. */
export function isSpeechAvailable(): boolean {
  return load() !== null;
}

export interface SpeakOptions {
  /** App locale (en/hi/ta/te/kn) — mapped to the matching device voice. */
  locale?: string;
  /** Called when speech finishes, is stopped, errors, or TTS is absent. */
  onDone?: () => void;
}

/**
 * Speak one line of text aloud. Any in-progress speech is stopped first
 * so replies never overlap. A no-op (but `onDone` still fires) when the
 * text is empty or TTS is unavailable — callers can treat `onDone` as a
 * reliable "the agent has finished talking" signal.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  const speech = load();
  const line = text.trim();
  if (!speech || !line) {
    opts.onDone?.();
    return;
  }
  try {
    speech.stop();
    speech.speak(line, {
      language: VOICE_LANG[opts.locale ?? 'en'] ?? 'en-IN',
      // Slightly slower than default — clearer for a noisy worksite and
      // for a listener hearing the reply in their second language.
      rate: 0.95,
      onDone: opts.onDone,
      onStopped: opts.onDone,
      onError: opts.onDone,
    });
  } catch {
    opts.onDone?.();
  }
}

/** Stop any in-progress speech immediately. Safe to call when idle. */
export function stopSpeaking(): void {
  const speech = load();
  if (!speech) return;
  try {
    void speech.stop();
  } catch {
    /* best-effort — nothing to do if the engine is already idle */
  }
}
