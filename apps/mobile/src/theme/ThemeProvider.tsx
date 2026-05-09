import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { themes, type ThemeName } from '@doondo/tokens';
import { getSecure, setSecure, deleteSecure } from '@/lib/secureStore';
import type { ThemeContextValue } from './types';

/**
 * ThemeProvider — exposes the active theme tokens to the rest of the app.
 *
 * Behaviour:
 *   - By default, follows the system color scheme.
 *   - The user can override by calling setScheme('dark' | 'light').
 *     The override persists across launches via expo-secure-store.
 *   - followSystem() clears the override and re-tracks the OS scheme.
 *   - Doondo's default is 'dark' (warm dark luxe), so when the system
 *     scheme is null/unknown we resolve to dark, not light.
 *
 * Persisted value is the literal 'dark' or 'light' string — null means
 * "follow system" (the legacy behaviour).
 */

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<ThemeName | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted override on first mount. We don't gate rendering on
  // this — the app can show with the system scheme for a frame, then
  // resolve to the saved choice. Avoids a flash-of-default-screen at boot.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = await getSecure('themePref');
      if (cancelled) return;
      if (raw === 'dark' || raw === 'light') setOverride(raw);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve active scheme: manual override wins, then system, then dark.
  const scheme: ThemeName = override ?? (systemScheme === 'light' ? 'light' : 'dark');

  const setScheme = useCallback((next: ThemeName) => {
    setOverride(next);
    void setSecure('themePref', next).catch(() => undefined);
  }, []);

  const followSystem = useCallback(() => {
    setOverride(null);
    void deleteSecure('themePref').catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[scheme],
      scheme,
      setScheme,
      followSystem,
      isManual: override !== null,
    }),
    [scheme, setScheme, followSystem, override],
  );

  // Suppress an unused-var warning while keeping the hydration effect.
  void hydrated;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
