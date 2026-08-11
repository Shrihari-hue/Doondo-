/**
 * HiringRequest service — the employer→worker outbound invite flow.
 *
 * `send` lets an employer invite a worker (picked off the worker map /
 * Find-workers list) to apply for one of their active jobs. The worker
 * answers with `respond`. On accept we upsert an Application so the
 * worker lands straight in that job's pipeline at `shortlisted` — the
 * invite becomes a real pipeline entry, the mirror of a normal apply.
 *
 * No cron: a pending request past `expiresAt` is treated as expired
 * lazily, both when listing and when the worker tries to respond.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { AppError, errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import {
  applications,
  hiringRequests,
  jobs,
  users,
  HIRING_REQUEST_TTL_DAYS,
  type HiringRequestStatus,
} from '@/db/schema';
import * as notifications from '@/modules/notifications/notification.service';

export interface HiringRequestParty {
  id: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
}

export interface HiringRequestJob {
  id: string;
  title: string;
  status: string;
}

export interface PublicHiringRequest {
  id: string;
  status: HiringRequestStatus;
  message: string | null;
  jobId: string;
  employerId: string;
  seekerId: string;
  applicationId: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  employer?: HiringRequestParty;
  seeker?: HiringRequestParty & {
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
  job?: HiringRequestJob;
}

type HiringRequestRow = typeof hiringRequests.$inferSelect;

function toPublicJSON(row: HiringRequestRow): PublicHiringRequest {
  const now = Date.now();
  const status = row.status === 'pending' && row.expiresAt.getTime() <= now ? 'expired' : row.status;
  return {
    id: row.id,
    status,
    message: row.message ?? null,
    jobId: row.jobId,
    employerId: row.employerId,
    seekerId: row.seekerId,
    applicationId: row.applicationId,
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Hydration ───────────────────────────────────────────────────────────────

/**
 * Turn raw rows into the public, hydrated shape: attaches the job
 * summary, both party summaries, and the worker's rating in a fixed
 * number of bulk queries regardless of how many requests there are.
 * Lazy expiry (pending row past its window reads as `expired`) is
 * applied in toPublicJSON without ever being written back.
 */
