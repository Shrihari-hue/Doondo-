/**
 * Doondo Score — the worker's portable employability number (0-100).
 *
 * Philosophy: every signal in the app feeds one explainable number.
 * The seeker can carry it inside Doondo, share it as a QR code, and
 * (in time) employers across the industry start asking for it. Today
 * we compute it on the read path — same pattern as the rating
 * summary — so we never have a stale-denormalized-score problem.
 *
 * v1 formula (out of 100). The weights are deliberately simple and
 * explainable. Each component is capped so no single signal dominates.
 *
 *   ratings        : 35 max — avg/5 × 35, requires ≥1 rating
 *   hires          : 25 max — 5 per hired application, capped
 *   endorsements   : 20 max — 4 per unique trade endorsement, capped
 *   verifications  : 10 max — 10 if isVerified, else 0
 *   profile        : 10 max — profileCompletion% × 10/100
 *
 * The breakdown is returned alongside the score so the mobile UI can
 * render "Why this score?" — workers should always be able to see
 * what they need to improve.
 *
 * Bootstrap rule: a fresh seeker with no signals gets 0. We do NOT
 * pre-seed a "trust me" base score — earning the first point matters.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { UserModel } from './user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { EndorsementModel } from '@/modules/endorsements/endorsement.model';
import { summarizeForUser as summarizeRatingForUser } from '@/modules/ratings/rating.service';

export interface DoondoScoreBreakdown {
  ratings: { points: number; max: number; avg: number | null; count: number };
  hires: { points: number; max: number; count: number };
  endorsements: { points: number; max: number; uniqueTrades: number };
  verification: { points: number; max: number; isVerified: boolean };
  profile: { points: number; max: number; completion: number };
}

export interface DoondoScore {
  /** Integer 0-100. */
  score: number;
  /** Component contributions — drives the "Why this score?" UI. */
  breakdown: DoondoScoreBreakdown;
  /** Bumped when the scoring algorithm changes — useful for diffing over time. */
  version: number;
}

const SCORE_VERSION = 1;

/**
 * Compute the Doondo Score for a given user id.
 *
 * Throws `notFound` when the user doesn't exist. Returns a fully
 * zeroed-out score for a brand-new seeker — that's a feature, not a
 * bug. The first few signals are the most rewarding to earn.
 */
export async function computeForUser(userId: string): Promise<DoondoScore> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found.');

  // Run the independent aggregations in parallel.
  const [ratingSummary, hireCount, endorsements] = await Promise.all([
    summarizeRatingForUser(userId),
    ApplicationModel.countDocuments({
      seekerId: new Types.ObjectId(userId),
      status: 'hired',
    }),
    EndorsementModel.find({ seekerId: new Types.ObjectId(userId) })
      .select('trade')
      .lean(),
  ]);

  const uniqueTrades = new Set(
    endorsements.map((e) => (e.trade ?? '').toLowerCase()).filter(Boolean),
  ).size;

  // ─── Component scoring ─────────────────────────────────────────────────
  // Ratings: avg/5 × 35, only when there's at least one rating row.
  const ratingPoints = ratingSummary.count > 0
    ? Math.round((ratingSummary.avg / 5) * 35 * 10) / 10
    : 0;

  // Hires: 5 per hire, capped at 25 (so 5+ hires saturates).
  const hirePoints = Math.min(hireCount * 5, 25);

  // Endorsements: 4 per unique trade, capped at 20 (so 5 trades saturates).
  const endorsementPoints = Math.min(uniqueTrades * 4, 20);

  // Verification: binary 10.
  const verificationPoints = user.isVerified ? 10 : 0;

  // Profile: 10 × completion% — reuse the same calculation the User
  // serializer uses. We can't import the private helper, but
  // toPublicJSON exposes it cleanly.
  const completion = user.toPublicJSON().profileCompletion;
  const profilePoints = Math.round(completion / 10);

  const total = Math.round(
    ratingPoints + hirePoints + endorsementPoints + verificationPoints + profilePoints,
  );

  return {
    score: Math.max(0, Math.min(100, total)),
    breakdown: {
      ratings: {
        points: ratingPoints,
        max: 35,
        avg: ratingSummary.count > 0 ? Math.round(ratingSummary.avg * 10) / 10 : null,
        count: ratingSummary.count,
      },
      hires: { points: hirePoints, max: 25, count: hireCount },
      endorsements: { points: endorsementPoints, max: 20, uniqueTrades },
      verification: {
        points: verificationPoints,
        max: 10,
        isVerified: user.isVerified,
      },
      profile: { points: profilePoints, max: 10, completion },
    },
    version: SCORE_VERSION,
  };
}
