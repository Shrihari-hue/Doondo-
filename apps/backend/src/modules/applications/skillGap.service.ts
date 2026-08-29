/**
 * Skill-gap service.
 *
 * When an employer rejects an application, we want the seeker to get a
 * forward step instead of a dead end. This module computes the gap
 * between what the job demanded and what the seeker had on their
 * profile at rejection time, then recommends the single best course
 * from the static catalogue to close that gap.
 *
 * The gap calculation is intentionally simple — diff the two skill sets
 * (case-insensitive, deduped). No fancy embeddings yet; the catalogue
 * is small and curated, and we'd rather ship explainable copy than a
 * fuzzy similarity score on day one.
 *
 * Course matching prefers courses whose `teachesSkills` overlap the
 * missing skills, then falls back to `relevantTrades` if no skill
 * match exists (useful when the rejected job demands a skill no course
 * yet teaches — we still suggest the closest course to the trade).
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs, users } from '@/db/schema';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { COURSES, type Course } from '@/modules/courses/courses.catalogue';
import { findSimilarActiveJobs } from '@/modules/jobs/job.service';
import type { PublicJob } from '@/modules/jobs/job.model';
import { explainRejection } from './rejectionExplainer.service';

/** Jobs within 15km of the search center — same "worth a bus ride" band as ThisWeek. */
const SIMILAR_JOBS_RADIUS_M = 15_000;
/** Capped at 4 to match the roadmap's "4 similar jobs hiring right now" framing. */
const SIMILAR_JOBS_LIMIT = 4;

export interface SkillGapResult {
  /** Skills the job demanded that the seeker did not have at rejection time. */
  missingSkills: string[];
  /**
   * The single course we'd recommend the seeker take to close the gap.
   * Null when no course teaches a missing skill AND no course is
   * relevant to the job's trade (rare — most rejections have at least
   * one applicable course in the catalogue).
   */
  recommendedCourse: {
    id: string;
    title: string;
    tagline: string;
    durationMinutes: number;
    /** Which of the missing skills this course directly addresses. */
    addressesSkills: string[];
  } | null;
  /**
   * Other applicable courses, ranked. Capped at 3 so the UI stays
   * focused. Empty when there are no other matches.
   */
  alternatives: Array<{
    id: string;
    title: string;
    tagline: string;
    durationMinutes: number;
    addressesSkills: string[];
  }>;
  /**
   * A short, plain-language paragraph explaining the rejection and
   * reframing the missing skill as a next step. Empty string when there
   * was no gap to explain (the seeker had everything the job asked for).
   */
  explanation: string;
  /**
   * Up to 4 other active jobs hiring right now, near the rejected job
   * (or the seeker's own location when set), sharing at least one skill
   * with it — the positive reframe alongside the explanation.
   */
  similarJobs: Array<PublicJob & { distanceMeters: number }>;
}

/**
 * Compute the missing-skill list for `(job.skills, seekerSkills)`.
 *
 * Comparison is case-insensitive, dedup-aware, and order-stable. We
 * preserve the casing the JOB used so the seeker sees the same label
 * the employer wrote — "Customer Service" not "customer_service" if
 * that's what the job said.
 */
export function diffSkills(jobSkills: string[], seekerSkills: string[]): string[] {
  const seekerSet = new Set(seekerSkills.filter(Boolean).map((s) => s.trim().toLowerCase()));
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const raw of jobSkills) {
    if (!raw) continue;
    const lower = raw.trim().toLowerCase();
    if (seekerSet.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    missing.push(raw.trim());
  }
  return missing;
}

/**
 * Pick the best course for a missing-skill set, with optional trade
 * fallback. Returns null when no course in the catalogue is relevant.
 *
 * Ranking:
 *   1. Most missing-skill matches in `teachesSkills` (high to low)
 *   2. Tie-break by total course duration (shorter first — easier win)
 *   3. Tie-break by id (stable order across calls)
 */
export function rankCoursesForGap(
  missingSkills: string[],
  fallbackTrade?: string | null,
): Array<{ course: Course; addressesSkills: string[] }> {
  const missingLower = new Set(missingSkills.map((s) => s.toLowerCase()));

  const ranked = COURSES.map((course) => {
    const addressesSkills = (course.teachesSkills ?? []).filter((s) =>
      missingLower.has(s.toLowerCase()),
    );
    return { course, addressesSkills };
  })
    .filter((row) => row.addressesSkills.length > 0)
    .sort((a, b) => {
      if (b.addressesSkills.length !== a.addressesSkills.length) {
        return b.addressesSkills.length - a.addressesSkills.length;
      }
      if (a.course.totalDurationMinutes !== b.course.totalDurationMinutes) {
        return a.course.totalDurationMinutes - b.course.totalDurationMinutes;
      }
      return a.course.id.localeCompare(b.course.id);
    });

  if (ranked.length > 0) return ranked;

  // Fallback: no course teaches a missing skill directly — recommend
  // the shortest course relevant to the job's trade, if any.
  if (fallbackTrade) {
    const tradeLower = fallbackTrade.toLowerCase();
    const tradeMatches = COURSES.filter((c) =>
      c.relevantTrades.some((t) => t.toLowerCase() === tradeLower),
    )
      .map((course) => ({ course, addressesSkills: [] as string[] }))
      .sort((a, b) => a.course.totalDurationMinutes - b.course.totalDurationMinutes);
    return tradeMatches;
  }

  return [];
}

