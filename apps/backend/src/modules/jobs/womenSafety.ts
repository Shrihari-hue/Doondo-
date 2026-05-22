/**
 * Women-safety scoring — the data core of "Doondo for Women".
 *
 * A job carries a small set of employer-declared women-safety signals.
 * This module owns their shape and the pure function that scores them
 * into a tier the UI can badge.
 *
 * Honest framing, baked into the design: these are signals the *employer
 * declares*, not facts Doondo has verified. The tier is therefore a
 * transparency aid — "here is what the employer says about working here
 * as a woman" — and every surface that shows it says so. It is strictly
 * additive: it never excludes men from a job, it only helps a woman
 * worker see the workplaces that have thought about her safety.
 *
 * Pure and synchronous on purpose — it is unit-tested in the offline
 * bootcheck, and both the model serializer and the search path call it.
 */

/**
 * The employer-declared women-safety signals for a job. Each is a plain
 * boolean: `true` = the employer asserts it; `false`/absent = it is not
 * asserted (which is itself honest — a blank is not a claim).
 */
export interface WomenSafety {
  /** A separate, clean toilet + rest space for women on site. */
  separateFacilities: boolean;
  /** Women already work in this role / on this team. */
  womenOnTeam: boolean;
  /** No night shifts — the role is day-shift only. */
  dayShiftOnly: boolean;
  /** Transport is provided, or the commute is safe (well-lit, short). */
  safeTransport: boolean;
  /** The workplace has a harassment-redressal process (a POSH committee). */
  harassmentPolicy: boolean;
}

/** Ordered list of the signal keys — the single source of truth. */
export const WOMEN_SAFETY_SIGNALS = [
  'separateFacilities',
  'womenOnTeam',
  'dayShiftOnly',
  'safeTransport',
  'harassmentPolicy',
] as const;

export type WomenSafetySignal = (typeof WOMEN_SAFETY_SIGNALS)[number];

/** A job's women-safety standing, derived purely from the signals. */
export type WomenSafetyTier = 'high' | 'medium' | 'basic' | 'none';

export interface WomenSafetyResult {
  /** The badge tier. */
  tier: WomenSafetyTier;
  /** Count of declared signals, 0–5. */
  score: number;
  /** The signal keys the employer declared true. */
  signals: WomenSafetySignal[];
}

/**
 * Score a job's women-safety signals into a tier.
 *
 *   4–5 signals → high     2–3 → medium     1 → basic     0 → none
 *
 * The tier is a plain count of employer-declared signals — no opaque
 * weighting — so the badge is honest about exactly what it represents.
 */
export function computeWomenSafety(
  womenSafety: WomenSafety | null | undefined,
): WomenSafetyResult {
  if (!womenSafety) return { tier: 'none', score: 0, signals: [] };
  const signals = WOMEN_SAFETY_SIGNALS.filter((key) => womenSafety[key] === true);
  const score = signals.length;
  const tier: WomenSafetyTier =
    score >= 4 ? 'high' : score >= 2 ? 'medium' : score >= 1 ? 'basic' : 'none';
  return { tier, score, signals };
}
