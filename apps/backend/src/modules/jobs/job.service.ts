/**
 * Jobs service — pure business logic, no HTTP types.
 *
 * Geo strategy:
 *   $geoNear (aggregation) is used for nearby search. It's the only Mongo
 *   stage that can compute distance-from-point AND filter by max distance
 *   AND honor compound filters (type, status, text) in one pass. We rely
 *   on the 2dsphere index on Job.location.geo for performance.
 *
 *   The result is hydrated with employer summary (name + verified) so the
 *   client doesn't need a second round-trip. We use $lookup but only pull
 *   the four fields we need.
 *
 * Save/unsave:
 *   Bookmarks live on User.savedJobs (array of ObjectIds). $addToSet
 *   makes save idempotent; $pull makes unsave a no-op when not saved.
 */

import { Types, type PipelineStage } from 'mongoose';
import { errors } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { JobModel, type JobStatus, type PublicJob } from './job.model';
import type { CreateJobBody, NearbyQuery, UpdateJobBody } from './job.schemas';

interface NearbyHit extends PublicJob {
  distanceMeters: number;
}

export async function findNearby(query: NearbyQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const baseMatch: Record<string, unknown> = { status: 'active' };
  if (query.type) baseMatch.type = query.type;
  if (query.q) {
    // Simple OR across title, description, skills. Phase 5 swaps to
    // proper text index for Hindi/Kannada-aware tokenization.
    const re = new RegExp(escapeRegex(query.q), 'i');
    baseMatch.$or = [{ title: re }, { description: re }, { skills: re }];
  }

  // Pipeline left as a mutable array — Mongoose's aggregate() typing
  // doesn't accept the readonly tuple `as const` would produce.
  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [query.lng, query.lat] },
        distanceField: 'distanceMeters',
        maxDistance: query.radius,
        spherical: true,
        query: baseMatch,
      },
    },
    { $limit: query.limit + 1 }, // +1 to detect "has more" without a count query
    {
      $lookup: {
        from: 'users',
        localField: 'employerId',
        foreignField: '_id',
        as: 'employer',
        pipeline: [{ $project: { name: 1, isVerified: 1, photoUrl: 1, companyName: 1 } }],
      },
    },
    { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
  ];

  const rows = await JobModel.aggregate(pipeline);
  const hasMore = rows.length > query.limit;
  const trimmed = hasMore ? rows.slice(0, query.limit) : rows;

  const jobs: NearbyHit[] = trimmed.map((r) => ({
    ...formatRawJob(r),
    distanceMeters: Math.round(r.distanceMeters as number),
    employer: r.employer
      ? {
          id: (r.employer._id as Types.ObjectId).toString(),
          name: r.employer.name as string,
          isVerified: Boolean(r.employer.isVerified),
          photoUrl: (r.employer.photoUrl as string | null | undefined) ?? null,
          companyName:
            (r.employer.companyName as string | null | undefined) ?? null,
        }
      : undefined,
  }));

  return { jobs, hasMore };
}

export async function findById(jobId: string): Promise<PublicJob> {
  const job = await JobModel.findById(jobId);
  if (!job) throw errors.jobNotFound();

  // Bump views — fire-and-forget.
  void JobModel.updateOne({ _id: job._id }, { $inc: { viewsCount: 1 } });

  // Hydrate employer.
  const employer = await UserModel.findById(job.employerId)
    .select('name isVerified photoUrl companyName')
    .lean();

  return {
    ...job.toPublicJSON(),
    employer: employer
      ? {
          id: (employer._id as Types.ObjectId).toString(),
          name: employer.name,
          isVerified: Boolean(employer.isVerified),
          photoUrl: employer.photoUrl ?? null,
          companyName: employer.companyName ?? null,
        }
      : undefined,
  };
}

export async function saveJob(userId: string, jobId: string): Promise<void> {
  const job = await JobModel.findById(jobId).select('_id').lean();
  if (!job) throw errors.jobNotFound();
  await UserModel.updateOne({ _id: userId }, { $addToSet: { savedJobs: job._id } });
}

export async function unsaveJob(userId: string, jobId: string): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $pull: { savedJobs: new Types.ObjectId(jobId) } },
  );
}

export async function listSaved(userId: string): Promise<PublicJob[]> {
  const user = await UserModel.findById(userId).select('savedJobs').lean();
  if (!user || !user.savedJobs?.length) return [];

  const jobs = await JobModel.find({
    _id: { $in: user.savedJobs },
    status: 'active',
  });

  // Hydrate employer summaries in a single round-trip.
  const employerIds = [...new Set(jobs.map((j) => j.employerId.toString()))];
  const employers = await UserModel.find({ _id: { $in: employerIds } })
    .select('name isVerified photoUrl companyName')
    .lean();
  const employerMap = new Map(
    employers.map((e) => [
      (e._id as Types.ObjectId).toString(),
      {
        id: (e._id as Types.ObjectId).toString(),
        name: e.name,
        isVerified: Boolean(e.isVerified),
        photoUrl: e.photoUrl ?? null,
        companyName: e.companyName ?? null,
      },
    ]),
  );

  return jobs.map((j) => ({
    ...j.toPublicJSON(),
    employer: employerMap.get(j.employerId.toString()),
  }));
}

