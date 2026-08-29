/**
 * Jobs service — pure business logic, no HTTP types.
 *
 * Ported from MongoDB/Mongoose to Postgres/Drizzle (Phase 2, Jobs module).
 * Every exported function keeps its original signature and PublicJob
 * response shape — this is a storage-layer swap, not a behavior change.
 *
 * Geo strategy (was Mongo $geoNear + 2dsphere):
 *   `jobs.geo` is a real PostGIS geometry(Point) column (see
 *   src/db/schema/jobs.ts). Nearby/today/this-week/preview all use
 *   `ST_DWithin`/`ST_Distance` against `::geography` casts, re-asserting
 *   SRID 4326 explicitly on every read (`ST_SetSRID(geo, 4326)`) rather
 *   than relying on the column's stored SRID metadata — this is defensive
 *   but harmless, and sidesteps any doubt about what SRID Drizzle's
 *   generic geometry insert path tags a value with.
 *
 * Employer/seeker hydration now JOINs the real Postgres `users` table
 * directly (Users was ported to Postgres in Phase 1) — no more separate
 * $lookup stage or a second round-trip to a stale Mongo `users` collection.
 *
 * Scope note: `getProjectProgress`'s hired-workers count depends on
 * Applications + ShiftCheckIn data, which aren't ported yet (that's a
 * separate module, out of scope for this pass) — it now returns an
 * honest empty state instead of crashing on a Mongo ObjectId cast (a
 * Postgres job id is a UUID, never a valid Mongo ObjectId hex string).
 */

import { and, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendNewJobPush, sendCrewShiftPush } from '@/lib/push';
import { crewMembers } from '@/db/schema/extras';
import { emitToUser } from '@/sockets/bus';
import { matchJobToAlerts } from '@/modules/alerts/alert.service';
import { getDb } from '@/db/client';
import { jobs } from '@/db/schema/jobs';
import { users } from '@/db/schema/users';
import { buildProject, type JobStatus, type PublicJob } from './job.model';
import { toPublicJob, toPublicJobFromRaw, type RawGeoJobRow } from './job.serializers';
import { computeWomenSafety } from './womenSafety';
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
/** Safety cap on the candidate pool pulled before the in-app distance filter. */
const NEW_JOB_NOTIFY_CANDIDATE_POOL = 5000;

interface NearbyHit extends PublicJob {
  distanceMeters: number;
}

const EMPLOYER_SUMMARY_COLUMNS = {
  id: true,
  name: true,
  isVerified: true,
  photoUrl: true,
  companyName: true,
} as const;

// Prefixed with j. throughout — jobs and users share several column names
// (id, skills, created_at, updated_at), which is ambiguous once joined.
const GEO_SELECT_COLUMNS = sql.raw(`
  j.id, j.title, j.description, j.type,
  j.pay_amount, j.pay_amount_max, j.pay_period, j.pay_currency,
  j.address, j.city, j.area, j.pincode,
  ST_X(j.geo) as lng, ST_Y(j.geo) as lat,
  j.skills, j.work_mode, j.required_skill_test_id, j.headcount,
  j.crew_head_start_until, j.recurring, j.prep_checklist,
  j.project_start_date, j.project_end_date, j.escalation, j.schedule,
  j.status, j.urgent, j.safe_for_women, j.applicants_count,
  j.audio_description_duration_seconds, j.workplace_answers, j.women_safety,
  j.created_at
`);

/** ST_DWithin/ST_Distance always re-assert SRID 4326 rather than trust the stored value. */
function geoDistanceExpr(lat: number, lng: number): SQL {
  return sql`ST_Distance(ST_SetSRID(j.geo, 4326)::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`;
}

function geoWithinExpr(lat: number, lng: number, radiusMeters: number): SQL {
  return sql`ST_DWithin(ST_SetSRID(j.geo, 4326)::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})`;
}

