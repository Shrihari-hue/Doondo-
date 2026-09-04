/**
 * Quick Work matching engine — employer-plan.md §11.
 *
 * Central constraint from the brief: never broadcast to hundreds of
 * workers. This filters down to real candidates, ranks them, and offers
 * to only the top batch (3-5) — built almost entirely on top of
 * `availabilities.findNearby()` (already a real PostGIS `ST_DWithin`
 * query, see availability.service.ts's own module doc) plus
 * `travelTime.getTravelTimes()` and `ratings.summarizeForUsers()`, all
 * pre-existing.
 *
 * No cron/queue infra runs the retry-on-no-acceptance loop automatically
 * in this pass — see quickWorkOffers.service.ts's module doc for why, and
 * `POST /quick-work/requests/:id/retry-matching` for the manual
 * "widen search" action this exposes instead (mirrors §7 #11's
 * QuickWorkNoWorkerScreen retry/widen actions).
 *
 * Qualification/license checks (§11.1.4) fall back to `users.isVerified`
 * for any service that requires verification, qualification, or a
 * license — there is no per-service document-verification model in the
 * repository yet (`crewDocuments` is Jobs-crew-scoped, not service-scoped)
 * to check against, and inventing one is out of this pass's scope. Flagged
 * explicitly, not silently assumed.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { quickWorkRequests, quickWorkOffers, quickWorkStatusHistory, type QuickWorkRequest } from '@/db/schema';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import * as serviceCatalog from '@/modules/serviceCatalog/serviceCatalog.service';
import * as availability from '@/modules/availabilities/availability.service';
import { listBlockedWorkerIds } from '@/modules/moderation/moderation.service';
import { getTravelTimes } from '@/modules/travelTime/travelTime.service';
import { summarizeForUsers } from '@/modules/ratings/rating.service';

const OFFER_BATCH_SIZE = 5;
const OFFER_WINDOW_MS = 90_000;
const INITIAL_RADIUS_M = 5_000;
const RADIUS_STEP_M = 5_000;
const MAX_RADIUS_M = 20_000;
const CANDIDATE_POOL_LIMIT = 40;

interface MatchCandidate {
  workerId: string;
  distanceMeters: number;
  etaMinutes: number;
  rankScore: number;
}

/** employer-plan.md §11.1 — filter to real, eligible, reachable candidates. */
async function findCandidates(
  request: QuickWorkRequest,
  excludeWorkerIds: string[],
  radiusMeters: number,
): Promise<MatchCandidate[]> {
  if (!request.geo || !request.serviceId) return [];

  const service = await serviceCatalog.getServiceById(request.serviceId);
  if (!service) return [];

  const nearby = await availability.findNearby({
    lat: request.geo.y,
    lng: request.geo.x,
    radius: radiusMeters,
    serviceId: request.serviceId,
    limit: CANDIDATE_POOL_LIMIT,
  });

  let pool = nearby.filter((n) => !excludeWorkerIds.includes(n.seekerId));
  if (service.requiresVerification || service.requiresQualification || service.requiresLicense) {
    pool = pool.filter((n) => n.seeker.isVerified);
  }
  if (pool.length === 0) return [];

  // Safety/moderation — a worker this employer has blocked is never a
  // candidate, symmetric to how a blocked employer's Jobs already don't
  // reach that worker (seeker-plan.md §26).
  const blockedIds = await listBlockedWorkerIds(request.employerId);
  if (blockedIds.size > 0) pool = pool.filter((n) => !blockedIds.has(n.seekerId));
  if (pool.length === 0) return [];

  // 11.1.6 — exclude workers already mid-way through another Quick Work
  // request, or double-booked against one they've merely accepted (Scheduled
  // Work gap #1's conflict-prevention requirement).
  const targetAt = request.scheduledAt ?? request.matchingStartedAt ?? new Date();
  const busyIds = await getBusyWorkerIds(pool.map((n) => n.seekerId), targetAt);
  pool = pool.filter((n) => !busyIds.has(n.seekerId));
  if (pool.length === 0) return [];

  const travel = await getTravelTimes(
    { lat: request.geo.y, lng: request.geo.x },
    pool.map((n) => ({ id: n.seekerId, lat: n.location.coordinates[1], lng: n.location.coordinates[0] })),
  );
  const travelMap = new Map(travel.map((t) => [t.id, t]));
  const experienceMap = await getCompletedCounts(pool.map((n) => n.seekerId));

  const scored = pool.map((n) => {
    const t = travelMap.get(n.seekerId);
    const etaMinutes = t?.minutes ?? 999;
    const distanceMeters = t?.meters ?? n.distanceMeters;
    const normalizedETA = Math.min(etaMinutes / 60, 1);
    const verifiedBonus = n.seeker.isVerified ? 1 : 0;
    const normalizedRating = (n.seeker.rating?.avg ?? 0) / 5;
    const normalizedExperience = Math.min((experienceMap.get(n.seekerId) ?? 0) / 20, 1);
    // employer-plan.md §11.2's suggested formula — tunable weights, not hard-coded product law.
    const rankScore =
      0.4 * (1 - normalizedETA) + 0.25 * verifiedBonus + 0.2 * normalizedRating + 0.15 * normalizedExperience;
    return { workerId: n.seekerId, distanceMeters, etaMinutes, rankScore };
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored;
}

/**
 * Two kinds of "busy":
 *   1. Actively executing right now (arriving/arrived/in_progress) —
 *      always a conflict, regardless of the new request's timing.
 *   2. Accepted but not yet started — only a conflict when that job's own
 *      target time (its scheduledAt, or "now" for an immediate accept)
 *      falls within QUICK_WORK_SCHEDULE_CONFLICT_BUFFER_MINUTES of the
 *      new request's target time. This is what stops a worker being
 *      double-booked into two jobs around the same slot, while NOT
 *      blocking a worker who accepted a job for next week from taking
 *      immediate work today — reuses this same busy-worker query rather
 *      than a separate booking/calendar table (Scheduled Work gap #1's
 *      "use the existing workload architecture" instruction).
 */
async function getBusyWorkerIds(workerIds: string[], targetAt: Date): Promise<Set<string>> {
  if (workerIds.length === 0) return new Set();

  const activeRows = await getDb()
    .select({ matchedWorkerId: quickWorkRequests.matchedWorkerId })
    .from(quickWorkRequests)
    .where(
      and(
        inArray(quickWorkRequests.matchedWorkerId, workerIds),
        inArray(quickWorkRequests.status, ['arriving', 'arrived', 'in_progress']),
      ),
    );

  const acceptedRows = await getDb()
    .select({
      matchedWorkerId: quickWorkRequests.matchedWorkerId,
      scheduledAt: quickWorkRequests.scheduledAt,
      acceptedAt: quickWorkRequests.acceptedAt,
    })
    .from(quickWorkRequests)
    .where(and(inArray(quickWorkRequests.matchedWorkerId, workerIds), eq(quickWorkRequests.status, 'accepted')));

  const bufferMs = env.QUICK_WORK_SCHEDULE_CONFLICT_BUFFER_MINUTES * 60_000;
  const windowStart = targetAt.getTime() - bufferMs;
  const windowEnd = targetAt.getTime() + bufferMs;
  const conflicted = acceptedRows
    .filter((r) => {
      const t = (r.scheduledAt ?? r.acceptedAt)?.getTime();
      return t != null && t >= windowStart && t <= windowEnd;
    })
    .map((r) => r.matchedWorkerId)
    .filter((id): id is string => id != null);

  return new Set([
    ...activeRows.map((r) => r.matchedWorkerId).filter((id): id is string => id != null),
    ...conflicted,
  ]);
}

async function getCompletedCounts(workerIds: string[]): Promise<Map<string, number>> {
  if (workerIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ workerId: quickWorkRequests.matchedWorkerId, count: sql<number>`count(*)::int` })
    .from(quickWorkRequests)
    .where(
      and(
        inArray(quickWorkRequests.matchedWorkerId, workerIds),
        inArray(quickWorkRequests.status, ['completed', 'payment_pending', 'paid', 'rated']),
      ),
    )
    .groupBy(quickWorkRequests.matchedWorkerId);
  return new Map(rows.filter((r) => r.workerId != null).map((r) => [r.workerId as string, r.count]));
}

async function recordTransition(requestId: string, fromStatus: string | null, toStatus: string): Promise<void> {
  await getDb().insert(quickWorkStatusHistory).values({ requestId, fromStatus, toStatus, actorId: null });
}

async function fanOutOffers(requestId: string, candidates: MatchCandidate[]): Promise<void> {
  const top = candidates.slice(0, OFFER_BATCH_SIZE);
  const expiresAt = new Date(Date.now() + OFFER_WINDOW_MS);

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'offered' })
    .where(and(eq(quickWorkRequests.id, requestId), eq(quickWorkRequests.status, 'matching')))
    .returning();
  if (!updated) return; // request moved on (cancelled, etc.) between candidate search and fan-out

  await getDb()
    .insert(quickWorkOffers)
    .values(
      top.map((c) => ({
        requestId,
        workerId: c.workerId,
        status: 'offered' as const,
        distanceMeters: c.distanceMeters,
        etaMinutes: c.etaMinutes,
        rankScore: c.rankScore.toFixed(4),
        expiresAt,
      })),
    );
  await recordTransition(requestId, 'matching', 'offered');

  for (const c of top) {
    emitToUser(c.workerId, 'quick_work:offer_received', { requestId, expiresAt: expiresAt.toISOString() });
    await notifications.record({
      recipientId: c.workerId,
      kind: 'quick_work_offer_received',
      title: 'New Quick Work offer',
      body: `A nearby customer needs help — ${c.etaMinutes} min away.`,
      deeplink: { screen: 'QuickWorkOfferInbox' },
    });
  }
}