async function hydrate(rows: HiringRequestRow[]): Promise<PublicHiringRequest[]> {
  if (rows.length === 0) return [];

  const jobIds = [...new Set(rows.map((r) => r.jobId))];
  const userIds = [...new Set(rows.flatMap((r) => [r.employerId, r.seekerId]))];

  const db = getDb();
  const [jobRows, userRows] = await Promise.all([
    db.select({ id: jobs.id, title: jobs.title, status: jobs.status }).from(jobs).where(inArray(jobs.id, jobIds)),
    db
      .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, isVerified: users.isVerified, skills: users.skills })
      .from(users)
      .where(inArray(users.id, userIds)),
  ]);

  // Reuse the shared ratings aggregation so the worker's "★ 4.6 · 32"
  // badge is identical to everywhere else it appears.
  const seekerIds = [...new Set(rows.map((r) => r.seekerId))];
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds);

  const jobMap = new Map(jobRows.map((j) => [j.id, j]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((row) => {
    const base = toPublicJSON(row);

    const job = jobMap.get(base.jobId);
    if (job) base.job = { id: base.jobId, title: job.title, status: job.status };

    const employer = userMap.get(base.employerId);
    if (employer) {
      base.employer = {
        id: base.employerId,
        name: employer.name ?? 'Employer',
        photoUrl: employer.photoUrl ?? null,
        isVerified: Boolean(employer.isVerified),
      };
    }

    const seeker = userMap.get(base.seekerId);
    if (seeker) {
      const rating = ratingMap.get(base.seekerId);
      base.seeker = {
        id: base.seekerId,
        name: seeker.name ?? 'Worker',
        photoUrl: seeker.photoUrl ?? null,
        isVerified: Boolean(seeker.isVerified),
        skills: seeker.skills ?? [],
        rating: rating && rating.count > 0 ? { avg: rating.avg, count: rating.count } : null,
      };
    }

    return base;
  });
}

// ─── Send (employer) ─────────────────────────────────────────────────────────

interface SendInput {
  employerId: string;
  seekerId: string;
  jobId: string;
  message?: string | null;
}

export async function send(input: SendInput): Promise<PublicHiringRequest> {
  if (input.employerId === input.seekerId) {
    throw errors.forbidden('You cannot send a hiring request to yourself.');
  }

  const db = getDb();
  const [job] = await db
    .select({ employerId: jobs.employerId, status: jobs.status, title: jobs.title })
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== input.employerId) {
    throw errors.forbidden('That job belongs to another employer.');
  }
  if (job.status !== 'active') throw errors.jobNotOpen();

  const [seeker] = await db
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, input.seekerId))
    .limit(1);
  if (!seeker || seeker.role !== 'seeker' || !seeker.isActive) {
    throw errors.notFound('Worker not found.');
  }

  const now = new Date();

  // One live request per (employer, seeker, job). A past decline /
  // withdrawal doesn't block a fresh invite — only an open pending one.
  const [existing] = await db
    .select({ id: hiringRequests.id })
    .from(hiringRequests)
    .where(
      and(
        eq(hiringRequests.employerId, input.employerId),
        eq(hiringRequests.seekerId, input.seekerId),
        eq(hiringRequests.jobId, input.jobId),
        eq(hiringRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (existing) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'You already have a pending hiring request to this worker for this job.',
      status: 409,
    });
  }

  const [doc] = await db
    .insert(hiringRequests)
    .values({
      employerId: input.employerId,
      seekerId: input.seekerId,
      jobId: input.jobId,
      message: input.message?.trim() || null,
      status: 'pending',
      expiresAt: new Date(now.getTime() + HIRING_REQUEST_TTL_DAYS * 24 * 60 * 60_000),
    })
    .returning();

  // Notify the worker — best-effort, never blocks the request.
  const [employer] = await db.select({ name: users.name, photoUrl: users.photoUrl }).from(users).where(eq(users.id, input.employerId)).limit(1);
  const employerName = employer?.name ?? 'An employer';
  await notifications.record({
    recipientId: input.seekerId,
    kind: 'hiring_request',
    title: 'You have a hiring request',
    body: `${employerName} wants to hire you for "${job.title}".`,
    deeplink: { screen: 'HiringRequests' },
    imageUrl: employer?.photoUrl ?? null,
  });

  const [pub] = await hydrate([doc!]);
  return pub ?? toPublicJSON(doc!);
}

// ─── Lists ───────────────────────────────────────────────────────────────────

/** Worker inbox — hiring requests sent TO this seeker. */
export async function listForSeeker(
  seekerId: string,
  statusFilter?: HiringRequestStatus,
): Promise<PublicHiringRequest[]> {
  const conditions = [eq(hiringRequests.seekerId, seekerId)];
  if (statusFilter) conditions.push(eq(hiringRequests.status, statusFilter));
  const rows = await getDb()
    .select()
    .from(hiringRequests)
    .where(and(...conditions))
    .orderBy(desc(hiringRequests.createdAt))
    .limit(100);
  return hydrate(rows);
}

/** Employer sent-list — hiring requests this employer has sent out. */
export async function listForEmployer(
  employerId: string,
): Promise<PublicHiringRequest[]> {
  const rows = await getDb()
    .select()
    .from(hiringRequests)
    .where(eq(hiringRequests.employerId, employerId))
    .orderBy(desc(hiringRequests.createdAt))
    .limit(100);
  return hydrate(rows);
}

// ─── Respond (worker) ────────────────────────────────────────────────────────

interface RespondInput {
  requestId: string;
  seekerId: string;
  action: 'accept' | 'decline';
}

