import { themes, type ThemeName } from '@doondo/tokens';

type AppTheme = (typeof themes)[ThemeName];

export interface ThemeContextValue {
  /**
   * The full token tree for the active palette.
   *
   * Three palettes:
   *   - `dark`         — warm-dark luxe (employer side, default)
   *   - `light`        — warm-cream light (legacy light mode)
   *   - `seekerLight`  — royal-blue + white (Phase 2 seeker redesign)
   */
  theme: AppTheme;
  /** Active palette name. */
  scheme: ThemeName;
  /** Manually set the palette (overrides system preference). */
  setScheme: (scheme: ThemeName) => void;
  /** Reset to following the system color scheme. */
  followSystem: () => void;
  /** True when the user has overridden the system scheme. */
  isManual: boolean;
}