/** Escape Postgres ILIKE metacharacters (% and _) in free-text user input. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

function textSearchCondition(q: string): SQL {
  const pattern = `%${escapeLike(q)}%`;
  return sql`(j.title ILIKE ${pattern} OR j.description ILIKE ${pattern} OR EXISTS (SELECT 1 FROM unnest(j.skills) s WHERE s ILIKE ${pattern}))`;
}

async function runGeoFeedQuery(input: {
  lat: number;
  lng: number;
  radius: number;
  limit: number;
  extra: SQL[];
}): Promise<{ jobs: NearbyHit[]; hasMore: boolean }> {
  const db = getDb();
  const where = sql.join(
    [
      sql`j.status = 'active'`,
      sql`(j.crew_head_start_until IS NULL OR j.crew_head_start_until <= now())`,
      geoWithinExpr(input.lat, input.lng, input.radius),
      ...input.extra,
    ],
    sql` AND `,
  );

  const rows = await db.execute<RawGeoJobRow>(sql`
    SELECT ${GEO_SELECT_COLUMNS},
      ${geoDistanceExpr(input.lat, input.lng)} as distance_meters,
      u.id as employer_id, u.name as employer_name, u.is_verified as employer_verified,
      u.photo_url as employer_photo_url, u.company_name as employer_company_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.employer_id
    WHERE ${where}
    ORDER BY floor(${geoDistanceExpr(input.lat, input.lng)} / 500) ASC, (CASE WHEN j.urgent THEN 0 ELSE 1 END) ASC, distance_meters ASC
    LIMIT ${input.limit + 1}
  `);

  const hasMore = rows.length > input.limit;
  const trimmed = hasMore ? rows.slice(0, input.limit) : rows;
  return { jobs: trimmed.map((r) => toPublicJobFromRaw(r) as NearbyHit), hasMore };
}

export async function findNearby(query: NearbyQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const extra: SQL[] = [];
  if (query.type) extra.push(sql`j.type = ${query.type}`);
  if (query.workMode) extra.push(sql`j.work_mode = ${query.workMode}`);
  if (query.safeForWomenOnly) extra.push(sql`j.safe_for_women = true`);
  if (query.q) extra.push(textSearchCondition(query.q));

  return runGeoFeedQuery({ lat: query.lat, lng: query.lng, radius: query.radius, limit: query.limit, extra });
}

/**
 * "Similar jobs hiring now" — the positive reframe on a rejection (see
 * applications/skillGap + rejectionExplainer). Other ACTIVE jobs near a
 * point, sharing at least one skill with the job the seeker was
 * rejected from, excluding that job itself. Reuses the same geo-feed
 * query as findNearby — same ranking, same shape, nothing new to learn
 * on the client.
 */
export async function findSimilarActiveJobs(input: {
  lat: number;
  lng: number;
  radius: number;
  excludeJobId: string;
  skills: string[];
  limit: number;
}): Promise<NearbyHit[]> {
  const extra: SQL[] = [sql`j.id != ${input.excludeJobId}`];
  if (input.skills.length > 0) {
    extra.push(sql`EXISTS (SELECT 1 FROM unnest(j.skills) js WHERE js = ANY(${input.skills}))`);
  }
  const { jobs } = await runGeoFeedQuery({
    lat: input.lat,
    lng: input.lng,
    radius: input.radius,
    limit: input.limit,
    extra,
  });
  return jobs;
}

/**
 * "60-second first match" — public, lightweight, returns 3 jobs the
 * pre-signup seeker would plausibly take. See job.service's original
 * Mongo-era docstring for the ranking rationale (trade bias, verified
 * employer boost, escalation boost) — unchanged here, just re-scored in
 * JS over a Postgres-sourced candidate pool instead of a Mongo one.
 */
