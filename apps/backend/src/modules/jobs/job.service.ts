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
import { logger } from '@/lib/logger';
import { sendNewJobPush, sendCrewShiftPush } from '@/lib/push';
import { CrewMemberModel } from '@/modules/crew/crew.model';
import { emitToUser } from '@/sockets/bus';
import { matchJobToAlerts } from '@/modules/alerts/alert.service';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';
import { JobModel, buildProject, type JobStatus, type PublicJob } from './job.model';
import { computeWomenSafety, type WomenSafety } from './womenSafety';
import { findSkillTest } from '@/modules/skillTests/skillTests.catalogue';
import type {
  CreateJobBody,
  NearbyQuery,
  PreviewQuery,
  ThisWeekQuery,
  TodayQuery,
  UpdateJobBody,
} from './job.schemas';

/** Notify seekers within this radius (metres) when a new job is posted. */
const NEW_JOB_NOTIFY_RADIUS_M = 25_000;
/** Hard cap on per-job fan-out so a single post can't blast tens of thousands. */
const NEW_JOB_NOTIFY_MAX_RECIPIENTS = 500;

interface NearbyHit extends PublicJob {
  distanceMeters: number;
}

export async function findNearby(query: NearbyQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const baseMatch: Record<string, unknown> = {
    status: 'active',
    // Hide jobs still inside their crew-first head-start window from the
    // public feed. `$not: {$gt: now}` matches null/absent + past timestamps.
    crewHeadStartUntil: { $not: { $gt: new Date() } },
  };
  if (query.type) baseMatch.type = query.type;
  if (query.workMode) baseMatch.workMode = query.workMode;
  if (query.safeForWomenOnly) baseMatch.safeForWomen = true;
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
    // Sort urgent jobs first within each ~500m distance bucket so a 2km
    // urgent job still beats a 200m non-urgent job, but a 200m urgent job
    // still wins overall. distanceBucket is computed inline so it doesn't
    // need to live on the document.
    {
      $addFields: {
        distanceBucket: { $floor: { $divide: ['$distanceMeters', 500] } },
        urgentRank: { $cond: [{ $eq: ['$urgent', true] }, 0, 1] },
      },
    },
    { $sort: { distanceBucket: 1, urgentRank: 1, distanceMeters: 1 } },
    { $project: { distanceBucket: 0, urgentRank: 0 } },
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

/**
 * "60-second first match" — public, lightweight, returns 3 jobs the
 * pre-signup seeker would plausibly take.
 *
 * Optimised for "first impression" rather than completeness:
 *   - Pulls active jobs within `radius` of the supplied coords.
 *   - Biases ranking toward jobs whose title or skills match `trade`
 *     (regex, case-insensitive) when provided.
 *   - Filters by `jobType` when provided.
 *   - Boosts urgent jobs and verified employers so the first impression
 *     reads as "high-trust, hiring right now".
 *   - Hard cap of 5; the screen shows 3.
 *
 * Returns `{ jobs }` only — no pagination, no "has more". This is a
 * conversion surface, not a feed.
 */
export async function findFirstMatch(query: PreviewQuery): Promise<{
  jobs: NearbyHit[];
}> {
  const baseMatch: Record<string, unknown> = {
    status: 'active',
    // Hide jobs still inside their crew-first head-start window from the
    // public feed. `$not: {$gt: now}` matches null/absent + past timestamps.
    crewHeadStartUntil: { $not: { $gt: new Date() } },
  };
  if (query.jobType) baseMatch.type = query.jobType;

  // Trade filter is a soft bias rather than a hard filter — we want
  // to show SOMETHING even if no job in the area matches the trade
  // string. So we use it for ranking, not for the $match.
  const tradeRegex = query.trade
    ? new RegExp(escapeRegex(query.trade), 'i')
    : null;

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
    {
      $addFields: {
        urgentRank: { $cond: [{ $eq: ['$urgent', true] }, 0, 1] },
      },
    },
    { $sort: { urgentRank: 1, distanceMeters: 1 } },
    { $project: { urgentRank: 0 } },
    // Pull a generous candidate pool so the in-memory trade boost has
    // material to re-rank. 20 is plenty when the cap is 5.
    { $limit: 20 },
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

  // Trade boost: title / skills regex match adds a small score. Verified
  // employer adds another small boost. Distance is the tiebreaker via
  // the pipeline sort above.
  const scored = rows.map((r) => {
    let bias = 0;
    if (tradeRegex) {
      if (typeof r.title === 'string' && tradeRegex.test(r.title)) bias += 30;
      const skills = (r.skills as string[] | undefined) ?? [];
      if (skills.some((s) => tradeRegex.test(s))) bias += 20;
    }
    if (r.employer && (r.employer as { isVerified?: boolean }).isVerified) {
      bias += 5;
    }
    // Auto-escalation feed boost: a stalling job that's been escalated
    // gets lifted while its boost window is live, so it draws eyes.
    const boostedUntil = (r.escalation as { boostedUntil?: Date | string | null } | null | undefined)
      ?.boostedUntil;
    if (boostedUntil && new Date(boostedUntil).getTime() > Date.now()) {
      bias += 40;
    }
    return { row: r, bias };
  });

  scored.sort((a, b) => {
    if (b.bias !== a.bias) return b.bias - a.bias;
    return (a.row.distanceMeters as number) - (b.row.distanceMeters as number);
  });

  const trimmed = scored.slice(0, query.limit).map((s) => s.row);

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

  return { jobs };
}

/**
 * "Today" feed — same geo pipeline as findNearby, but pre-filtered to
 * fresh + urgent jobs the worker could conceivably start within 24 hours.
 *
 * Filter rule: `urgent === true` OR posted in the last 24 hours.
 * Sort: urgent first within distance bucket, then nearest first. This
 * mirrors the chowk/labor-market mental model — "who's hiring right
 * now within walking distance?"
 */
export async function findToday(query: TodayQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const baseMatch: Record<string, unknown> = {
    status: 'active',
    $or: [{ urgent: true }, { createdAt: { $gte: oneDayAgo } }],
    crewHeadStartUntil: { $not: { $gt: new Date() } },
  };
  if (query.type) baseMatch.type = query.type;
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), 'i');
    // Wrap the existing $or with $and so we don't clobber the time/urgency filter.
    baseMatch.$and = [
      { $or: baseMatch.$or as unknown[] },
      { $or: [{ title: re }, { description: re }, { skills: re }] },
    ];
    delete baseMatch.$or;
  }
  return runGeoNearPipeline({
    lat: query.lat,
    lng: query.lng,
    radius: query.radius,
    limit: query.limit,
    baseMatch,
  });
}

