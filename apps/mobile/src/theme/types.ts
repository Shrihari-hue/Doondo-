import { themes, type ThemeName } from '@doondo/tokens';

type AppTheme = (typeof themes)[ThemeName];

export interface ThemeContextValue {
  /** The full token tree for the active scheme. */
  theme: AppTheme;
  /** Active scheme name — currently 'dark' or 'light'. */
  scheme: ThemeName;
  /** Manually set the scheme (overrides system preference). */
  setScheme: (scheme: ThemeName) => void;
  /** Reset to following the system color scheme. */
  followSystem: () => void;
  /** True when the user has overridden the system scheme. */
  isManual: boolean;
}
