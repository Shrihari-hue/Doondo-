/**
 * useTranslate — thin wrapper that hands back a `t()` function for the
 * active locale.
 *
 * Calls the global i18next instance directly via `getI18n()` rather than
 * react-i18next's `useTranslation()` hook. Re-renders on locale change
 * come via LocaleContext (and LanguageProvider also remounts the whole
 * subtree on language change by keying on `locale`), so we don't need
 * useTranslation's internal subscription for that.
 *
 * Why we do NOT use useTranslation():
 *   react-i18next's `useTranslation()` has an early-return path when no
 *   i18next instance is available yet. That early return skips several
 *   internal hooks (useState/useEffect/useCallback). On cold start
 *   `LanguageProvider` initialises i18next asynchronously, so the very
 *   first render of any screen that calls `useTranslate()` (e.g.
 *   `BootSplash`) takes the early-return path, and the next render —
 *   once init resolves — runs the full hook list. The shifting hook
 *   count is a rules-of-hooks violation that corrupts React's hook
 *   bookkeeping and crashes downstream callers (e.g. zustand's
 *   `useStore`) with "Cannot read property 'length' of undefined" in
 *   `areHookInputsEqual`. Reading the instance directly keeps our hook
 *   count stable across renders regardless of init state.
 *
 * Usage:
 *   const t = useTranslate();
 *   <Text>{t('home.greeting', { name: user.name })}</Text>
 */
import { useLocale } from './LanguageProvider';

type TFn = (key: string, options?: Record<string, unknown>) => string;

interface I18nLike {
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useTranslate(): TFn {
  // Subscribe to LocaleContext so this component re-renders when the
  // active locale changes. We don't use the value — the subscription is
  // the point.
  useLocale();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reactI18nextMod = require('react-i18next');
    const getI18n = reactI18nextMod?.getI18n as (() => I18nLike | undefined) | undefined;
    const i18n = typeof getI18n === 'function' ? getI18n() : undefined;
    if (i18n?.t) {
      // Bind so any internal `this` references resolve correctly when
      // a caller stores the returned function in a variable.
      return i18n.t.bind(i18n) as unknown as TFn;
    }
  } catch {
    /* fall through to passthrough */
  }
  return (key: string) => key;
}
