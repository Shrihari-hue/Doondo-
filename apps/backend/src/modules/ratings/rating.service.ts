/**
 * Ratings service — business logic for creating and reading ratings.
 *
 * Rules enforced here, not in the controller:
 *   - Cannot rate a non-`hired` application.
 *   - Cannot rate yourself.
 *   - Cannot rate the wrong party (e.g. a seeker can't rate another seeker
 *     just because they know the applicationId).
 *   - Cannot create two ratings for the same (reviewer, application).
 *
 * Reads:
 *   - listForUser(revieweeId) — paginates by createdAt desc.
 *   - summarizeForUser(userId) — returns {avg, count}. Cheap aggregation.
 *   - listMyUnrated(reviewerId) — applications the user could rate but
 *     hasn't yet; surfaced as a prompt on the Applications detail screen.
 *
 * Fully Postgres/Drizzle — the `ratings` table (src/db/schema/marketplace.ts)
 * and every entity it references (Application, User, Job) all live in
 * Postgres. There is no MongoDB dependency left anywhere in this module.
 */

import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs, quickWorkRequests, ratings, services, users, type RatingRole } from '@/db/schema';
import { AppError, errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendRatingReceivedPush } from '@/lib/push';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import {
  allowedTagsFor,
  validateTagsForRole,
  type TagDescriptor,
} from './tagCatalog';

type RatingRow = typeof ratings.$inferSelect;