export async function respond(
  input: RespondInput,
): Promise<PublicHiringRequest> {
  const db = getDb();
  const [doc] = await db.select().from(hiringRequests).where(eq(hiringRequests.id, input.requestId)).limit(1);
  if (!doc) throw errors.notFound('Hiring request not found.');
  if (doc.seekerId !== input.seekerId) {
    throw errors.forbidden('This hiring request is not yours.');
  }

  const now = new Date();
  const isExpired = doc.status === 'pending' && doc.expiresAt.getTime() <= now.getTime();
  if (doc.status !== 'pending' || isExpired) {
    throw new AppError({
      code: 'CONFLICT',
      message: isExpired
        ? 'This hiring request has expired.'
        : 'This hiring request has already been answered.',
      status: 409,
    });
  }

  let applicationId: string | null = null;

  if (input.action === 'accept') {
    // Drop the worker into the job's pipeline. Upsert by (seekerId,
    // jobId) — the applications table's compound unique index makes
    // this safe; an existing application is linked rather than
    // duplicated.
    const [app] = await db
      .insert(applications)
      .values({
        seekerId: doc.seekerId,
        jobId: doc.jobId,
        employerId: doc.employerId,
        status: 'shortlisted',
        appliedAt: now,
        shortlistedAt: now,
      })
      .onConflictDoNothing({ target: [applications.seekerId, applications.jobId] })
      .returning({ id: applications.id });
    const resolved =
      app ??
      (
        await db
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.seekerId, doc.seekerId), eq(applications.jobId, doc.jobId)))
          .limit(1)
      )[0];
    if (!resolved) throw errors.internal();
    applicationId = resolved.id;
  }

  const [updated] = await db
    .update(hiringRequests)
    .set({
      status: input.action === 'accept' ? 'accepted' : 'declined',
      applicationId,
      respondedAt: now,
    })
    .where(eq(hiringRequests.id, doc.id))
    .returning();
  if (!updated) throw errors.internal();

  // Tell the employer how the worker answered.
  const [seeker] = await db.select({ name: users.name, photoUrl: users.photoUrl }).from(users).where(eq(users.id, doc.seekerId)).limit(1);
  const seekerName = seeker?.name ?? 'A worker';
  const [job] = await db.select({ title: jobs.title }).from(jobs).where(eq(jobs.id, doc.jobId)).limit(1);
  const jobTitle = job?.title ?? 'your job';

  await notifications.record({
    recipientId: doc.employerId,
    kind: 'hiring_request_responded',
    title: input.action === 'accept' ? 'Hiring request accepted' : 'Hiring request declined',
    body:
      input.action === 'accept'
        ? `${seekerName} accepted your request for "${jobTitle}" — they're now in your applicants.`
        : `${seekerName} declined your hiring request for "${jobTitle}".`,
    deeplink:
      input.action === 'accept' && applicationId
        ? { screen: 'ApplicantDetail', params: { applicationId } }
        : { screen: 'SentHiringRequests' },
    imageUrl: seeker?.photoUrl ?? null,
  });

  const [pub] = await hydrate([updated]);
  return pub ?? toPublicJSON(updated);
}

// ─── Withdraw (employer) ─────────────────────────────────────────────────────

export async function withdraw(input: {
  requestId: string;
  employerId: string;
}): Promise<PublicHiringRequest> {
  const db = getDb();
  const [doc] = await db.select().from(hiringRequests).where(eq(hiringRequests.id, input.requestId)).limit(1);
  if (!doc) throw errors.notFound('Hiring request not found.');
  if (doc.employerId !== input.employerId) {
    throw errors.forbidden('This hiring request is not yours.');
  }
  if (doc.status !== 'pending') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only a pending hiring request can be withdrawn.',
      status: 409,
    });
  }

  const [updated] = await db
    .update(hiringRequests)
    .set({ status: 'withdrawn', respondedAt: new Date() })
    .where(eq(hiringRequests.id, doc.id))
    .returning();
  if (!updated) throw errors.internal();
  const [pub] = await hydrate([updated]);
  return pub ?? toPublicJSON(updated);
}