export async function findFirstMatch(query: PreviewQuery): Promise<{
  jobs: NearbyHit[];
}> {
  const db = getDb();
  const extra: SQL[] = [];
  if (query.jobType) extra.push(sql`j.type = ${query.jobType}`);

  const where = sql.join(
    [
      sql`j.status = 'active'`,
      sql`(j.crew_head_start_until IS NULL OR j.crew_head_start_until <= now())`,
      geoWithinExpr(query.lat, query.lng, query.radius),
      ...extra,
    ],
    sql` AND `,
  );

  const rows = await db.execute<RawGeoJobRow>(sql`
    SELECT ${GEO_SELECT_COLUMNS},
      ${geoDistanceExpr(query.lat, query.lng)} as distance_meters,
      u.id as employer_id, u.name as employer_name, u.is_verified as employer_verified,
      u.photo_url as employer_photo_url, u.company_name as employer_company_name
    FROM jobs j
    LEFT JOIN users u ON u.id = j.employer_id
    WHERE ${where}
    ORDER BY (CASE WHEN j.urgent THEN 0 ELSE 1 END) ASC, distance_meters ASC
    LIMIT 20
  `);

  const tradeRegex = query.trade ? new RegExp(escapeRegex(query.trade), 'i') : null;

  const scored = rows.map((r) => {
    let bias = 0;
    if (tradeRegex) {
      if (tradeRegex.test(r.title)) bias += 30;
      if ((r.skills ?? []).some((s) => tradeRegex.test(s))) bias += 20;
    }
    if (r.employer_verified) bias += 5;
    const boostedUntil = r.escalation?.boostedUntil;
    if (boostedUntil && new Date(boostedUntil).getTime() > Date.now()) bias += 40;
    return { row: r, bias };
  });

  scored.sort((a, b) => (b.bias !== a.bias ? b.bias - a.bias : a.row.distance_meters - b.row.distance_meters));
  const trimmed = scored.slice(0, query.limit).map((s) => s.row);

  return { jobs: trimmed.map((r) => toPublicJobFromRaw(r) as NearbyHit) };
}

export async function findToday(query: TodayQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const extra: SQL[] = [sql`(j.urgent = true OR j.created_at >= ${oneDayAgo}::timestamptz)`];
  if (query.type) extra.push(sql`j.type = ${query.type}`);
  if (query.q) extra.push(textSearchCondition(query.q));

  return runGeoFeedQuery({ lat: query.lat, lng: query.lng, radius: query.radius, limit: query.limit, extra });
}

export async function findThisWeek(query: ThisWeekQuery): Promise<{
  jobs: NearbyHit[];
  hasMore: boolean;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const extra: SQL[] = [sql`j.created_at >= ${sevenDaysAgo}::timestamptz`];
  extra.push(
    query.type
      ? sql`j.type = ${query.type}`
      : sql`j.type IN ('gig', 'shift', 'contract')`,
  );
  if (query.q) extra.push(textSearchCondition(query.q));

  return runGeoFeedQuery({ lat: query.lat, lng: query.lng, radius: query.radius, limit: query.limit, extra });
}

export interface JobLocationSuggestion {
  city: string;
  lat: number;
  lng: number;
  jobCount: number;
}

export async function listJobLocations(q?: string): Promise<JobLocationSuggestion[]> {
  const db = getDb();
  const conditions: SQL[] = [sql`status = 'active'`, sql`city IS NOT NULL AND city <> ''`];
  const query = (q ?? '').trim();
  if (query) conditions.push(sql`city ILIKE ${'%' + escapeLike(query) + '%'}`);

  const rows = await db.execute<{ city: string; lng: number; lat: number; job_count: number }>(sql`
    SELECT
      (array_agg(city))[1] as city,
      (array_agg(ST_X(geo)))[1] as lng,
      (array_agg(ST_Y(geo)))[1] as lat,
      count(*)::int as job_count
    FROM jobs
    WHERE ${sql.join(conditions, sql` AND `)}
    GROUP BY lower(city)
    ORDER BY job_count DESC
    LIMIT 12
  `);

  return rows.map((r) => ({ city: r.city, lng: r.lng, lat: r.lat, jobCount: r.job_count }));
}

export async function findById(jobId: string): Promise<PublicJob> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw errors.jobNotFound();

  // Bump views — fire-and-forget.
  db.update(jobs)
    .set({ viewsCount: sql`${jobs.viewsCount} + 1` })
    .where(eq(jobs.id, job.id))
    .catch((err: unknown) => logger.warn({ err, jobId: job.id }, 'viewsCount bump failed'));

  const employer = await db.query.users.findFirst({
    where: eq(users.id, job.employerId),
    columns: EMPLOYER_SUMMARY_COLUMNS,
  });

  return toPublicJob(job, {
    audioDescriptionUrl: job.audioDescriptionUrl ?? null,
    employer: employer
      ? {
          id: employer.id,
          name: employer.name,
          isVerified: employer.isVerified,
          photoUrl: employer.photoUrl ?? null,
          companyName: employer.companyName ?? null,
        }
      : undefined,
  });
}

