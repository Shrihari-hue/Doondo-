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
 * tracks: the employer's prior applicant pool (the `applications`
 * collection, which denormalises `employerId`) and the live availability
 * beacons near the employer (`availabilities`, reusing the same
 * `$geoNear` the Find-workers list runs). We deliberately do the
 * intersection by handing the prior-applicant seeker ids to the beacon
 * query as an allow-list, so the geo index does the heavy lifting and we
 * only hydrate the handful that are both past applicants AND live nearby.
 *
 * Who's excluded:
 *   - anyone ever hired by this employer (they belong in My Crew, not a
 *     "re-tap" list), and
 *   - anyone whose latest application is still `pending` (they're already
 *     sitting in the current pipeline — re-tapping would be noise).
 */

import { Types } from 'mongoose';
import { ApplicationModel } from '@/modules/applications/application.model';
import { JobModel } from '@/modules/jobs/job.model';
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

/** One aggregated row: a seeker's most-recent application to this employer. */
interface SeekerLatest {
  _id: Types.ObjectId;
  status: string;
  appliedAt: Date;
  jobId: Types.ObjectId | null;
  statuses: string[];
}

export async function findAvailablePastApplicants(
  input: FindInput,
): Promise<PastApplicantResult[]> {
  // 1. Collapse every application this employer has received down to one
  //    row per seeker: their latest status + when + which job, plus the
  //    set of every status they've ever had (to exclude prior hires).
  const agg = (await ApplicationModel.aggregate([
    { $match: { employerId: new Types.ObjectId(input.employerId) } },
    { $sort: { appliedAt: -1 } },
    {
      $group: {
        _id: '$seekerId',
        status: { $first: '$status' },
        appliedAt: { $first: '$appliedAt' },
        jobId: { $first: '$jobId' },
        statuses: { $addToSet: '$status' },
      },
    },
  ])) as SeekerLatest[];

  // Exclude anyone ever hired, and anyone still pending in the live pipeline.
  const candidates = agg.filter(
    (r) => !r.statuses.includes('hired') && r.status !== 'pending',
  );
  if (candidates.length === 0) return [];

  const bySeeker = new Map(candidates.map((r) => [r._id.toString(), r]));

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
    .map((n) => bySeeker.get(n.seekerId)?.jobId)
    .filter((j): j is Types.ObjectId => !!j);
  const jobs = jobIds.length
    ? await JobModel.find({ _id: { $in: jobIds } }).select('title').lean()
    : [];
  const titleMap = new Map(
    jobs.map((j) => [(j._id as Types.ObjectId).toString(), (j as { title?: string }).title ?? null]),
  );

  // 4. Merge the live beacon with the application context.
  return nearby.map((n) => {
    const c = bySeeker.get(n.seekerId);
    return {
      seeker: n.seeker,
      distanceMeters: n.distanceMeters,
      availableUntil: n.until,
      lastApplied: {
        status: c?.status ?? 'viewed',
        appliedAt: c?.appliedAt ? new Date(c.appliedAt).toISOString() : null,
        jobTitle: c?.jobId ? titleMap.get(c.jobId.toString()) ?? null : null,
      },
    };
  });
}
