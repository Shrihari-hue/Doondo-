/**
 * Re-tap past applicants — the employer's warmest untapped pool.
 *
 * People who applied to this employer before, didn't get hired, and are
 * *now broadcasting that they're free again* near the employer. They
 * already wanted to work here once; surfacing them the moment they raise
 * an availability beacon turns a stale rejection list into live, ready
 * supply — usually higher-converting than a cold search.
 *
 * The query is an intersection of two things the platform already
 * tracks: the employer's prior applicant pool (the `applications` table,
 * which denormalises `employerId`) and the live availability beacons near
 * the employer (`availabilities`, reusing the same nearby query the
 * Find-workers list runs). We deliberately do the intersection by handing
 * the prior-applicant seeker ids to the beacon query as an allow-list, so
 * the geo index does the heavy lifting and we only hydrate the handful
 * that are both past applicants AND live nearby.
 *
 * Who's excluded:
 *   - anyone ever hired by this employer (they belong in My Crew, not a
 *     "re-tap" list), and
 *   - anyone whose latest application is still `pending` (they're already
 *     sitting in the current pipeline — re-tapping would be noise).
 */

import { inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs } from '@/db/schema';
import * as availabilityService from '@/modules/availabilities/availability.service';
import type { NearbyAvailability } from '@/modules/availabilities/availability.service';

export interface PastApplicantResult {
  seeker: NearbyAvailability['seeker'];
  distanceMeters: number;
  /** ISO time the worker's current beacon expires. */
  availableUntil: string;
  /** Context from the last time they applied to this employer. */
  lastApplied: {
    status: string;
    appliedAt: string | null;
    jobTitle: string | null;
  };
}

interface FindInput {
  employerId: string;
  lat: number;
  lng: number;
  radius: number;
  limit: number;
}

/** One row: a seeker's most-recent application to this employer, plus every status they've ever had. */
interface SeekerLatestRow extends Record<string, unknown> {
  seeker_id: string;
  status: string;
  applied_at: Date;
  job_id: string | null;
  statuses: string[];
}

export async function findAvailablePastApplicants(
  input: FindInput,
): Promise<PastApplicantResult[]> {
  // 1. Collapse every application this employer has received down to one
  //    row per seeker: their latest status + when + which job, plus the
  //    set of every status they've ever had (to exclude prior hires).
  const rows = await getDb().execute<SeekerLatestRow>(sql`
    SELECT DISTINCT ON (a.seeker_id)
      a.seeker_id, a.status, a.applied_at, a.job_id,
      (SELECT array_agg(DISTINCT a2.status) FROM ${applications} a2 WHERE a2.seeker_id = a.seeker_id AND a2.employer_id = a.employer_id) AS statuses
    FROM ${applications} a
    WHERE a.employer_id = ${input.employerId}
    ORDER BY a.seeker_id, a.applied_at DESC
  `);

  // Exclude anyone ever hired, and anyone still pending in the live pipeline.
  const candidates = [...rows].filter(
    (r) => !r.statuses.includes('hired') && r.status !== 'pending',
  );
  if (candidates.length === 0) return [];

  const bySeeker = new Map(candidates.map((r) => [r.seeker_id, r]));

  // 2. Of those, who has a live beacon near the employer right now?
  const nearby = await availabilityService.findNearby({
    lat: input.lat,
    lng: input.lng,
    radius: input.radius,
    limit: input.limit,
    seekerIds: [...bySeeker.keys()],
  });
  if (nearby.length === 0) return [];

  // 3. Resolve the job titles for the relevant last-applications only.
  const jobIds = nearby
    .map((n) => bySeeker.get(n.seekerId)?.job_id)
    .filter((j): j is string => !!j);
  const jobRows = jobIds.length
    ? await getDb().select({ id: jobs.id, title: jobs.title }).from(jobs).where(inArray(jobs.id, jobIds))
    : [];
  const titleMap = new Map(jobRows.map((j) => [j.id, j.title]));

  // 4. Merge the live beacon with the application context.
  return nearby.map((n) => {
    const c = bySeeker.get(n.seekerId);
    return {
      seeker: n.seeker,
      distanceMeters: n.distanceMeters,
      availableUntil: n.until,
      lastApplied: {
        status: c?.status ?? 'viewed',
        appliedAt: c?.applied_at ? new Date(c.applied_at).toISOString() : null,
        jobTitle: c?.job_id ? titleMap.get(c.job_id) ?? null : null,
      },
    };
  });
}