export async function saveJob(userId: string, jobId: string): Promise<void> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId), columns: { id: true } });
  if (!job) throw errors.jobNotFound();

  // $addToSet-equivalent: only append when not already present, idempotent.
  await db
    .update(users)
    .set({ savedJobIds: sql`array_append(${users.savedJobIds}, ${job.id}::uuid)` })
    .where(and(eq(users.id, userId), sql`NOT (${job.id}::uuid = ANY(${users.savedJobIds}))`));
}

export async function unsaveJob(userId: string, jobId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ savedJobIds: sql`array_remove(${users.savedJobIds}, ${jobId}::uuid)` })
    .where(eq(users.id, userId));
}

export async function listSaved(userId: string): Promise<PublicJob[]> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { savedJobIds: true },
  });
  if (!user || !user.savedJobIds?.length) return [];

  const rows = await db.query.jobs.findMany({
    where: and(inArray(jobs.id, user.savedJobIds), eq(jobs.status, 'active')),
  });

  const employerIds = [...new Set(rows.map((j) => j.employerId))];
  const employerRows = employerIds.length
    ? await db.query.users.findMany({
        where: inArray(users.id, employerIds),
        columns: EMPLOYER_SUMMARY_COLUMNS,
      })
    : [];
  const employerMap = new Map(employerRows.map((e) => [e.id, e]));

  return rows.map((j) => {
    const e = employerMap.get(j.employerId);
    return toPublicJob(j, {
      audioDescriptionUrl: j.audioDescriptionUrl ?? null,
      employer: e
        ? {
            id: e.id,
            name: e.name,
            isVerified: e.isVerified,
            photoUrl: e.photoUrl ?? null,
            companyName: e.companyName ?? null,
          }
        : undefined,
    });
  });
}

// ─── Employer-side operations ───────────────────────────────────────────────

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

export async function createJob(employerId: string, input: CreateJobBody): Promise<PublicJob> {
  const db = getDb();
  const { projectStartDate, projectEndDate } = projectDates(
    input.projectStartDate ?? null,
    input.projectEndDate ?? null,
  );
  const womenSafety = input.womenSafety ?? null;

  const [job] = await db
    .insert(jobs)
    .values({
      employerId,
      title: input.title,
      description: input.description,
      type: input.type,
      payAmount: input.pay.amount,
      payAmountMax: input.pay.amountMax ?? null,
      payPeriod: input.pay.period,
      payCurrency: input.pay.currency ?? 'INR',
      address: input.location.address,
      city: input.location.city,
      area: input.location.area ?? null,
      pincode: input.location.pincode ?? null,
      geo: { x: input.location.lng, y: input.location.lat },
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
      projectStartDate,
      projectEndDate,
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
      womenSafety,
      // `safeForWomen` is derived from the women-safety signals — true the
      // moment the employer declares at least one.
      safeForWomen: computeWomenSafety(womenSafety).score > 0,
    })
    .returning();
  if (!job) throw new Error('job insert returned no row');

  const publicJob = toPublicJob(job, { audioDescriptionUrl: job.audioDescriptionUrl ?? null });

  if (job.crewHeadStartUntil) {
    // Crew-first: hidden from public feeds during the window, so we don't
    // fan out yet — only the employer's saved crew gets first dibs.
    void fanOutToCrew(employerId, publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'crew-first fan-out failed');
    });
  } else {
    void notifySeekersOfNewJob(publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'new-job notification fan-out failed');
    });
    void matchJobToAlerts(publicJob).catch((err) => {
      logger.warn({ err, jobId: job.id }, 'job alert matching failed');
    });
  }

  return publicJob;
}

export interface WageBenchmark {
  hasBenchmark: boolean;
  sampleSize: number;
  medianPaise: number | null;
  yourPaise: number;
  belowMarket: boolean;
  period: string;
  currency: string;
}