/**
 * "This week" feed — short contracts + shifts posted in the last 7 days.
 * Wider default radius than Today because workers will commute further
 * for a week-long contract than a one-day gig.
 *
 * Filter rule: created in the last 7 days AND type IN (gig, shift, contract).
 * If the seeker also passed a `type=` filter, that intersects (a `gig`
 * query becomes literally "gigs posted this week").
 */
export async function findThisWeek(query: ThisWeekQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baseMatch: Record<string, unknown> = {
    status: 'active',
    createdAt: { $gte: sevenDaysAgo },
    crewHeadStartUntil: { $not: { $gt: new Date() } },
    type: query.type
      ? query.type
      : { $in: ['gig', 'shift', 'contract'] },
  };
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), 'i');
    baseMatch.$or = [{ title: re }, { description: re }, { skills: re }];
  }
  return runGeoNearPipeline({
    lat: query.lat,
    lng: query.lng,
    radius: query.radius,
    limit: query.limit,
    baseMatch,
  });
}

/**
 * Shared geo+employer-hydration pipeline. Extracted so the three feed
 * endpoints (nearby, today, this-week) don't drift apart on sort, employer
 * lookup, or has-more semantics.
 */
async function runGeoNearPipeline(input: {
  lat: number;
  lng: number;
  radius: number;
  limit: number;
  baseMatch: Record<string, unknown>;
}): Promise<{ jobs: NearbyHit[]; hasMore: boolean }> {
  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [input.lng, input.lat] },
        distanceField: 'distanceMeters',
        maxDistance: input.radius,
        spherical: true,
        query: input.baseMatch,
      },
    },
    {
      $addFields: {
        distanceBucket: { $floor: { $divide: ['$distanceMeters', 500] } },
        urgentRank: { $cond: [{ $eq: ['$urgent', true] }, 0, 1] },
      },
    },
    { $sort: { distanceBucket: 1, urgentRank: 1, distanceMeters: 1 } },
    { $project: { distanceBucket: 0, urgentRank: 0 } },
    { $limit: input.limit + 1 },
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
  const hasMore = rows.length > input.limit;
  const trimmed = hasMore ? rows.slice(0, input.limit) : rows;

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