export interface PublicRating {
  id: string;
  /** Null when the review was posted anonymously. The DB row still has the id. */
  reviewerId: string | null;
  /** "Anonymous worker" / "Anonymous employer" when the review is anonymous. */
  reviewerName: string;
  /** Null when anonymous. */
  reviewerPhotoUrl: string | null;
  revieweeId: string;
  /** Null for a Quick Work rating — see quickWorkRequestId instead. */
  applicationId: string | null;
  /** Null for a Quick Work rating. */
  jobId: string | null;
  /** Null for a Jobs rating — see applicationId/jobId instead. employer-plan.md §18. */
  quickWorkRequestId: string | null;
  /** The job title, or the Quick Work service name — whichever context this rating belongs to. */
  jobTitle: string;
  role: RatingRole;
  score: number;
  comment: string | null;
  tags: string[];
  /** Whether this review was posted anonymously. UI uses it to show a small chip. */
  anonymous: boolean;
  createdAt: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

/**
 * True for a Postgres unique-violation (23505). drizzle-orm >=0.44 wraps
 * the driver's PostgresError in a DrizzleQueryError, moving the real
 * `.code` to `.cause.code` — checking only the outer error's `.code` (the
 * pre-wrap shape) silently missed every unique violation, which meant a
 * duplicate rating attempt fell through to the generic 500 handler
 * instead of the intended 409 "already rated" response. Found live while
 * testing Quick Work ratings; the same bug (and the same fix) already
 * exists in chat.service.ts's `isUnique()`.
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const causeCode = (err as { cause?: { code?: string } } | null)?.cause?.code;
  return code === '23505' || causeCode === '23505';
}

/**
 * Plain-function replacement for the Mongoose `Rating.toPublicJSON()`
 * instance method. Anonymous reviews never leak the reviewer's id, name,
 * or photo; the "anonymous" label depends on the rating direction so the
 * UI can still differentiate "Anonymous worker" from "Anonymous employer".
 */
function toPublicRating(
  row: RatingRow,
  populated: { reviewerName: string; reviewerPhotoUrl: string | null; jobTitle: string },
): PublicRating {
  const isAnon = row.anonymous;
  // role === 'employer' means a SEEKER wrote this review (about an employer).
  const anonLabel = row.role === 'employer' ? 'Anonymous worker' : 'Anonymous employer';

  return {
    id: row.id,
    reviewerId: isAnon ? null : row.reviewerId,
    reviewerName: isAnon ? anonLabel : populated.reviewerName,
    reviewerPhotoUrl: isAnon ? null : populated.reviewerPhotoUrl,
    revieweeId: row.revieweeId,
    applicationId: row.applicationId,
    jobId: row.jobId,
    quickWorkRequestId: row.quickWorkRequestId,
    jobTitle: populated.jobTitle,
    role: row.role,
    score: row.score,
    comment: row.comment ?? null,
    tags: row.tags,
    anonymous: isAnon,
    createdAt: row.createdAt.toISOString(),
  };
}

interface CreateInput {
  reviewerId: string;
  applicationId: string;
  score: number;
  comment?: string;
  /** Tag slugs from the role's catalog (max 6). Optional. */
  tags?: string[];
  /** Hide reviewer identity in public listings. Defaults to false. */
  anonymous?: boolean;
}

/**
 * Create a rating. Direction (who's rating whom) is inferred from the
 * reviewer's role on the application: if the reviewer is the application's
 * employer, they're rating the seeker; vice versa.
 */
export async function createRating(input: CreateInput): Promise<PublicRating> {
  const reviewerId = input.reviewerId;
  const applicationId = input.applicationId;

  // 1. Load the application + verify status + figure out direction.
  const [app] = await getDb()
    .select({
      status: applications.status,
      seekerId: applications.seekerId,
      employerId: applications.employerId,
      jobId: applications.jobId,
    })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: 'Application not found',
      status: 404,
    });
  }
  if (app.status !== 'hired') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'You can only rate someone after the application is hired',
      status: 409,
    });
  }

  const seekerId = app.seekerId;
  const employerId = app.employerId;
  const reviewerIdStr = input.reviewerId;

  let revieweeIdStr: string;
  let role: RatingRole;

  if (reviewerIdStr === seekerId) {
    revieweeIdStr = employerId;
    role = 'employer'; // reviewee is the employer
  } else if (reviewerIdStr === employerId) {
    revieweeIdStr = seekerId;
    role = 'seeker';
  } else {
    throw new AppError({
      code: 'AUTH_FORBIDDEN',
      message: 'Only the seeker or employer on this application can rate',
      status: 403,
    });
  }

  if (reviewerIdStr === revieweeIdStr) {
    // Defensive — shouldn't happen given the branches above.
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: "You can't rate yourself",
      status: 400,
    });
  }

  // 2a. Validate tags against the role's catalogue. Reject the whole
  //     write on an unknown tag — a UI bug shouldn't silently drop tags.
  const requestedTags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))]
    : [];
  if (requestedTags.length > 0) {
    const check = validateTagsForRole(role, requestedTags);
    if (!check.ok) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: `Unknown review tag(s): ${check.invalid.join(', ')}`,
        status: 400,
        details: { invalidTags: check.invalid },
      });
    }
  }

  // 2. Create. Unique index on (reviewerId, applicationId) means we either
  //    succeed or hit a duplicate-key — surface that cleanly.
  try {
    const [created] = await getDb()
      .insert(ratings)
      .values({
        reviewerId,
        revieweeId: revieweeIdStr,
        applicationId,
        jobId: app.jobId,
        role,
        score: input.score,
        comment: input.comment?.trim() || null,
        tags: requestedTags,
        anonymous: Boolean(input.anonymous),
      })
      .returning();
    const rating = created!;

    // 3. Hydrate the public view.
    const [reviewerRows, jobRows] = await Promise.all([
      getDb()
        .select({ name: users.name, photoUrl: users.photoUrl })
        .from(users)
        .where(eq(users.id, reviewerId))
        .limit(1),
      getDb().select({ title: jobs.title }).from(jobs).where(eq(jobs.id, app.jobId)).limit(1),
    ]);
    const reviewer = reviewerRows[0];
    const job = jobRows[0];

    // Notify the person being rated. Best-effort, won't block the response.
    void sendRatingReceivedPush({
      recipientId: revieweeIdStr,
      reviewerName: reviewer?.name ?? 'Someone',
      score: input.score,
      jobTitle: job?.title,
    });

    return toPublicRating(rating, {
      reviewerName: reviewer?.name ?? 'Doondo user',
      reviewerPhotoUrl: reviewer?.photoUrl ?? null,
      jobTitle: job?.title ?? 'this job',
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new AppError({
        code: 'CONFLICT',
        message: "You've already rated this job",
        status: 409,
      });
    }
    logger.error({ err }, 'rating create failed');
    throw err;
  }
}

interface CreateQuickWorkRatingInput {
  reviewerId: string;
  quickWorkRequestId: string;
  score: number;
  comment?: string;
  tags?: string[];
  anonymous?: boolean;
}

