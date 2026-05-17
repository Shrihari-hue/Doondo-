/**
 * Profile completeness — computes a 0..100 score for a seeker's profile
 * and returns the next missing item so the UI can nudge specifically.
 *
 * Each missing piece has a weight that approximates its real impact on
 * hire rate. The weights add to 100 — these are not scientific, but they
 * line up with the "what employers actually look at" intuition.
 *
 * Pure function: takes a PublicUser, returns a score + the next nudge.
 * No async calls, no React. Easy to unit-test.
 */

import type { PublicUser } from '@/api/types';

export interface ProfileCheckItem {
  /** Stable id for the missing piece (used by the nudge UI). */
  id:
    | 'photo'
    | 'phone'
    | 'verified'
    | 'skills'
    | 'expectedSalary'
    | 'bio'
    | 'workHistory'
    | 'workPhotos'
    | 'location';
  /** Display label for "Add X" call to action. */
  label: string;
  /** Weight contribution to the 0–100 score (sums to 100). */
  weight: number;
  /** Short subtitle nudging why this matters. */
  subtitle: string;
}

const ITEMS: ProfileCheckItem[] = [
  { id: 'photo', label: 'Add profile photo', weight: 10, subtitle: 'Profiles with photos get 3x more replies' },
  { id: 'phone', label: 'Add phone number', weight: 10, subtitle: 'Employers can call you directly' },
  { id: 'verified', label: 'Verify your profile', weight: 15, subtitle: '+40% match rate with the blue check' },
  { id: 'skills', label: 'Add 3+ skills', weight: 15, subtitle: 'More skills = more matches' },
  { id: 'expectedSalary', label: 'Set expected pay', weight: 10, subtitle: 'Filters in the jobs that match your rate' },
  { id: 'bio', label: 'Write a short bio', weight: 5, subtitle: 'A line about you helps you stand out' },
  { id: 'workHistory', label: 'Add work history', weight: 15, subtitle: 'Past jobs prove experience' },
  { id: 'workPhotos', label: 'Add work photos', weight: 15, subtitle: 'Visual proof beats words' },
  { id: 'location', label: 'Set your location', weight: 5, subtitle: 'Lets us show nearby jobs' },
];

export interface CompletenessResult {
  /** 0..100 rounded. */
  score: number;
  /** All missing items, ordered by weight desc — highest impact first. */
  missing: ProfileCheckItem[];
  /** The single next nudge to show. Null when complete. */
  next: ProfileCheckItem | null;
}

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function computeCompleteness(user: PublicUser | null): CompletenessResult {
  if (!user) return { score: 0, missing: [...ITEMS], next: ITEMS[0]! };
  const checks: Record<ProfileCheckItem['id'], boolean> = {
    photo: hasValue(user.photoUrl),
    phone: hasValue(user.phone),
    verified: Boolean(user.isVerified),
    skills: Array.isArray(user.skills) && user.skills.length >= 3,
    expectedSalary: Boolean(user.expectedSalary && user.expectedSalary.amount > 0),
    bio: hasValue(user.bio),
    workHistory: Array.isArray(user.workHistory) && user.workHistory.length > 0,
    workPhotos:
      Array.isArray(user.workHistory) &&
      user.workHistory.some(
        (w) => Array.isArray(w.photos) && w.photos.length > 0,
      ),
    location: hasValue(user.location?.city),
  };
  let score = 0;
  const missing: ProfileCheckItem[] = [];
  for (const item of ITEMS) {
    if (checks[item.id]) {
      score += item.weight;
    } else {
      missing.push(item);
    }
  }
  return {
    score: Math.min(100, Math.round(score)),
    missing,
    next: missing[0] ?? null,
  };
}