export interface JobLocationSuggestion {
  /** City name as posted. */
  city: string;
  /** Representative coordinate to re-centre the nearby search on. */
  lat: number;
  lng: number;
  /** How many active jobs are in this city. */
  jobCount: number;
}

/**
 * Distinct cities that currently have active jobs, optionally narrowed by
 * a text query. Powers the Jobs-screen location picker — a worker can
 * search jobs in a place other than where they physically are, and these
 * suggestions only ever point at places that actually have jobs.
 */
export async function listJobLocations(
  q?: string,
): Promise<JobLocationSuggestion[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        status: 'active',
        'location.city': { $type: 'string', $ne: '' },
        'location.geo.coordinates': { $type: 'array' },
      },
    },
  ];

  const query = (q ?? '').trim();
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pipeline.push({
      $match: { 'location.city': { $regex: escaped, $options: 'i' } },
    });
  }

  pipeline.push(
    {
      $group: {
        _id: { $toLower: '$location.city' },
        city: { $first: '$location.city' },
        coordinates: { $first: '$location.geo.coordinates' },
        jobCount: { $sum: 1 },
      },
    },
    { $sort: { jobCount: -1 } },
    { $limit: 12 },
  );

  const rows = await JobModel.aggregate<{
    city: string;
    coordinates: [number, number];
    jobCount: number;
  }>(pipeline);

  return rows
    .filter((r) => Array.isArray(r.coordinates) && r.coordinates.length === 2)
    .map((r) => ({
      city: r.city,
      lng: r.coordinates[0],
      lat: r.coordinates[1],
      jobCount: r.jobCount,
    }));
}