/**
 * Compute the full SkillGapResult for a given application id, scoped
 * to the seeker viewing it (the endpoint requires auth as the seeker).
 *
 * Resolves the application + job + seeker, computes the gap, and
 * picks the best course. Returns empty/null when the application isn't
 * rejected OR when the seeker had every skill the job asked for.
 */
export async function computeForApplication(input: {
  seekerId: string;
  applicationId: string;
}): Promise<SkillGapResult> {
  const [app] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.id, input.applicationId), eq(applications.seekerId, input.seekerId)))
    .limit(1);
  if (!app) throw errors.applicationNotFound();

  const EMPTY: SkillGapResult = {
    missingSkills: [],
    recommendedCourse: null,
    alternatives: [],
    explanation: '',
    similarJobs: [],
  };

  // Job + seeker are needed either way now — job for its title/geo (the
  // explainer paragraph and the "similar jobs" search center), seeker
  // for a recompute fallback and its own location (preferred search
  // center when set, since it's more current than a rejected job's spot).
  const [jobRows, seekerRows] = await Promise.all([
    getDb()
      .select({ skills: jobs.skills, title: jobs.title, geo: jobs.geo })
      .from(jobs)
      .where(eq(jobs.id, app.jobId))
      .limit(1),
    getDb()
      .select({ skills: users.skills, location: users.location })
      .from(users)
      .where(eq(users.id, input.seekerId))
      .limit(1),
  ]);
  const job = jobRows[0];
  if (!job) return EMPTY;
  const seeker = seekerRows[0];

  // Prefer the persisted snapshot from the moment of rejection (set by
  // application.service.transitionByEmployer). If absent — e.g. older
  // rejections from before this feature shipped — we recompute from
  // the current seeker + job state, which is still useful but may
  // diverge if the seeker added the missing skill afterward.
  const missingSkills: string[] = Array.isArray(app.rejectionReasons)
    ? app.rejectionReasons.filter(Boolean)
    : diffSkills(job.skills ?? [], seeker?.skills ?? []);
  // Use the job title as a coarse trade hint for fallback ranking — a
  // string contains comparison handles "Delivery rider" hitting the
  // 'delivery' relevantTrades entry without a strict trade slug.
  const trade = job.title.toLowerCase();

  if (missingSkills.length === 0) return EMPTY;

  const ranked = rankCoursesForGap(missingSkills, trade);

  const top = ranked[0];
  const recommendedCourse = top
    ? {
        id: top.course.id,
        title: top.course.title,
        tagline: top.course.tagline,
        durationMinutes: top.course.totalDurationMinutes,
        addressesSkills: top.addressesSkills,
      }
    : null;
  const alternatives = ranked.slice(1, 4).map((row) => ({
    id: row.course.id,
    title: row.course.title,
    tagline: row.course.tagline,
    durationMinutes: row.course.totalDurationMinutes,
    addressesSkills: row.addressesSkills,
  }));

  // Search center: the seeker's own saved location when set (more
  // current, and closer to where they'd actually want the next job),
  // else the rejected job's own spot.
  const center = seeker?.location?.coordinates ?? (job.geo ? [job.geo.x, job.geo.y] : null);

  const [explainerResult, similarJobs] = await Promise.all([
    explainRejection({
      jobTitle: job.title,
      missingSkills,
      recommendedCourseTitle: recommendedCourse?.title ?? null,
    }).catch((err) => {
      logger.warn({ err, applicationId: input.applicationId }, 'rejection explainer failed');
      return null;
    }),
    center
      ? findSimilarActiveJobs({
          lat: center[1],
          lng: center[0],
          radius: SIMILAR_JOBS_RADIUS_M,
          excludeJobId: app.jobId,
          skills: job.skills ?? [],
          limit: SIMILAR_JOBS_LIMIT,
        }).catch((err) => {
          logger.warn({ err, applicationId: input.applicationId }, 'similar-jobs query failed');
          return [];
        })
      : Promise.resolve([]),
  ]);

  return {
    missingSkills,
    recommendedCourse,
    alternatives,
    explanation: explainerResult?.paragraph ?? '',
    similarJobs,
  };
}