export async function getWageBenchmark(employerId: string, jobId: string): Promise<WageBenchmark> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    columns: { employerId: true, type: true, payAmount: true, payPeriod: true, payCurrency: true, city: true },
  });
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();

  const yourPaise = job.payAmount ?? 0;
  const period = job.payPeriod ?? 'day';
  const currency = job.payCurrency ?? 'INR';
  const city = job.city ?? '';

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
  const rows = await db.query.jobs.findMany({
    where: and(
      ne(jobs.id, jobId),
      eq(jobs.status, 'active'),
      eq(jobs.type, job.type),
      eq(jobs.payPeriod, period),
      sql`lower(${jobs.city}) = lower(${city})`,
      gte(jobs.createdAt, since),
    ),
    columns: { payAmount: true },
  });

  const amounts = rows
    .map((r) => r.payAmount)
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
  elapsedDays: number;
  remainingDays: number;
  percentElapsed: number;
  hiredCount: number;
  workers: { workerId: string; name: string; photoUrl: string | null; daysAttended: number }[];
}

export async function getProjectProgress(employerId: string, jobId: string): Promise<ProjectProgress> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    columns: { employerId: true, projectStartDate: true, projectEndDate: true },
  });
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();

  const project = buildProject(job.projectStartDate ?? null, job.projectEndDate ?? null);
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

  // Applications/ShiftCheckIn aren't ported to Postgres yet (separate
  // module, out of scope for the Jobs-only migration pass) — a Postgres
  // job id is a UUID, which could never match a legacy Mongo ObjectId
  // query anyway, so this is an honest empty state rather than a lookup
  // that would only ever throw or silently miss.
  return {
    isProject: true,
    startDate: project.startDate,
    endDate: project.endDate,
    totalDays: project.totalDays,
    elapsedDays,
    remainingDays,
    percentElapsed,
    hiredCount: 0,
    workers: [],
  };
}

/**
 * Re-post a previous job as a fresh, active posting — copies the
 * substantive fields and runs the normal createJob path (so notifications/
 * alerts fire). A fresh post starts public (crew-first head-start doesn't
 * carry over).
 */
