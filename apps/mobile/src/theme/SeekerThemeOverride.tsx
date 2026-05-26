/**
 * SeekerThemeOverride — locks the theme to `seekerLight` for the seeker
 * navigation subtree.
 *
 * Why a separate provider instead of switching the root ThemeProvider:
 *   - The employer side stays on warm-dark luxe. We only want the
 *     seeker tabs + seeker modal screens (JobDetail, VoiceAgent, etc.)
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
import { StatusBar } from 'expo-status-bar';
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
  //
  // We pin `theme` to the seekerLight tokens so the seeker subtree keeps
  // its blue palette, but we pass `scheme` through from the root provider.
  // That way SettingsScreen — which lives inside this override — can read
  // the user's true light/dark preference and reflect it in the appearance
  // toggle. Without this passthrough, `scheme` would always be
  // 'seekerLight' here, and the Light / Dark rows could never show as
  // active no matter what the user picked.
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes.seekerLight,
      scheme: parent?.scheme ?? 'seekerLight',
      setScheme: parent?.setScheme ?? (() => undefined),
      followSystem: parent?.followSystem ?? (() => undefined),
      isManual: parent?.isManual ?? false,
    }),
    [parent?.scheme, parent?.setScheme, parent?.followSystem, parent?.isManual],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/*
        Force the status bar (time / signal / battery glyphs) to render
        dark-on-light. Without this they'd inherit the root provider's
        'light' style and disappear against our F5F8FC background.

        translucent + backgroundColor handles Android's painted status
        bar so it tints to match the seeker canvas instead of staying
        warm-black from the dark theme below.
      */}
      <StatusBar
        style="dark"
        translucent={false}
        backgroundColor={themes.seekerLight.bg.canvas}
      />
      {children}
    </ThemeContext.Provider>
  );
}
