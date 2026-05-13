/**
 * SeekerThemeOverride — locks the theme to `seekerLight` for the seeker
 * navigation subtree.
 *
 * Why a separate provider instead of switching the root ThemeProvider:
 *   - The employer side stays on warm-dark luxe. We only want the
 *     seeker tabs + seeker modal screens (JobDetail, VoiceSearch, etc.)
 *     to switch palette.
 *   - The root ThemeProvider stays untouched so existing screens that
 *     use useTheme() inside the employer tree still get the dark palette.
 *   - We re-publish a fresh ThemeContext value with `theme: seekerLight`
 *     so any `useTheme()` call inside this subtree picks it up.
 *
 * Pass-through behavior: setScheme / followSystem still mutate the
 * root provider's state, so a future settings screen can toggle the
 * underlying preference without us swallowing the calls.
 */

import { useContext, useMemo, type ReactNode } from 'react';
import { themes } from '@doondo/tokens';
import { ThemeContext } from './ThemeProvider';
import type { ThemeContextValue } from './types';

interface Props {
  children: ReactNode;
}

export function SeekerThemeOverride({ children }: Props) {
  const parent = useContext(ThemeContext);

  // Fall back to the seekerLight palette directly if the root provider
  // somehow isn't there (e.g. an isolated test render).
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes.seekerLight,
      scheme: 'seekerLight',
      setScheme: parent?.setScheme ?? (() => undefined),
      followSystem: parent?.followSystem ?? (() => undefined),
      isManual: parent?.isManual ?? false,
    }),
    [parent?.setScheme, parent?.followSystem, parent?.isManual],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
