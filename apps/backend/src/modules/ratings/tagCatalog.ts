/**
 * Rating tag catalog.
 *
 * Free-text comments are great but they don't aggregate. Tags are the
 * machine-readable signal underneath each review — "paid on time" is a
 * yes/no the platform can roll up across dozens of seekers to build a
 * trust profile for an employer.
 *
 * Two parallel catalogs because the things a seeker says about an
 * employer (pay, safety, hours) aren't the same as what an employer
 * says about a seeker (punctuality, skill, attitude).
 *
 * Tag slugs are stable identifiers — `paid_on_time` is forever once
 * shipped. The label is the human string the UI shows; change the
 * label freely as you tune copy.
 *
 * Polarity drives surface treatment:
 *   - `positive` tags surface in the employer's "Workers say…" summary
 *     as the green badges seekers are looking for.
 *   - `negative` tags surface as warnings on the EmployerDetail screen.
 *     A single tag isn't a verdict, but >25% of reviews flagging "paid
 *     late" is a real signal.
 *   - `neutral` tags are metadata (e.g. "in person interview") that
 *     contextualizes without judging.
 */

export interface TagDescriptor {
  slug: string;
  label: string;
  /** Optional one-line description shown on long-press / info hover. */
  description?: string;
  polarity: 'positive' | 'neutral' | 'negative';
}

// ─── Tags a SEEKER picks when reviewing an EMPLOYER ─────────────────────────
// (so role === 'employer' on the Rating row — reviewee is the employer)
export const EMPLOYER_REVIEW_TAGS: ReadonlyArray<TagDescriptor> = [
  { slug: 'paid_on_time', label: 'Paid on time', polarity: 'positive' },
  { slug: 'safe_site', label: 'Safe worksite', polarity: 'positive' },
  { slug: 'fair_hours', label: 'Fair hours', polarity: 'positive' },
  { slug: 'clean_workplace', label: 'Clean workplace', polarity: 'positive' },
  { slug: 'respectful', label: 'Respectful', polarity: 'positive' },
  { slug: 'good_communication', label: 'Good communication', polarity: 'positive' },
  { slug: 'ppe_provided', label: 'PPE provided', polarity: 'positive' },
  { slug: 'flexible_schedule', label: 'Flexible schedule', polarity: 'positive' },
  { slug: 'meals_provided', label: 'Meals provided', polarity: 'positive' },
  { slug: 'late_pay', label: 'Paid late', polarity: 'negative' },
  { slug: 'unsafe', label: 'Felt unsafe', polarity: 'negative' },
  { slug: 'overtime_unpaid', label: 'Overtime not paid', polarity: 'negative' },
  { slug: 'disrespectful', label: 'Disrespectful', polarity: 'negative' },
] as const;

// ─── Tags an EMPLOYER picks when reviewing a SEEKER ─────────────────────────
// (role === 'seeker' — reviewee is the seeker)
export const SEEKER_REVIEW_TAGS: ReadonlyArray<TagDescriptor> = [
  { slug: 'punctual', label: 'Punctual', polarity: 'positive' },
  { slug: 'hardworking', label: 'Hardworking', polarity: 'positive' },
  { slug: 'skilled', label: 'Skilled', polarity: 'positive' },
  { slug: 'polite', label: 'Polite', polarity: 'positive' },
  { slug: 'team_player', label: 'Team player', polarity: 'positive' },
  { slug: 'reliable', label: 'Reliable', polarity: 'positive' },
  { slug: 'good_communication', label: 'Good communication', polarity: 'positive' },
  { slug: 'late', label: 'Frequently late', polarity: 'negative' },
  { slug: 'no_show', label: 'No-show', polarity: 'negative' },
  { slug: 'low_skill', label: 'Needs more training', polarity: 'negative' },
] as const;

/** All known tag slugs across both directions — used by validators. */
export const ALL_TAG_SLUGS: ReadonlyArray<string> = [
  ...EMPLOYER_REVIEW_TAGS.map((t) => t.slug),
  ...SEEKER_REVIEW_TAGS.map((t) => t.slug),
];

/**
 * Pick the right catalog for a given rating row. `role` on the rating
 * names the reviewee, so `role === 'employer'` means a seeker is
 * reviewing an employer → use EMPLOYER_REVIEW_TAGS.
 */
export function allowedTagsFor(role: 'employer' | 'seeker'): ReadonlyArray<TagDescriptor> {
  return role === 'employer' ? EMPLOYER_REVIEW_TAGS : SEEKER_REVIEW_TAGS;
}

/** Validate that every supplied tag exists in the right catalog. */
export function validateTagsForRole(
  role: 'employer' | 'seeker',
  tags: string[],
): { ok: true } | { ok: false; invalid: string[] } {
  const allowed = new Set(allowedTagsFor(role).map((t) => t.slug));
  const invalid = tags.filter((t) => !allowed.has(t));
  if (invalid.length === 0) return { ok: true };
  return { ok: false, invalid };
}
