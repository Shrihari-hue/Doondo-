/**
 * Doondo Pulse — the worker's momentum snapshot for the Home dashboard.
 *
 * The Home screen answers "what work is out there?". Pulse answers the
 * other half — "where do *I* stand, and what's my next move?". It's the
 * single card a returning worker should be able to glance at and know
 * whether they're building momentum or letting it slip.
 *
 * What it surfaces:
 *   - Doondo Score — the portable 0-100 employability number.
 *   - Apply streak — consecutive days the worker has applied.
 *   - Applications in play — pending / viewed / shortlisted, i.e. the
 *     ones that could still turn into a job.
 *   - Profile completion — 0-100.
 *   - A single next-step nudge — the one thing most worth doing next.
 *
 * Everything here is computed on the read path from data that already
 * exists (Doondo Score, streaks, applications) — no new denormalised
 * counters, no stale-state risk. Seeker-only: this is a worker's
 * dashboard; employers have their own.
 */

import { and, count, eq, inArray } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, users, type ApplicationStatus } from '@/db/schema';
import { computeForUser } from '@/modules/users/doondoScore.service';

/** The mobile maps each action to a screen — the Pulse card's CTA. */
export type PulseNudgeAction =
  | 'verify'
  | 'build_profile'
  | 'set_availability'
  | 'add_skills'
  | 'explore_jobs';

export interface PulseNudge {
  /** i18n key the mobile renders into the worker's language. */
  key: string;
  /** Routing hint — the mobile maps this to a real screen. */
  action: PulseNudgeAction;
}

export interface PulseSnapshot {
  /** Doondo Score, 0-100. */
  score: number;
  /** Profile completion, 0-100. */
  profileCompletion: number;
  /** Current consecutive apply-streak days. */
  applyStreak: number;
  /** Applications still in play (pending / viewed / shortlisted). */
  activeApplications: number;
  /** The single most useful next step. Always present — there's always
   *  *something* worth doing, even if it's just "explore jobs". */
  nudge: PulseNudge;
}

/**
 * Application statuses that count as "still in play" — the worker is
 * waiting on a decision. Rejected / hired / withdrawn are settled and
 * excluded.
 */
const ACTIVE_STATUSES: ApplicationStatus[] = ['pending', 'viewed', 'shortlisted'];

interface NudgeInput {
  isVerified: boolean;
  hasResume: boolean;
  hasWorkHistory: boolean;
  hasAvailability: boolean;
  skillCount: number;
}

/**
 * Pick the single next step worth nudging the worker toward.
 *
 * Pure + exported so it can be unit-tested without a DB. The order is
 * the natural onboarding ladder: prove who you are, show your
 * experience, say when you can work, list what you can do — and once
 * all of that is done, the evergreen "go find a job". Each rung, once
 * cleared, naturally surfaces the next, so the worker is never
 * dead-ended.
 */
export function pickPulseNudge(input: NudgeInput): PulseNudge {
  if (!input.isVerified) {
    return { key: 'pulse.nudge.verify', action: 'verify' };
  }
  if (!input.hasResume && !input.hasWorkHistory) {
    return { key: 'pulse.nudge.build_profile', action: 'build_profile' };
  }
  if (!input.hasAvailability) {
    return { key: 'pulse.nudge.set_availability', action: 'set_availability' };
  }
  if (input.skillCount === 0) {
    return { key: 'pulse.nudge.add_skills', action: 'add_skills' };
  }
  return { key: 'pulse.nudge.explore_jobs', action: 'explore_jobs' };
}

/**
 * Assemble the Pulse snapshot for one seeker.
 *
 * Throws `notFound` when the user doesn't exist. Three independent
 * lookups run in parallel — the Doondo Score (which also gives us
 * profile completion), the user document (for streaks + nudge inputs),
 * and the active-application count.
 */
export async function getPulseForSeeker(userId: string): Promise<PulseSnapshot> {
  const db = getDb();
  const [score, [user], [activeApplicationsRow]] = await Promise.all([
    computeForUser(userId),
    db
      .select({
        streaks: users.streaks,
        isVerified: users.isVerified,
        resumeUrl: users.resumeUrl,
        resumeUploadedAt: users.resumeUploadedAt,
        workHistory: users.workHistory,
        availability: users.availability,
        skills: users.skills,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ n: count() })
      .from(applications)
      .where(and(eq(applications.seekerId, userId), inArray(applications.status, ACTIVE_STATUSES))),
  ]);

  if (!user) throw errors.notFound('User not found.');

  const nudge = pickPulseNudge({
    isVerified: Boolean(user.isVerified),
    hasResume: Boolean(user.resumeUrl || user.resumeUploadedAt),
    hasWorkHistory: (user.workHistory ?? []).length > 0,
    hasAvailability: Boolean(user.availability),
    skillCount: (user.skills ?? []).length,
  });

  return {
    score: score.score,
    profileCompletion: score.breakdown.profile.completion,
    applyStreak: user.streaks?.apply?.current ?? 0,
    activeApplications: activeApplicationsRow!.n,
    nudge,
  };
}