async function markNoWorkerFound(requestId: string): Promise<void> {
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'no_worker_found' })
    .where(and(eq(quickWorkRequests.id, requestId), inArray(quickWorkRequests.status, ['matching', 'offered'])))
    .returning();
  if (!updated) return;
  await recordTransition(requestId, 'matching', 'no_worker_found');
  emitToUser(updated.employerId, 'quick_work:no_worker_found', { requestId });
  await notifications.record({
    recipientId: updated.employerId,
    kind: 'quick_work_no_worker_found',
    title: 'No worker found nearby',
    body: 'Nobody was available right now. Try widening your search or post it as a Job instead.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId } },
  });
}

async function runMatchingRound(
  request: QuickWorkRequest,
  radiusMeters: number,
  excludeWorkerIds: string[],
): Promise<void> {
  try {
    const candidates = await findCandidates(request, excludeWorkerIds, radiusMeters);
    if (candidates.length === 0) {
      if (radiusMeters < MAX_RADIUS_M) {
        await runMatchingRound(request, radiusMeters + RADIUS_STEP_M, excludeWorkerIds);
        return;
      }
      await markNoWorkerFound(request.id);
      return;
    }
    await fanOutOffers(request.id, candidates);
  } catch (err) {
    logger.error({ err, requestId: request.id }, 'quick work matching round failed');
  }
}

