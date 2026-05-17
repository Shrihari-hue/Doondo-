/**
 * i18n bootstrap — wires i18next + react-i18next with the seeker's
 * five-language locale set. Translations fall back to English for any
 * key that hasn't been localised yet, so screens that still use raw
 * English strings keep working until a real translator does the pass.
 *
 * Locale persistence lives in expo-secure-store under 'languagePref'.
 * On app start we hydrate from there; if nothing is stored we use the
 * device locale (via expo-localization) when it matches one of our
 * supported languages, otherwise English.
 *
 * Defensive loading — every require() call is wrapped in try/catch so
 * a missing dep (eg. i18next not yet installed in the build) doesn't
 * crash the app. Until the deps are in place, the `t()` helper is a
 * passthrough that returns the key.
 */

import en from './locales/en.json';
import hi from './locales/hi.json';
import kn from './locales/kn.json';
import ta from './locales/ta.json';
import te from './locales/te.json';

export const SUPPORTED_LOCALES = ['en', 'hi', 'kn', 'ta', 'te'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  kn: 'ಕನ್ನಡ (Kannada)',
  ta: 'தமிழ் (Tamil)',
  te: 'తెలుగు (Telugu)',
};

const RESOURCES = {
  en: { translation: en },
  hi: { translation: hi },
  kn: { translation: kn },
  ta: { translation: ta },
  te: { translation: te },
} as const;

interface I18nInstance {
  t: (key: string, options?: Record<string, unknown>) => string;
  changeLanguage: (lng: SupportedLocale) => Promise<unknown>;
  language: string;
}

let i18nInstance: I18nInstance | null = null;
let initPromise: Promise<I18nInstance> | null = null;

/**
 * Initialise i18next exactly once. Safe to call from multiple places
 * (the provider, root index, hot reload); a single in-flight init is
 * shared.
 */
export function initI18n(initialLocale: SupportedLocale = 'en'): Promise<I18nInstance> {
  if (i18nInstance) return Promise.resolve(i18nInstance);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const i18nextMod = require('i18next');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const reactI18nextMod = require('react-i18next');
      const i18next = i18nextMod.default ?? i18nextMod;
      const initReactI18next = reactI18nextMod.initReactI18next;
      await i18next.use(initReactI18next).init({
        resources: RESOURCES,
        lng: initialLocale,
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        compatibilityJSON: 'v4',
        returnNull: false,
      });
      i18nInstance = i18next;
      return i18next;
    } catch {
      // Deps not installed yet (eg. before `pnpm install`). Return a
      // passthrough so screens calling `t('foo.bar')` get "foo.bar"
      // back rather than crashing.
      const fallback: I18nInstance = {
        t: (key: string) => key,
        changeLanguage: async () => undefined,
        language: 'en',
      };
      i18nInstance = fallback;
      return fallback;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Set the active locale. Idempotent. Persists to secure-store so the
 * next launch picks up where the seeker left off.
 */
export async function setLocale(locale: SupportedLocale): Promise<void> {
  const inst = await initI18n();
  await inst.changeLanguage(locale);
  try {
    const { setSecure } = await import('@/lib/secureStore');
    await setSecure('languagePref', locale);
  } catch {
    // best-effort persistence
  }
}

/**
 * Read the saved locale from secure-store, falling back to device
 * locale where it matches one of our supported languages, otherwise
 * English. Used by the app root on cold start.
 */
export async function resolveStartupLocale(): Promise<SupportedLocale> {
  try {
    const { getSecure } = await import('@/lib/secureStore');
    const stored = await getSecure('languagePref');
    if (
      stored &&
      (SUPPORTED_LOCALES as readonly string[]).includes(stored)
    ) {
      return stored as SupportedLocale;
    }
  } catch {
    /* fall through */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Localization = require('expo-localization');
    const locales = Localization.getLocales?.() ?? [];
    for (const l of locales) {
      const code = (l.languageCode ?? '').toLowerCase();
      if ((SUPPORTED_LOCALES as readonly string[]).includes(code)) {
        return code as SupportedLocale;
      }
    }
  } catch {
    /* fall through */
  }
  return 'en';
}
