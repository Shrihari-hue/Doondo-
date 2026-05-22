/**
 * Women-safety catalog — the static shape of "Doondo for Women".
 *
 * Pure data, no i18n strings: the screens derive translation keys from
 * the ids here (`women.signal.<key>`, `women.tip.<id>_title`, …) so all
 * five languages stay in the locale files. Keeping this a plain catalog
 * — like `careerPathCatalog` / `formalPayCatalog` — makes it trivial to
 * widen the signal set or the guidance later.
 */

import type { WomenSafety, WomenSafetyTier } from '@/api/types';

/** The five employer-declared signal keys, in display order. */
export const WOMEN_SAFETY_SIGNALS: ReadonlyArray<keyof WomenSafety> = [
  'separateFacilities',
  'womenOnTeam',
  'dayShiftOnly',
  'safeTransport',
  'harassmentPolicy',
];

export interface WomenSafetySignalDef {
  key: keyof WomenSafety;
  /** Emoji shown beside the signal in lists and the post-job checklist. */
  icon: string;
}

/**
 * Each signal's icon. The label + description come from i18n at
 * `women.signal.<key>` and `women.signal.<key>_desc`.
 */
export const WOMEN_SAFETY_SIGNAL_DEFS: readonly WomenSafetySignalDef[] = [
  { key: 'separateFacilities', icon: '🚻' },
  { key: 'womenOnTeam', icon: '👭' },
  { key: 'dayShiftOnly', icon: '☀️' },
  { key: 'safeTransport', icon: '🚐' },
  { key: 'harassmentPolicy', icon: '🛡️' },
];

/**
 * Tier display metadata. `tone` is a semantic colour name the screens
 * map to a theme colour. The badge label itself is a single shared
 * string (`women.badge_label`) — the tier only shifts the colour.
 */
export interface WomenSafetyTierMeta {
  icon: string;
  tone: 'success' | 'brand' | 'neutral' | 'muted';
}

export const WOMEN_SAFETY_TIER_META: Record<WomenSafetyTier, WomenSafetyTierMeta> = {
  high: { icon: '🛡️', tone: 'success' },
  medium: { icon: '🛡️', tone: 'brand' },
  basic: { icon: '🛡️', tone: 'neutral' },
  none: { icon: '', tone: 'muted' },
};

/** Count of declared signals. Mirrors the backend `computeWomenSafety`. */
export function countWomenSafetySignals(ws: WomenSafety | null | undefined): number {
  if (!ws) return 0;
  return WOMEN_SAFETY_SIGNALS.filter((key) => ws[key] === true).length;
}

export interface WomenSafetyTip {
  /** i18n keys: `women.tip.<id>_title`, `women.tip.<id>_body`. */
  id: string;
  icon: string;
}

/** Practical safe-work guidance shown on the Women hub screen. */
export const WOMEN_SAFETY_TIPS: readonly WomenSafetyTip[] = [
  { id: 'know_rights', icon: '📜' },
  { id: 'trusted_contact', icon: '📞' },
  { id: 'safe_commute', icon: '🚏' },
  { id: 'trust_instincts', icon: '🧭' },
];
