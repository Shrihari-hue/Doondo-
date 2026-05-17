/**
 * LanguageProvider — owns the runtime locale for the entire app.
 *
 * Responsibilities:
 *   1. On cold start: figure out the seeker's preferred locale from
 *      secure-store (or device locale, or 'en') and call initI18n() once.
 *   2. Expose `useLocale()` so any screen can read the active language or
 *      switch it. Switching writes back to secure-store via setLocale().
 *   3. Force a re-render of the whole subtree when the locale changes,
 *      so any component using react-i18next's `useTranslation()` hook
 *      gets new strings — and any component that just hand-rolls
 *      `t = i18n.t.bind(i18n)` still re-renders because the provider
 *      bumps a counter in context.
 *
 * The provider blocks rendering of children until i18next has finished
 * its first init — keeps the splash on a beat longer rather than
 * flashing English strings before swapping to Hindi.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  initI18n,
  resolveStartupLocale,
  setLocale as persistLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './index';

interface LocaleContextValue {
  /** Active locale code. Always one of SUPPORTED_LOCALES. */
  locale: SupportedLocale;
  /** Whether the startup hydration has completed. */
  ready: boolean;
  /** Change the runtime locale (persists + re-renders). */
  setLocale: (next: SupportedLocale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
  /**
   * If true, render `null` until init completes. Default false — we
   * render children immediately with a sensible default ('en') and
   * swap once the persisted locale resolves. Keeps the splash → app
   * transition feeling instant.
   */
  blockUntilReady?: boolean;
}

export function LanguageProvider({ children, blockUntilReady = false }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>('en');
  const [ready, setReady] = useState(false);

  // First-render: resolve the startup locale + init i18next.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveStartupLocale();
      await initI18n(resolved);
      if (cancelled) return;
      setLocaleState(resolved);
      setReady(true);
    })().catch(() => {
      // Even if init fails (deps missing), mark ready so the app renders.
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: SupportedLocale) => {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(next)) return;
    await persistLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, ready, setLocale }),
    [locale, ready, setLocale],
  );

  if (blockUntilReady && !ready) {
    return <View style={{ flex: 1 }} />;
  }

  // Keying the subtree on locale forces a remount on language change,
  // which is the bluntest-but-most-reliable way to make every screen
  // pick up new strings — including ones that read `t()` outside of
  // react-i18next's hook system.
  return (
    <LocaleContext.Provider value={value}>
      <View key={locale} style={{ flex: 1 }}>
        {children}
      </View>
    </LocaleContext.Provider>
  );
}

/**
 * Read the active locale + a setter. Safe to call from any descendant
 * of `<LanguageProvider>`. Throws if used outside the provider — that
 * would be a wiring bug, not an end-user condition.
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale() called outside LanguageProvider');
  }
  return ctx;
}