/**
 * Create a Quick Work rating — employer-plan.md §18 (Option A, resolved).
 * Mirrors `createRating()`'s validation shape exactly, scoped to a
 * `quick_work_requests` row instead of an `application`. Direction is
 * inferred from whether the reviewer is the request's employer or its
 * matched worker. Either party's first rating moves the request
 * PAID -> RATED; the other party can still rate afterward (same rule
 * Jobs ratings already follow — both sides rate independently).
 */
export async function createQuickWorkRating(input: CreateQuickWorkRatingInput): Promise<PublicRating> {
  const [qw] = await getDb()
    .select()
    .from(quickWorkRequests)
    .where(eq(quickWorkRequests.id, input.quickWorkRequestId))
    .limit(1);
  if (!qw) throw errors.quickWorkNotFound();
  if (qw.status !== 'paid' && qw.status !== 'rated') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'You can only rate after payment is complete.',
      status: 409,
    });
  }
  if (!qw.matchedWorkerId) throw errors.quickWorkInvalidTransition(qw.status, 'rated');

  let revieweeId: string;
  let role: RatingRole;
  if (input.reviewerId === qw.employerId) {
    revieweeId = qw.matchedWorkerId;
    role = 'seeker'; // reviewee is the worker
  } else if (input.reviewerId === qw.matchedWorkerId) {
    revieweeId = qw.employerId;
    role = 'employer'; // reviewee is the customer
  } else {
    throw errors.forbidden('Only the customer or the worker on this request can rate.');
  }

  const requestedTags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))]
    : [];
  if (requestedTags.length > 0) {
    const check = validateTagsForRole(role, requestedTags);
    if (!check.ok) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: `Unknown review tag(s): ${check.invalid.join(', ')}`,
        status: 400,
        details: { invalidTags: check.invalid },
      });
    }
  }

  try {
    const [created] = await getDb()
      .insert(ratings)
      .values({
        reviewerId: input.reviewerId,
        revieweeId,
        applicationId: null,
        jobId: null,
        quickWorkRequestId: qw.id,
        role,
        score: input.score,
        comment: input.comment?.trim() || null,
        tags: requestedTags,
        anonymous: Boolean(input.anonymous),
      })
      .returning();
    const rating = created!;

    // PAID -> RATED on the first rating; a no-op compare-and-swap if the
    // other party already rated first (row is already 'rated').
    await getDb()
      .update(quickWorkRequests)
      .set({ status: 'rated', ratedAt: new Date() })
      .where(and(eq(quickWorkRequests.id, qw.id), eq(quickWorkRequests.status, 'paid')));

    const [reviewerRows, svcRows] = await Promise.all([
      getDb().select({ name: users.name, photoUrl: users.photoUrl }).from(users).where(eq(users.id, input.reviewerId)).limit(1),
      qw.serviceId
        ? getDb().select({ name: services.name }).from(services).where(eq(services.id, qw.serviceId)).limit(1)
        : Promise.resolve([]),
    ]);
    const reviewer = reviewerRows[0];
    const serviceName = svcRows[0]?.name ?? qw.title ?? 'Quick Work';

    void sendRatingReceivedPush({
      recipientId: revieweeId,
      reviewerName: reviewer?.name ?? 'Someone',
      score: input.score,
      jobTitle: serviceName,
    });
    emitToUser(revieweeId, 'quick_work:rated', { requestId: qw.id });
    await notifications.record({
      recipientId: revieweeId,
      kind: 'rating_received',
      title: 'You received a rating',
      body: `${reviewer?.name ?? 'Someone'} rated your Quick Work — ${input.score}★`,
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: qw.id } },
    });

    return toPublicRating(rating, {
      reviewerName: reviewer?.name ?? 'Doondo user',
      reviewerPhotoUrl: reviewer?.photoUrl ?? null,
      jobTitle: serviceName,
    });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new AppError({
        code: 'CONFLICT',
        message: "You've already rated this request",
        status: 409,
      });
    }
    logger.error({ err }, 'quick work rating create failed');
    throw err;
  }
}

/**
 * Compute summary for a user. Returns 0/0 if no ratings yet — caller
 * should render "No ratings yet" rather than "0.0 ⭐".
 */