export async function repostJob(employerId: string, jobId: string): Promise<PublicJob> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();

  const body: CreateJobBody = {
    title: job.title,
    description: job.description,
    type: job.type,
    pay: {
      amount: job.payAmount,
      amountMax: job.payAmountMax ?? null,
      period: job.payPeriod,
      currency: job.payCurrency ?? 'INR',
    },
    location: {
      address: job.address,
      city: job.city,
      area: job.area ?? null,
      pincode: job.pincode ?? null,
      lat: job.geo.y,
      lng: job.geo.x,
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
 */
async function fanOutToCrew(employerId: string, job: PublicJob): Promise<void> {
  const [members, employerRows] = await Promise.all([
    getDb().select({ workerId: crewMembers.workerId }).from(crewMembers).where(eq(crewMembers.employerId, employerId)),
    getDb()
      .select({ companyName: users.companyName, name: users.name })
      .from(users)
      .where(eq(users.id, employerId))
      .limit(1),
  ]);
  if (members.length === 0) return;
  const employer = employerRows[0];
  const employerName = employer?.companyName ?? employer?.name ?? undefined;
  for (const m of members) {
    void sendCrewShiftPush({
      recipientId: m.workerId,
      jobId: job.id,
      jobTitle: job.title,
      employerName,
    });
  }
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Notify seekers near a freshly-posted job. Filters:
 *   - role: 'seeker', active, has at least one Expo push token
 *   - within NEW_JOB_NOTIFY_RADIUS_M of the job location (Haversine over
 *     the seeker's stored lat/lng — `users.location` is still jsonb, not
 *     a PostGIS column; see src/db/schema/users.ts, deferred to a later
 *     pass since Users isn't in scope for this Jobs-only migration)
 *   - capped at NEW_JOB_NOTIFY_MAX_RECIPIENTS
 *
 * Now reads the real (Postgres) `users` table instead of the stale Mongo
 * one — this fan-out silently reached zero real users before this
 * change, since Phase 1 moved user registration to Postgres.
 */
async function notifySeekersOfNewJob(job: PublicJob): Promise<void> {
  if (job.status !== 'active') return;

  const [lng, lat] = job.location.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return;

  const db = getDb();
  const candidates = await db.query.users.findMany({
    where: and(
      eq(users.role, 'seeker'),
      eq(users.isActive, true),
      sql`array_length(${users.expoPushTokens}, 1) > 0`,
    ),
    columns: { id: true, location: true, preferredJobTypes: true },
    limit: NEW_JOB_NOTIFY_CANDIDATE_POOL,
  });

  const recipients = candidates
    .filter((s) => {
      const coords = s.location?.coordinates;
      if (!coords) return false;
      const distance = haversineMeters(lat, lng, coords[1], coords[0]);
      if (distance > NEW_JOB_NOTIFY_RADIUS_M) return false;
      const prefs = s.preferredJobTypes;
      if (!Array.isArray(prefs) || prefs.length === 0) return true;
      return prefs.includes(job.type);
    })
    .slice(0, NEW_JOB_NOTIFY_MAX_RECIPIENTS)
    .map((s) => s.id);

  if (recipients.length === 0) return;

  for (const id of recipients) {
    emitToUser(id, 'job:new', { jobId: job.id, title: job.title, city: job.location.city });
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
  const db = getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();

  const patch: Partial<typeof jobs.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.type !== undefined) patch.type = input.type;
  if (input.pay !== undefined) {
    patch.payAmount = input.pay.amount;
    patch.payAmountMax = input.pay.amountMax ?? null;
    patch.payPeriod = input.pay.period;
    patch.payCurrency = input.pay.currency ?? 'INR';
  }
  if (input.location !== undefined) {
    patch.address = input.location.address;
    patch.city = input.location.city;
    patch.area = input.location.area ?? null;
    patch.pincode = input.location.pincode ?? null;
    patch.geo = { x: input.location.lng, y: input.location.lat };
  }
  if (input.skills !== undefined) patch.skills = input.skills;
  if (input.workMode !== undefined) patch.workMode = input.workMode;
  if (input.schedule !== undefined) patch.schedule = input.schedule ?? null;
  if (input.urgent !== undefined) patch.urgent = input.urgent;
  if (input.audioDescriptionUrl !== undefined) patch.audioDescriptionUrl = input.audioDescriptionUrl;
  if (input.audioDescriptionDurationSeconds !== undefined) {
    patch.audioDescriptionDurationSeconds = input.audioDescriptionDurationSeconds;
  }
  if (input.womenSafety !== undefined) {
    patch.womenSafety = input.womenSafety;
    patch.safeForWomen = computeWomenSafety(input.womenSafety).score > 0;
  }

  const [updated] = await db.update(jobs).set(patch).where(eq(jobs.id, jobId)).returning();
  if (!updated) throw new Error('job update returned no row');
  return toPublicJob(updated, { audioDescriptionUrl: updated.audioDescriptionUrl ?? null });
}

/**
 * Transition the job's lifecycle. We allow:
 *   active  ↔ paused
 *   active  → filled
 *   active  → expired
 *   paused  → expired
 *   any → active   (employer wants to "reopen")
 */
export async function transitionJobStatus(
  employerId: string,
  jobId: string,
  next: JobStatus,
): Promise<PublicJob> {
  const db = getDb();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();

  const cur = job.status;
  const ok =
    next === 'active' ||
    (cur === 'active' && (next === 'paused' || next === 'filled' || next === 'expired')) ||
    (cur === 'paused' && next === 'expired');
  if (!ok) {
    throw errors.conflict(`Cannot transition job from ${cur} to ${next}.`);
  }

  const [updated] = await db
    .update(jobs)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning();
  if (!updated) throw new Error('job update returned no row');
  return toPublicJob(updated, { audioDescriptionUrl: updated.audioDescriptionUrl ?? null });
}

export async function listMine(
  employerId: string,
  filter: { status?: JobStatus; limit: number },
): Promise<PublicJob[]> {
  const db = getDb();
  const rows = await db.query.jobs.findMany({
    where: filter.status
      ? and(eq(jobs.employerId, employerId), eq(jobs.status, filter.status))
      : eq(jobs.employerId, employerId),
    orderBy: (j, { desc }) => [desc(j.createdAt)],
    limit: filter.limit,
  });
  return rows.map((j) => toPublicJob(j, { audioDescriptionUrl: j.audioDescriptionUrl ?? null }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