export async function findById(jobId: string): Promise<PublicJob> {
  // audioDescriptionUrl is select:false (list payloads stay small);
  // detail callers explicitly include it so the seeker can play it back.
  const job = await JobModel.findById(jobId).select('+audioDescriptionUrl');
  if (!job) throw errors.jobNotFound();

  // Bump views — fire-and-forget. Mongoose 8 queries are lazy: `void`
  // alone does NOT trigger execution; we need .exec() to send the update.
  JobModel.updateOne({ _id: job._id }, { $inc: { viewsCount: 1 } })
    .exec()
    .catch((err) =>
      logger.warn({ err, jobId: job._id.toString() }, 'viewsCount bump failed'),
    );

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

/**
 * Normalise an optional project date pair into the persisted fields.
 * Both must be present and end ≥ start, else the job is a one-off (nulls).
 */
function projectDates(
  start: string | null,
  end: string | null,
): { projectStartDate: Date | null; projectEndDate: Date | null } {
  if (!start || !end) return { projectStartDate: null, projectEndDate: null };
  const s = new Date(`${start}T00:00:00.000Z`);
  const e = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e.getTime() < s.getTime()) {
    return { projectStartDate: null, projectEndDate: null };
  }
  return { projectStartDate: s, projectEndDate: e };
}

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
    // Only persist a skill-check slug that maps to a real test; an unknown
    // slug is dropped to null rather than storing a dead reference.
    requiredSkillTestId:
      input.requiredSkillTestId && findSkillTest(input.requiredSkillTestId)
        ? input.requiredSkillTestId
        : null,
    headcount: input.headcount ?? 1,
    recurring: input.recurring ?? false,
    prepChecklist: input.prepChecklist ?? [],
    // Multi-day project: persist only when BOTH dates are present and the
    // end isn't before the start; otherwise leave it a one-off.
    ...projectDates(input.projectStartDate ?? null, input.projectEndDate ?? null),
    crewHeadStartUntil:
      input.crewFirstHours && input.crewFirstHours > 0
        ? new Date(Date.now() + input.crewFirstHours * 60 * 60 * 1000)
        : null,
    workMode: input.workMode ?? 'onsite',
    schedule: input.schedule ?? null,
    status: 'active',
    urgent: input.urgent ?? false,
    audioDescriptionUrl: input.audioDescriptionUrl ?? null,
    audioDescriptionDurationSeconds: input.audioDescriptionDurationSeconds ?? null,
    workplaceAnswers: input.workplaceAnswers ?? null,
    womenSafety: input.womenSafety ?? null,
    // `safeForWomen` is derived from the women-safety signals — true the
    // moment the employer declares at least one. This is what powers the
    // "Women-safe only" filter and the seeker's Women's Mode.
    safeForWomen: computeWomenSafety(input.womenSafety ?? null).score > 0,
  });

  const publicJob = job.toPublicJSON();

  if (job.crewHeadStartUntil) {
    // Crew-first: the job is hidden from public feeds during the window, so
    // we DON'T fan out to nearby seekers / job alerts yet — that would
    // defeat the head-start. Instead, push only to the employer's saved
    // crew, who get first dibs.
    void fanOutToCrew(employerId, publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'crew-first fan-out failed');
    });
  } else {
    // Fan out a "new job near you" push to nearby seekers — fire-and-forget
    // so a slow notification round never blocks the create response.
    void notifySeekersOfNewJob(publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'new-job notification fan-out failed');
    });

    // Match this job against every seeker's saved Job Alerts. Targeted
    // pushes to people who specifically asked to hear about this kind of
    // role — separate from the proximity-based fan-out above so a seeker
    // can opt into more granular alerts beyond just "nearby + my type".
    void matchJobToAlerts(publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'job alert matching failed');
    });
  }

  return publicJob;
}

export interface WageBenchmark {
  /** False when too few comparable posts exist to benchmark against. */
  hasBenchmark: boolean;
  sampleSize: number;
  /** Median pay (paise) for the same type/city/period nearby. */
  medianPaise: number | null;
  /** This job's pay (paise). */
  yourPaise: number;
  /** True when this job pays below the local median. */
  belowMarket: boolean;
  period: string;
  currency: string;
}

/**
 * Wage benchmark for one of the employer's jobs: how its pay compares to
 * the local median for the same job type, city, and pay period. Powers the
 * "cooks near you post ₹650/day; yours is ₹520 — that's why it's slow"
 * nudge. Reuses the same window + city-match approach as the public
 * pay-stats endpoint.
 */
export async function getWageBenchmark(
  employerId: string,
  jobId: string,
): Promise<WageBenchmark> {
  const job = await JobModel.findById(jobId).select('employerId type pay location').lean();
  if (!job) throw errors.jobNotFound();
  if ((job.employerId as unknown as Types.ObjectId).toString() !== employerId) {
    throw errors.forbidden();
  }
  const pay = (job as { pay?: { amount?: number; period?: string; currency?: string } }).pay ?? {};
  const city = (job as { location?: { city?: string } }).location?.city ?? '';
  const yourPaise = pay.amount ?? 0;
  const period = pay.period ?? 'day';
  const currency = pay.currency ?? 'INR';

  const base: WageBenchmark = {
    hasBenchmark: false,
    sampleSize: 0,
    medianPaise: null,
    yourPaise,
    belowMarket: false,
    period,
    currency,
  };
  if (!city) return base;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const docs = await JobModel.find({
    _id: { $ne: new Types.ObjectId(jobId) },
    status: 'active',
    type: (job as { type?: string }).type,
    'pay.period': period,
    'location.city': new RegExp(`^${escapeRegex(city)}$`, 'i'),
    createdAt: { $gte: since },
  })
    .select('pay.amount')
    .lean();

  const amounts = docs
    .map((d) => (d as { pay?: { amount?: number } }).pay?.amount)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);
  if (amounts.length < 5) return base;

  const mid = Math.floor(amounts.length / 2);
  const median =
    amounts.length % 2 === 0 ? Math.round((amounts[mid - 1]! + amounts[mid]!) / 2) : amounts[mid]!;

  return {
    hasBenchmark: true,
    sampleSize: amounts.length,
    medianPaise: median,
    yourPaise,
    belowMarket: yourPaise > 0 && yourPaise < median,
    period,
    currency,
  };
}