export async function summarizeForUser(userId: string): Promise<RatingSummary> {
  const [row] = await getDb()
    .select({
      avg: sql<number | null>`avg(${ratings.score})`,
      count: sql<number>`count(*)::int`,
    })
    .from(ratings)
    .where(eq(ratings.revieweeId, userId));

  if (!row || row.avg === null || row.count === 0) return { avg: 0, count: 0 };
  return {
    // round to one decimal so "4.555…" becomes 4.6 for display.
    avg: Math.round(row.avg * 10) / 10,
    count: row.count,
  };
}

// ─── Tag aggregation (employer trust signals) ───────────────────────────────

export interface TagSummaryEntry {
  slug: string;
  label: string;
  polarity: TagDescriptor['polarity'];
  /** How many of the user's reviews carry this tag. */
  count: number;
  /** Fraction of their reviews carrying the tag (0..1). */
  ratio: number;
}

export interface TagSummary {
  /** Total reviews counted against this user. Drives the denominator. */
  totalReviews: number;
  /** Which side they're being reviewed AS (drives the tag catalog used). */
  role: RatingRole;
  /**
   * One entry per tag in the catalogue. Includes zero-count tags so the
   * UI can render the full grid grayed out for new accounts.
   */
  tags: TagSummaryEntry[];
}

/**
 * Aggregate the structured-tag signal for a user.
 *
 * Used by EmployerDetail to render "Workers say…" badges: "Paid on
 * time · 92% (24 reviews)". Computed on read; the rating volume per
 * user is small enough that an indexed scan is cheap.
 */
export async function summarizeTagsForUser(
  userId: string,
  role: RatingRole,
): Promise<TagSummary> {
  const [totalRow, perTagRows] = await Promise.all([
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(ratings)
      .where(and(eq(ratings.revieweeId, userId), eq(ratings.role, role))),
    getDb().execute<{ tag: string; count: number }>(sql`
      SELECT tag, count(*)::int AS count
      FROM ${ratings}, unnest(${ratings.tags}) AS tag
      WHERE ${ratings.revieweeId} = ${userId} AND ${ratings.role} = ${role}
      GROUP BY tag
    `),
  ]);

  const total = totalRow[0]?.count ?? 0;
  const countBySlug = new Map(perTagRows.map((r) => [r.tag, r.count]));

  const catalog = allowedTagsFor(role);
  const tags: TagSummaryEntry[] = catalog.map((t) => {
    const count = countBySlug.get(t.slug) ?? 0;
    return {
      slug: t.slug,
      label: t.label,
      polarity: t.polarity,
      count,
      ratio: total > 0 ? count / total : 0,
    };
  });

  return { totalReviews: total, role, tags };
}

/** Bulk summarize for many users at once — used when listing search results. */
export async function summarizeForUsers(
  userIds: string[],
): Promise<Map<string, RatingSummary>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      revieweeId: ratings.revieweeId,
      avg: sql<number>`avg(${ratings.score})`,
      count: sql<number>`count(*)::int`,
    })
    .from(ratings)
    .where(inArray(ratings.revieweeId, userIds))
    .groupBy(ratings.revieweeId);

  const map = new Map<string, RatingSummary>();
  for (const r of rows) {
    map.set(r.revieweeId, {
      avg: Math.round(r.avg * 10) / 10,
      count: r.count,
    });
  }
  return map;
}

interface ListForUserInput {
  revieweeId: string;
  limit?: number;
}

