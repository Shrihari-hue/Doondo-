/**
 * useTranslate — thin wrapper that hands back a `t()` function for the
 * active locale.
 *
 * Prefers react-i18next's hook (so components re-render when the locale
 * changes), but falls back to a passthrough that returns the key when
 * the deps aren't installed yet — see i18n/index.ts for context. That
 * way no screen crashes if a future build forgets to install i18next.
 *
 * Usage:
 *   const t = useTranslate();
 *   <Text>{t('home.greeting', { name: user.name })}</Text>
 */
import { useLocale } from './LanguageProvider';

type TFn = (key: string, options?: Record<string, unknown>) => string;

export function useTranslate(): TFn {
  // Tie the hook into the LocaleContext so it re-evaluates on locale
  // changes even when react-i18next isn't available.
  useLocale();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reactI18nextMod = require('react-i18next');
    if (reactI18nextMod?.useTranslation) {
      const { t } = reactI18nextMod.useTranslation();
      // Cast — react-i18next's t() has overloads we don't need here.
      return t as unknown as TFn;
    }
  } catch {
    /* fall through */
  }
  return (key: string) => key;
}
