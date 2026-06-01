/**
 * Speech-to-text adapter — a thin, optional wrapper around
 * expo-speech-recognition.
 *
 * Extracted from the seeker VoiceAgentScreen so every voice surface
 * (seeker voice job-search, employer Voice Command Posting, …) shares one
 * recogniser implementation instead of copy-pasting it.
 *
 * The module is loaded via require() so the JS bundle still works on a
 * build where the native module isn't present — `loadRecognizer` simply
 * resolves to null there, and the caller falls back to a typed text box.
 * That honest degradation is the whole point: voice is an accelerator,
 * never a hard dependency.
 */

export interface Recognizer {
  /**
   * Begin listening. Streams interim text via `onResult`, fires `onEnd`
   * when recognition stops on its own, and `onError` on failure. The
   * caller stores the latest `onResult` text and submits it on `onEnd`.
   */
  start: (
    lang: string,
    onResult: (text: string) => void,
    onEnd: () => void,
    onError: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Load the recogniser, or null when the native module is unavailable.
 * Never throws — a missing/old module just yields null.
 */
export async function loadRecognizer(): Promise<Recognizer | null> {
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
export const STT_LANG: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
};

/** Resolve an app locale to a recogniser language tag, defaulting to en-IN. */
export function sttLangFor(locale: string): string {
  return STT_LANG[locale] ?? 'en-IN';
}
