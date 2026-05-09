/**
 * Doondo border radius tokens.
 *
 * Warm dark luxe leans softer-than-sharp — most cards use lg (14px). Pills
 * (chips, badges, buttons that feel like tags) use pill (999). The role-picker
 * 3D scene uses xl (20) for its panel.
 */

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  pill: 999,
} as const;

export type RadiiKey = keyof typeof radii;