// ─── Employer-side operations (Phase 3) ─────────────────────────────────────

export async function createJob(
  employerId: string,
  input: CreateJobBody,
): Promise<PublicJob> {
  const job = await JobModel.create({
    employerId: new Types.ObjectId(employerId),
    title: input.title,
    description: input.description,
    type: input.type,
    pay: {
      amount: input.pay.amount,
      amountMax: input.pay.amountMax ?? null,
      period: input.pay.period,
      currency: input.pay.currency ?? 'INR',
    },
    location: {
      address: input.location.address,
      city: input.location.city,
      area: input.location.area ?? null,
      pincode: input.location.pincode ?? null,
      geo: {
        type: 'Point',
        coordinates: [input.location.lng, input.location.lat],
      },
    },
    skills: input.skills ?? [],
    schedule: input.schedule ?? null,
    status: 'active',
  });
  return job.toPublicJSON();
}

/**
 * Mutate a job. Throws forbidden if the caller doesn't own it. Empty
 * fields are left untouched, matching PATCH semantics.
 */
export async function updateJob(
  employerId: string,
  jobId: string,
  input: UpdateJobBody,
): Promise<PublicJob> {
  const job = await JobModel.findById(jobId);
  if (!job) throw errors.jobNotFound();
  if (job.employerId.toString() !== employerId) throw errors.forbidden();

  if (input.title !== undefined) job.title = input.title;
  if (input.description !== undefined) job.description = input.description;
  if (input.type !== undefined) job.type = input.type;
  if (input.pay !== undefined) {
    job.pay = {
      amount: input.pay.amount,
      amountMax: input.pay.amountMax ?? null,
      period: input.pay.period,
      currency: input.pay.currency ?? 'INR',
    };
  }
  if (input.location !== undefined) {
    job.location = {
      address: input.location.address,
      city: input.location.city,
      area: input.location.area ?? null,
      pincode: input.location.pincode ?? null,
      geo: {
        type: 'Point',
        coordinates: [input.location.lng, input.location.lat],
      },
    };
  }
  if (input.skills !== undefined) job.skills = input.skills;
  if (input.schedule !== undefined) job.schedule = input.schedule ?? null;

  await job.save();
  return job.toPublicJSON();
}

/**
 * Transition the job's lifecycle. We allow:
 *   active  ↔ paused
 *   active  → filled
 *   active  → expired
 *   paused  → expired
 *   any → active   (employer wants to "reopen")
 *
 * Anything else throws conflict.
 */
export async function transitionJobStatus(
  employerId: string,
  jobId: string,
  next: JobStatus,
): Promise<PublicJob> {
  const job = await JobModel.findById(jobId);
  if (!job) throw errors.jobNotFound();
  if (job.employerId.toString() !== employerId) throw errors.forbidden();

  const cur = job.status;
  const ok =
    next === 'active' ||
    (cur === 'active' && (next === 'paused' || next === 'filled' || next === 'expired')) ||
    (cur === 'paused' && next === 'expired');
  if (!ok) {
    throw errors.conflict(`Cannot transition job from ${cur} to ${next}.`);
  }

  job.status = next;
  await job.save();
  return job.toPublicJSON();
}

export async function listMine(
  employerId: string,
  filter: { status?: JobStatus; limit: number },
): Promise<PublicJob[]> {
  const q: Record<string, unknown> = { employerId: new Types.ObjectId(employerId) };
  if (filter.status) q.status = filter.status;
  const jobs = await JobModel.find(q).sort({ createdAt: -1 }).limit(filter.limit);
  return jobs.map((j) => j.toPublicJSON());
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The aggregate pipeline returns a raw doc (not a Mongoose hydration), so
 * we can't call .toPublicJSON(). This formatter does the same job.
 */
function formatRawJob(r: Record<string, unknown>): PublicJob {
  const loc = r.location as {
    address: string;
    city: string;
    area: string | null;
    pincode: string | null;
    geo: { coordinates: [number, number] };
  };
  const pay = r.pay as {
    amount: number;
    amountMax: number | null;
    period: PublicJob['pay']['period'];
    currency: string;
  };
  return {
    id: (r._id as Types.ObjectId).toString(),
    title: r.title as string,
    description: r.description as string,
    type: r.type as PublicJob['type'],
    pay: {
      amount: pay.amount,
      amountMax: pay.amountMax ?? null,
      period: pay.period,
      currency: pay.currency,
    },
    location: {
      address: loc.address,
      city: loc.city,
      area: loc.area ?? null,
      pincode: loc.pincode ?? null,
      coordinates: loc.geo.coordinates,
    },
    skills: (r.skills as string[]) ?? [],
    schedule: (r.schedule as PublicJob['schedule']) ?? null,
    status: r.status as PublicJob['status'],
    applicantsCount: (r.applicantsCount as number) ?? 0,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}
