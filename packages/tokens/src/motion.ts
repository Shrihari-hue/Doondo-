/**
 * Doondo motion tokens.
 *
 * Two layers:
 *   - duration + easing for CSS-style transitions (used inside web previews)
 *   - spring presets for Reanimated 3 (used everywhere in the mobile app)
 *
 * Premium feel comes from short durations + soft springs, not long fades.
 * Almost nothing in this app should take longer than 300ms to settle.
 */

export const duration = {
  instant: 100,
  quick: 180,
  smooth: 280,
  slow: 460,
} as const;

/** Cubic-bezier curves. (x1, y1, x2, y2). Matches Material 3 emphasis curves. */
export const easing = {
  /** Default for most transitions. */
  standard: [0.2, 0, 0, 1] as const,
  /** Use when something is leaving or de-emphasizing. */
  decelerate: [0, 0, 0, 1] as const,
  /** Use when something is being asserted (CTA press, confirmation). */
  emphasized: [0.3, 0, 0.8, 0.15] as const,
} as const;

/** Reanimated 3 spring configs. Use these instead of writing inline numbers. */
export const spring = {
  /** Default spring for most UI motion — confident, no overshoot. */
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  /** For taps, toggles, anything that should feel snappy. */
  snappy: { damping: 22, stiffness: 280, mass: 1 },
  /** Celebratory — hire success, verification reveal. Has a bit of bounce. */
  bouncy: { damping: 12, stiffness: 220, mass: 1 },
  /** Delicate — subtle list item entries, tooltip in/out. */
  whisper: { damping: 24, stiffness: 140, mass: 1 },
} as const;

/** Haptic intent keys — mapped to platform-specific haptics in the app's haptics util. */
export const haptic = {
  selection: 'selection',
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const;

export type SpringKey = keyof typeof spring;
export type HapticKey = keyof typeof haptic;
