/**
 * Doondo typography tokens.
 *
 * Inter is the workhorse — it reads beautifully at every size and on every
 * device. The display variant (used in onboarding hero + role picker) gets
 * tighter tracking for an editorial feel. We keep three weights only:
 * regular (400), medium (500), semibold (600). More weights = more chaos.
 */

export const fontFamily = {
  /** Body, UI, lists, controls — the default. */
  sans: 'Inter',
  /** Hero moments — onboarding titles, role picker, success screens. */
  display: 'InterDisplay',
  /** Code, IDs, monetary cents — rare. */
  mono: 'JetBrainsMono',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

/**
 * Type scale. Numbers are in pixels.
 *
 * Naming reflects intent, not size, so we can shift the scale later without
 * renaming every callsite. Pair each size with the matching lineHeight key.
 */
export const fontSize = {
  /** Tiny labels — never below this. */
  caption: 12,
  /** Secondary copy, metadata, timestamps. */
  footnote: 13,
  /** Body default, list items, inputs. */
  body: 15,
  /** Slightly emphasized body, single-line headers in cards. */
  bodyLarge: 17,
  /** Section headers, dialog titles. */
  title: 20,
  /** Screen titles. */
  titleLarge: 24,
  /** Display moments (onboarding, success). */
  display: 32,
  /** Hero (role picker, splash overlay). */
  displayLarge: 44,
} as const;

/** Line heights matched to fontSize keys. Values are unitless multipliers. */
export const lineHeight = {
  caption: 1.4,
  footnote: 1.45,
  body: 1.55,
  bodyLarge: 1.5,
  title: 1.35,
  titleLarge: 1.25,
  display: 1.15,
  displayLarge: 1.05,
} as const;

/** Letter spacing in pixels. Negative values tighten display sizes for editorial feel. */
export const letterSpacing = {
  tight: -0.6,
  default: 0,
  wide: 0.4,
  caps: 1.2,
} as const;

export type FontSizeKey = keyof typeof fontSize;