export interface ProjectProgress {
  isProject: boolean;
  startDate: string | null;
  endDate: string | null;
  totalDays: number;
  /** Days elapsed inclusive of today, clamped to [0, totalDays]. */
  elapsedDays: number;
  remainingDays: number;
  percentElapsed: number;
  hiredCount: number;
  workers: { workerId: string; name: string; photoUrl: string | null; daysAttended: number }[];
}

/**
 * Progress of a multi-day project job for its owning employer: where we
 * are in the span (Day X of N) plus per-hired-worker days attended,
 * derived from shift check-ins already recorded for this job. Read-only.
 */
export async function getProjectProgress(
  employerId: string,
  jobId: string,
): Promise<ProjectProgress> {
  const job = await JobModel.findById(jobId)
    .select('employerId projectStartDate projectEndDate')
    .lean();
  if (!job) throw errors.jobNotFound();
  if ((job.employerId as unknown as Types.ObjectId).toString() !== employerId) {
    throw errors.forbidden();
  }

  const project = buildProject(
    (job as { projectStartDate?: Date | null }).projectStartDate ?? null,
    (job as { projectEndDate?: Date | null }).projectEndDate ?? null,
  );
  const empty: ProjectProgress = {
    isProject: false,
    startDate: null,
    endDate: null,
    totalDays: 0,
    elapsedDays: 0,
    remainingDays: 0,
    percentElapsed: 0,
    hiredCount: 0,
    workers: [],
  };
  if (!project) return empty;

  const DAY = 24 * 60 * 60 * 1000;
  const startMs = new Date(`${project.startDate}T00:00:00.000Z`).getTime();
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
  const elapsedDays = Math.max(0, Math.min(project.totalDays, Math.floor((todayMs - startMs) / DAY) + 1));
  const remainingDays = Math.max(0, project.totalDays - elapsedDays);
  const percentElapsed = Math.round((elapsedDays / project.totalDays) * 100);

  // Hired workers on this job.
  const hired = await ApplicationModel.find({
    jobId: new Types.ObjectId(jobId),
    status: 'hired',
  })
    .select('seekerId')
    .lean();
  const seekerIds = hired.map((h) => h.seekerId as unknown as Types.ObjectId);

  // Distinct days each hired worker checked in for this job.
  const checkIns = await ShiftCheckInModel.find({
    jobId: new Types.ObjectId(jobId),
    kind: 'check_in',
  })
    .select('seekerId timestamp')
    .lean();
  const daysByWorker = new Map<string, Set<string>>();
  for (const c of checkIns) {
    const wid = (c.seekerId as unknown as Types.ObjectId).toString();
    const day = new Date(c.timestamp as Date).toISOString().slice(0, 10);
    if (!daysByWorker.has(wid)) daysByWorker.set(wid, new Set());
    daysByWorker.get(wid)!.add(day);
  }

  const users = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl')
    .lean();
  const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]));

  const workers = seekerIds.map((id) => {
    const wid = id.toString();
    const u = userMap.get(wid);
    return {
      workerId: wid,
      name: (u as { name?: string } | undefined)?.name ?? 'Worker',
      photoUrl: (u as { photoUrl?: string | null } | undefined)?.photoUrl ?? null,
      daysAttended: daysByWorker.get(wid)?.size ?? 0,
    };
  });

  return {
    isProject: true,
    startDate: project.startDate,
    endDate: project.endDate,
    totalDays: project.totalDays,
    elapsedDays,
    remainingDays,
    percentElapsed,
    hiredCount: seekerIds.length,
    workers,
  };
}

