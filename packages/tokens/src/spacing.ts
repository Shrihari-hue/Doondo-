/**
 * Doondo spacing tokens.
 *
 * 4-pt base grid. Use named scales (xs, sm, md…) in code so we can adjust
 * the grid later without rewriting every component.
 */

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  /** design/layout.md 8pt grid: 56 (between 5xl/48 and 6xl/64). */
  56: 56,
  '6xl': 64,
  /** design/layout.md 8pt grid: 72 — the largest value it lists. */
  72: 72,
  '7xl': 80,
  '8xl': 96,
} as const;

export type SpacingKey = keyof typeof spacing;
