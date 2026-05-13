/**
 * Doondo design tokens — public entry.
 *
 * Import semantic aliases for app code:
 *   import { themes, spacing, radii, fontSize, spring } from '@doondo/tokens';
 *   const colors = themes.dark;  // or themes.light
 *
 * Import raw scales only when building a component that needs an off-palette tint:
 *   import { coral, jade, amber, champagne } from '@doondo/tokens/colors';
 */

export {
  coral,
  jade,
  amber,
  champagne,
  gray,
  red,
  blue,
  dark,
  light,
  seekerLight,
  categoryTints,
  themes,
  type Theme,
  type ThemeName,
} from './colors';

export {
  fontFamily,
  fontWeight,
  fontSize,
  lineHeight,
  letterSpacing,
  type FontSizeKey,
} from './typography';

export { spacing, type SpacingKey } from './spacing';
export { radii, type RadiiKey } from './radii';
export {
  duration,
  easing,
  spring,
  haptic,
  type SpringKey,
  type HapticKey,
} from './motion';