/**
 * POSTED -> MATCHING, then immediately runs the first candidate-search +
 * offer-fan-out round. Fire-and-forget from the caller's point of view —
 * `post()` in quickWork.service.ts calls this without awaiting so the
 * employer's POST /post response doesn't block on the whole matching pass.
 */
export async function startMatching(requestId: string): Promise<void> {
  const [row] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'matching', matchingStartedAt: new Date() })
    .where(and(eq(quickWorkRequests.id, requestId), eq(quickWorkRequests.status, 'posted')))
    .returning();
  if (!row) return;
  await recordTransition(requestId, 'posted', 'matching');
  emitToUser(row.employerId, 'quick_work:matching_started', { requestId });
  await runMatchingRound(row, INITIAL_RADIUS_M, []);
}

/**
 * Manual "widen search" / retry — employer-plan.md §11.3 step 6-7's
 * radius-expansion, exposed as an explicit action (§7 #11
 * QuickWorkNoWorkerScreen) rather than an automatic background loop,
 * since no cron/queue currently re-drives a single request's matching
 * state (see this file's module doc). Excludes every worker already
 * offered this request so nobody sees the same request twice.
 */
export async function retryMatching(requestId: string, employerId: string): Promise<void> {
  const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId)).limit(1);
  if (!row) throw errors.quickWorkNotFound();
  if (row.employerId !== employerId) throw errors.forbidden();
  if (row.status !== 'offered' && row.status !== 'no_worker_found') {
    throw errors.quickWorkInvalidTransition(row.status, 'matching');
  }

  const priorOffers = await getDb()
    .select({ workerId: quickWorkOffers.workerId })
    .from(quickWorkOffers)
    .where(eq(quickWorkOffers.requestId, requestId));
  const excludeWorkerIds = priorOffers.map((o) => o.workerId);

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'matching' })
    .where(
      and(
        eq(quickWorkRequests.id, requestId),
        inArray(quickWorkRequests.status, ['offered', 'no_worker_found']),
      ),
    )
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'matching');
  await recordTransition(requestId, row.status, 'matching');
  await runMatchingRound(updated, INITIAL_RADIUS_M + RADIUS_STEP_M, excludeWorkerIds);
}

/** Lazy per-offer expiry check — mirrors `hiringRequests`' lazy-expiry idiom. Used by list/accept. */
export function offerIsLive(expiresAt: Date): boolean {
  return expiresAt.getTime() > Date.now();
}
