/**
 * Skill suggestions — "add cooking → +30% job matches" style nudges.
 *
 * Computes the gap between the trades the seeker already lists and the
 * trades that have the most active jobs near them, then ranks the gap
 * trades by approximate match uplift.
 *
 * Algorithm (kept boring and explicable so we can debug it):
 *   1. Find all active jobs within 20km of the seeker's location.
 *   2. Bucket those jobs by their `skills` array → count per skill.
 *   3. For each skill the seeker doesn't already have, compute:
 *        coverage = (jobs containing that skill) / (total nearby jobs)
 *      and treat that as the "match uplift" %.
 *   4. Return the top 3 by uplift, plus the raw counts.
 *
 * The actual uplift is bounded at +95% — we never tell a seeker that
 * adding one skill will get them to "100% match"; that's overpromising.
 */

import { Types } from 'mongoose';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';

export interface SkillSuggestion {
  /** Canonical skill key, e.g. "electrician". */
  skill: string;
  /** Approximate % uplift in job matches if the seeker adds this skill. */
  upliftPercent: number;
  /** Raw count of nearby active jobs that need this skill right now. */
  jobsNeedingIt: number;
}

const SEARCH_RADIUS_METERS = 20_000;

export async function suggestForSeeker(
  seekerId: string | Types.ObjectId,
): Promise<SkillSuggestion[]> {
  const seeker = await UserModel.findById(seekerId).lean();
  if (!seeker) return [];

  const coords = (seeker as { location?: { geo?: { coordinates?: [number, number] } } })
    .location?.geo?.coordinates;
  if (!coords) return [];

  const have = new Set(
    (seeker as { skills?: string[] }).skills?.map((s) => s.toLowerCase()) ?? [],
  );

  const nearbyJobs = await JobModel.find({
    status: 'active',
    'location.geo': {
      $near: {
        $geometry: { type: 'Point', coordinates: coords },
        $maxDistance: SEARCH_RADIUS_METERS,
      },
    },
  })
    .select('skills')
    .limit(500)
    .lean();

  const total = nearbyJobs.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const job of nearbyJobs) {
    const skills = (job.skills as string[] | undefined) ?? [];
    const seen = new Set<string>();
    for (const s of skills) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const suggestions: SkillSuggestion[] = [];
  for (const [skill, count] of counts) {
    if (have.has(skill)) continue;
    // Don't bother suggesting near-irrelevant skills.
    if (count < Math.max(3, Math.floor(total * 0.05))) continue;
    const uplift = Math.min(95, Math.round((count / total) * 100));
    suggestions.push({ skill, upliftPercent: uplift, jobsNeedingIt: count });
  }

  suggestions.sort((a, b) => b.upliftPercent - a.upliftPercent);
  return suggestions.slice(0, 3);
}