/** List ratings RECEIVED by a user, newest first. */
export async function listForUser(input: ListForUserInput): Promise<PublicRating[]> {
  const limit = input.limit ?? 20;
  const ratingRows = await getDb()
    .select()
    .from(ratings)
    .where(eq(ratings.revieweeId, input.revieweeId))
    .orderBy(desc(ratings.createdAt))
    .limit(limit);

  if (ratingRows.length === 0) return [];

  // Bulk-load reviewer + job/Quick Work context names.
  const reviewerIds = [...new Set(ratingRows.map((r) => r.reviewerId))];
  const jobIds = [...new Set(ratingRows.map((r) => r.jobId).filter((id): id is string => id != null))];
  const quickWorkIds = [
    ...new Set(ratingRows.map((r) => r.quickWorkRequestId).filter((id): id is string => id != null)),
  ];

  const [reviewers, jobRows, quickWorkRows] = await Promise.all([
    getDb()
      .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
      .from(users)
      .where(inArray(users.id, reviewerIds)),
    jobIds.length > 0
      ? getDb().select({ id: jobs.id, title: jobs.title }).from(jobs).where(inArray(jobs.id, jobIds))
      : Promise.resolve([]),
    quickWorkIds.length > 0
      ? getDb()
          .select({ id: quickWorkRequests.id, title: quickWorkRequests.title, serviceName: services.name })
          .from(quickWorkRequests)
          .leftJoin(services, eq(services.id, quickWorkRequests.serviceId))
          .where(inArray(quickWorkRequests.id, quickWorkIds))
      : Promise.resolve([]),
  ]);

  const reviewerMap = new Map(
    reviewers.map((u) => [u.id, { name: u.name, photoUrl: u.photoUrl ?? null }]),
  );
  const jobMap = new Map(jobRows.map((j) => [j.id, j.title]));
  const quickWorkMap = new Map(quickWorkRows.map((q) => [q.id, q.title || q.serviceName || 'Quick Work']));

  return ratingRows.map((r) => {
    const reviewerInfo = reviewerMap.get(r.reviewerId);
    const jobTitle = r.jobId
      ? (jobMap.get(r.jobId) ?? 'a job')
      : r.quickWorkRequestId
        ? (quickWorkMap.get(r.quickWorkRequestId) ?? 'Quick Work')
        : 'a job';
    return toPublicRating(r, {
      reviewerName: reviewerInfo?.name ?? 'Doondo user',
      reviewerPhotoUrl: reviewerInfo?.photoUrl ?? null,
      jobTitle,
    });
  });
}

interface UnratedApp {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  otherPartyName: string;
  otherPartyPhotoUrl: string | null;
  hiredAt: string;
}

/**
 * Applications the user could rate but hasn't yet. Surfaced as a prompt
 * banner on the Applications screen / Profile screen — "Rate your last
 * employer / worker".
 */
export async function listMyUnrated(reviewerId: string, limit = 10): Promise<UnratedApp[]> {
  // 1. All hired applications where this user is either the seeker or employer.
  const hiredApps = await getDb()
    .select({
      id: applications.id,
      seekerId: applications.seekerId,
      employerId: applications.employerId,
      jobId: applications.jobId,
      hiredAt: applications.hiredAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .where(
      and(
        eq(applications.status, 'hired'),
        or(eq(applications.seekerId, reviewerId), eq(applications.employerId, reviewerId)),
      ),
    )
    .orderBy(desc(applications.hiredAt), desc(applications.updatedAt))
    .limit(50); // load a bit more than `limit` to allow filtering below

  if (hiredApps.length === 0) return [];

  // 2. Which ones have we already rated?
  const applicationIds = hiredApps.map((a) => a.id);
  const myRatings = await getDb()
    .select({ applicationId: ratings.applicationId })
    .from(ratings)
    .where(and(eq(ratings.reviewerId, reviewerId), inArray(ratings.applicationId, applicationIds)));
  const ratedSet = new Set(myRatings.map((r) => r.applicationId));

  const unrated = hiredApps.filter((a) => !ratedSet.has(a.id)).slice(0, limit);

  if (unrated.length === 0) return [];

  // 3. Hydrate the "other party" and job title.
  const otherIds = unrated.map((a) => (reviewerId === a.seekerId ? a.employerId : a.seekerId));
  const jobIds = unrated.map((a) => a.jobId);

  const [otherUsers, jobRows] = await Promise.all([
    getDb()
      .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
      .from(users)
      .where(inArray(users.id, otherIds)),
    getDb().select({ id: jobs.id, title: jobs.title }).from(jobs).where(inArray(jobs.id, jobIds)),
  ]);

  const otherMap = new Map(
    otherUsers.map((u) => [u.id, { name: u.name, photoUrl: u.photoUrl ?? null }]),
  );
  const jobMap = new Map(jobRows.map((j) => [j.id, j.title]));

  return unrated.map((a) => {
    const otherId = reviewerId === a.seekerId ? a.employerId : a.seekerId;
    const other = otherMap.get(otherId);
    return {
      applicationId: a.id,
      jobId: a.jobId,
      jobTitle: jobMap.get(a.jobId) ?? 'this job',
      otherPartyName: other?.name ?? 'Doondo user',
      otherPartyPhotoUrl: other?.photoUrl ?? null,
      hiredAt: (a.hiredAt ?? a.updatedAt).toISOString(),
    };
  });
}