/**
 * Re-post a previous job as a fresh, active posting — "same as last
 * Friday" without refilling the form. Copies the substantive fields and
 * runs the normal createJob path (so notifications/alerts fire). A fresh
 * post starts public (crew-first head-start is not carried over).
 */
export async function repostJob(
  employerId: string,
  jobId: string,
): Promise<PublicJob> {
  const job = await JobModel.findById(jobId);
  if (!job) throw errors.jobNotFound();
  if (job.employerId.toString() !== employerId) throw errors.forbidden();

  const body: CreateJobBody = {
    title: job.title,
    description: job.description,
    type: job.type,
    pay: {
      amount: job.pay.amount,
      amountMax: job.pay.amountMax ?? null,
      period: job.pay.period,
      currency: job.pay.currency ?? 'INR',
    },
    location: {
      address: job.location.address,
      city: job.location.city,
      area: job.location.area ?? null,
      pincode: job.location.pincode ?? null,
      lat: job.location.geo.coordinates[1],
      lng: job.location.geo.coordinates[0],
    },
    skills: [...(job.skills ?? [])],
    requiredSkillTestId: job.requiredSkillTestId ?? null,
    headcount: job.headcount ?? 1,
    recurring: job.recurring ?? false,
    prepChecklist: [...(job.prepChecklist ?? [])],
    workMode: job.workMode ?? 'onsite',
    schedule: job.schedule
      ? {
          days: job.schedule.days ?? undefined,
          startTime: job.schedule.startTime ?? null,
          endTime: job.schedule.endTime ?? null,
          hoursPerDay: job.schedule.hoursPerDay ?? null,
        }
      : null,
    urgent: Boolean(job.urgent),
    workplaceAnswers: job.workplaceAnswers ?? null,
    womenSafety: job.womenSafety ?? null,
  };

  return createJob(employerId, body);
}

/**
 * Push a crew-first job to every worker in the employer's saved crew.
 * Best-effort, one push per crew member. Runs only during the head-start
 * window (public fan-out is suppressed meanwhile).
 */
async function fanOutToCrew(employerId: string, job: PublicJob): Promise<void> {
  const [members, employer] = await Promise.all([
    CrewMemberModel.find({ employerId: new Types.ObjectId(employerId) })
      .select('workerId')
      .lean(),
    UserModel.findById(employerId).select('companyName name').lean(),
  ]);
  if (members.length === 0) return;
  const employerName =
    (employer as { companyName?: string | null; name?: string } | null)?.companyName ??
    (employer as { name?: string } | null)?.name ??
    undefined;
  for (const m of members) {
    void sendCrewShiftPush({
      recipientId: (m.workerId as Types.ObjectId).toString(),
      jobId: job.id,
      jobTitle: job.title,
      employerName,
    });
  }
}

/**
 * Notify seekers near a freshly-posted job. Filters:
 *   - role: 'seeker'
 *   - has at least one Expo push token registered
 *   - within NEW_JOB_NOTIFY_RADIUS_M of the job location (uses 2dsphere)
 *   - capped at NEW_JOB_NOTIFY_MAX_RECIPIENTS to bound the blast radius
 *
 * We only push for jobs that match `seeker.preferredJobTypes` when the
 * field is set; an empty preference list means "all types".
 */
