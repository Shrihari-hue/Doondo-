/**
 * Mobile mirror of the backend's review-tag catalog.
 *
 * Source of truth lives at `apps/backend/src/modules/ratings/tagCatalog.ts`.
 * Kept in sync by hand for now (no shared package yet) — same slugs,
 * same polarity, same labels. The backend validates the slug list on
 * create, so an out-of-date mobile catalog just means a few stale chips
 * the user can pick but the server will reject; it isn't a security issue.
 *
 * When we add packages/shared (Phase 8), this file moves there and both
 * apps import from one source.
 */

export type TagPolarity = 'positive' | 'neutral' | 'negative';

export interface TagDescriptor {
  slug: string;
  label: string;
  polarity: TagPolarity;
}

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
];

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
];

/** Look up the tag set for a review direction. `role` is the reviewee's role. */
export function tagsForRole(role: 'employer' | 'seeker'): ReadonlyArray<TagDescriptor> {
  return role === 'employer' ? EMPLOYER_REVIEW_TAGS : SEEKER_REVIEW_TAGS;
}

/** Quick lookup: slug → descriptor (for rendering tags on rating cards). */
export function describeTag(slug: string): TagDescriptor | undefined {
  return (
    EMPLOYER_REVIEW_TAGS.find((t) => t.slug === slug) ??
    SEEKER_REVIEW_TAGS.find((t) => t.slug === slug)
  );
}