async function notifySeekersOfNewJob(job: PublicJob): Promise<void> {
  if (job.status !== 'active') return;

  const [lng, lat] = job.location.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return;

  const seekerQuery: Record<string, unknown> = {
    role: 'seeker',
    'expoPushTokens.0': { $exists: true },
    'location.geo': {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: NEW_JOB_NOTIFY_RADIUS_M,
      },
    },
  };

  const seekers = await UserModel.find(seekerQuery)
    .select('_id preferredJobTypes')
    .limit(NEW_JOB_NOTIFY_MAX_RECIPIENTS)
    .lean();

  // Honor preferredJobTypes if the seeker set one; treat empty/missing as
  // "open to all" so we don't silently exclude users with default profiles.
  const recipients = seekers
    .filter((s) => {
      const prefs = (s as unknown as { preferredJobTypes?: string[] })
        .preferredJobTypes;
      if (!Array.isArray(prefs) || prefs.length === 0) return true;
      return prefs.includes(job.type);
    })
    .map((s) => (s._id as Types.ObjectId).toString());

  if (recipients.length === 0) return;

  // Live socket event for users currently in-app.
  for (const id of recipients) {
    emitToUser(id, 'job:new', {
      jobId: job.id,
      title: job.title,
      city: job.location.city,
    });
  }

  await sendNewJobPush({
    recipientIds: recipients,
    jobId: job.id,
    jobTitle: job.title,
    city: job.location.city,
  });
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
  // Include audioDescriptionUrl so the public JSON serializer reads
  // whatever value was previously stored, not undefined.
  const job = await JobModel.findById(jobId).select('+audioDescriptionUrl');
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
  if (input.workMode !== undefined) job.workMode = input.workMode;
  if (input.schedule !== undefined) job.schedule = input.schedule ?? null;
  if (input.urgent !== undefined) job.urgent = input.urgent;
  if (input.audioDescriptionUrl !== undefined) {
    job.audioDescriptionUrl = input.audioDescriptionUrl;
  }
  if (input.audioDescriptionDurationSeconds !== undefined) {
    job.audioDescriptionDurationSeconds = input.audioDescriptionDurationSeconds;
  }
  if (input.womenSafety !== undefined) {
    job.womenSafety = input.womenSafety;
    // Keep the derived flag in sync with the signals.
    job.safeForWomen = computeWomenSafety(input.womenSafety).score > 0;
  }

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
export function formatRawJob(r: Record<string, unknown>): PublicJob {
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
    requiredSkillTestId: (r.requiredSkillTestId as string | null | undefined) ?? null,
    headcount: (r.headcount as number | undefined) ?? 1,
    crewHeadStartUntil: (() => {
      const v = r.crewHeadStartUntil as Date | string | null | undefined;
      return v ? new Date(v).toISOString() : null;
    })(),
    recurring: Boolean(r.recurring),
    prepChecklist: (r.prepChecklist as string[] | undefined) ?? [],
    project: buildProject(
      (r.projectStartDate as Date | string | null | undefined) ?? null,
      (r.projectEndDate as Date | string | null | undefined) ?? null,
    ),
    escalationStage:
      ((r.escalation as { stage?: number } | null | undefined)?.stage as number | undefined) ?? 0,
    boostedUntil: (() => {
      const v = (r.escalation as { boostedUntil?: Date | string | null } | null | undefined)?.boostedUntil;
      return v && new Date(v).getTime() > Date.now() ? new Date(v).toISOString() : null;
    })(),
    workMode: (r.workMode as PublicJob['workMode']) ?? 'onsite',
    schedule: (r.schedule as PublicJob['schedule']) ?? null,
    status: r.status as PublicJob['status'],
    urgent: Boolean(r.urgent),
    safeForWomen: Boolean(r.safeForWomen),
    applicantsCount: (r.applicantsCount as number) ?? 0,
    // audioDescriptionUrl is select:false at the model level so the
    // geoNear pipelines (list payloads) don't carry the base64 blob.
    // It's still nullable on PublicJob, so default to null here.
    audioDescriptionUrl: (r.audioDescriptionUrl as string | null | undefined) ?? null,
    audioDescriptionDurationSeconds:
      (r.audioDescriptionDurationSeconds as number | null | undefined) ?? null,
    // Reverse Interview answers. List/nearby pipelines may not project
    // this field; default to null so list cards (which don't show the
    // panel anyway) stay valid. The JobDetail read uses toPublicJSON.
    workplaceAnswers:
      (r.workplaceAnswers as PublicJob['workplaceAnswers'] | undefined) ?? null,
    // Women-safety signals + the derived tier. Nearby/list pipelines may
    // not project womenSafety; default to null so list cards stay valid.
    womenSafety: (r.womenSafety as WomenSafety | null | undefined) ?? null,
    womenSafetyTier: computeWomenSafety(
      (r.womenSafety as WomenSafety | null | undefined) ?? null,
    ).tier,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}
