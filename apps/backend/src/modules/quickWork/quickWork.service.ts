/**
 * Quick Work request lifecycle — employer-plan.md §9/§10/§20.
 *
 * Every transition is a single guarded `UPDATE ... WHERE id = $1 AND
 * status = $2` (compare-and-swap on the current status) — the same idiom
 * already used in `hiringRequests.respond()`'s conflict check (see
 * apps/backend/src/modules/hiringRequests/hiringRequest.service.ts) — so a
 * race between two calls updating the same request can't silently
 * double-apply. Every successful transition writes one row to
 * `quick_work_status_history` and calls `emitToUser` + `notifications.record()`.
 *
 * Matching (`MATCHING -> OFFERED`, offer fan-out, atomic accept) is
 * deliberately NOT in this file — that's Phase 3 (`quickWorkMatching.service.ts`),
 * per employer-plan.md §30's phase order. This file owns request
 * CRUD + the DRAFT/POSTED/CANCELLED/terminal edges only.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { errors } from '@/lib/errors';
import {
  quickWorkRequests,
  quickWorkStatusHistory,
  type QuickWorkRequest,
  type QuickWorkStatus,
} from '@/db/schema';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import * as matching from './quickWorkMatching.service';
import { logger } from '@/lib/logger';
import { getTravelTimes } from '@/modules/travelTime/travelTime.service';

export interface PublicQuickWorkRequest {
  id: string;
  employerId: string;
  categoryId: string | null;
  serviceId: string | null;
  title: string | null;
  description: string | null;
  photos: string[];
  videos: string[];
  voiceNoteUrl: string | null;
  location: { lat: number; lng: number } | null;
  address: string | null;
  city: string | null;
  isImmediate: boolean;
  scheduledAt: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  estimatedPrice: number | null;
  finalPrice: number | null;
  status: QuickWorkStatus;
  matchedWorkerId: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  disputeReason: string | null;
  priceApprovedAt: string | null;
  noShowBy: string | null;
  noShowReason: string | null;
  noShowAt: string | null;
  createdAt: string;
  postedAt: string | null;
  acceptedAt: string | null;
  arrivingAt: string | null;
  arrivingEtaMinutes: number | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionPhotoUrl: string | null;
  completionNotes: string | null;
  paidAt: string | null;
  ratedAt: string | null;
  cancelledAt: string | null;
}

function toPublic(row: QuickWorkRequest): PublicQuickWorkRequest {
  return {
    id: row.id,
    employerId: row.employerId,
    categoryId: row.categoryId,
    serviceId: row.serviceId,
    title: row.title,
    description: row.description,
    photos: row.photos ?? [],
    videos: row.videos ?? [],
    voiceNoteUrl: row.voiceNoteUrl,
    location: row.geo ? { lat: row.geo.y, lng: row.geo.x } : null,
    address: row.address,
    city: row.city,
    isImmediate: row.isImmediate,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    estimatedPrice: row.estimatedPrice,
    finalPrice: row.finalPrice,
    status: row.status,
    matchedWorkerId: row.matchedWorkerId,
    cancelledBy: row.cancelledBy,
    cancellationReason: row.cancellationReason,
    disputeReason: row.disputeReason,
    priceApprovedAt: row.priceApprovedAt ? row.priceApprovedAt.toISOString() : null,
    noShowBy: row.noShowBy,
    noShowReason: row.noShowReason,
    noShowAt: row.noShowAt ? row.noShowAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    arrivingAt: row.arrivingAt ? row.arrivingAt.toISOString() : null,
    arrivingEtaMinutes: row.arrivingEtaMinutes,
    arrivedAt: row.arrivedAt ? row.arrivedAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completionPhotoUrl: row.completionPhotoUrl,
    completionNotes: row.completionNotes,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    ratedAt: row.ratedAt ? row.ratedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  };
}

/** Records one audit row + emits the generic status_changed socket event every listener can share (employer-plan.md §24). */
async function recordTransition(
  requestId: string,
  fromStatus: string | null,
  toStatus: QuickWorkStatus,
  actorId: string | null,
): Promise<void> {
  await getDb().insert(quickWorkStatusHistory).values({ requestId, fromStatus, toStatus, actorId });
}

function notifyBoth(request: QuickWorkRequest, event: string, payload: unknown): void {
  emitToUser(request.employerId, event, payload);
  if (request.matchedWorkerId) emitToUser(request.matchedWorkerId, event, payload);
}

interface DraftInput {
  categoryId?: string | null;
  serviceId?: string | null;
  title?: string | null;
  description?: string | null;
  photos?: string[];
  videos?: string[];
  voiceNoteUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  city?: string | null;
  isImmediate?: boolean;
  scheduledAt?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
}

function draftPatch(input: DraftInput): Partial<typeof quickWorkRequests.$inferInsert> {
  const patch: Partial<typeof quickWorkRequests.$inferInsert> = {};
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.serviceId !== undefined) patch.serviceId = input.serviceId;
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.photos !== undefined) patch.photos = input.photos;
  if (input.videos !== undefined) patch.videos = input.videos;
  if (input.voiceNoteUrl !== undefined) patch.voiceNoteUrl = input.voiceNoteUrl;
  if (input.lat != null && input.lng != null) patch.geo = { x: input.lng, y: input.lat };
  if (input.address !== undefined) patch.address = input.address;
  if (input.city !== undefined) patch.city = input.city;
  if (input.isImmediate !== undefined) patch.isImmediate = input.isImmediate;
  if (input.scheduledAt !== undefined) patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (input.budgetMin !== undefined) patch.budgetMin = input.budgetMin;
  if (input.budgetMax !== undefined) patch.budgetMax = input.budgetMax;
  return patch;
}

/** POST /quick-work/requests — always starts life as a DRAFT (employer-plan.md §9.2). */
export async function createDraft(employerId: string, input: DraftInput): Promise<PublicQuickWorkRequest> {
  const [row] = await getDb()
    .insert(quickWorkRequests)
    .values({ employerId, status: 'draft', isImmediate: input.isImmediate ?? true, ...draftPatch(input) })
    .returning();
  if (!row) throw errors.internal();
  await recordTransition(row.id, null, 'draft', employerId);
  return toPublic(row);
}

async function getOwnedRow(id: string, callerId: string): Promise<QuickWorkRequest> {
  const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, id)).limit(1);
  if (!row) throw errors.quickWorkNotFound();
  if (row.employerId !== callerId && row.matchedWorkerId !== callerId) throw errors.forbidden();
  return row;
}

/** PATCH /quick-work/requests/:id — only while still a DRAFT (per the plan's progressive-fill flow). */
export async function updateDraft(id: string, employerId: string, input: DraftInput): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, employerId);
  if (row.employerId !== employerId) throw errors.forbidden();
  if (row.status !== 'draft') throw errors.quickWorkInvalidTransition(row.status, 'draft');

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set(draftPatch(input))
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'draft')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'draft');
  return toPublic(updated);
}

/** GET /quick-work/requests/:id — employer or the matched worker only. */
export async function getById(id: string, callerId: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, callerId);
  return toPublic(row);
}

/** GET /quick-work/requests/mine — employer's own requests (History tabs), optional status filter. */
export async function listForEmployer(employerId: string, status?: QuickWorkStatus): Promise<PublicQuickWorkRequest[]> {
  const conditions = [eq(quickWorkRequests.employerId, employerId)];
  if (status) conditions.push(eq(quickWorkRequests.status, status));
  const rows = await getDb()
    .select()
    .from(quickWorkRequests)
    .where(and(...conditions))
    .orderBy(desc(quickWorkRequests.createdAt))
    .limit(100);
  return rows.map(toPublic);
}

/** GET /quick-work/requests/mine?role=worker — worker's own request history (seeker-plan.md §22/§29). */
export async function listForWorker(workerId: string, status?: QuickWorkStatus): Promise<PublicQuickWorkRequest[]> {
  const conditions = [eq(quickWorkRequests.matchedWorkerId, workerId)];
  if (status) conditions.push(eq(quickWorkRequests.status, status));
  const rows = await getDb()
    .select()
    .from(quickWorkRequests)
    .where(and(...conditions))
    .orderBy(desc(quickWorkRequests.createdAt))
    .limit(100);
  return rows.map(toPublic);
}

/**
 * POST /quick-work/requests/:id/post — DRAFT -> POSTED.
 * Requires serviceId, location, and (isImmediate or scheduledAt) all set
 * (employer-plan.md §10's transition table). Matching kickoff itself
 * (`POSTED -> MATCHING`) is Phase 3's `quickWorkMatching.service.ts`, not
 * this function — posting just parks the request at POSTED for now.
 */
export async function post(id: string, employerId: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, employerId);
  if (row.employerId !== employerId) throw errors.forbidden();
  if (row.status !== 'draft') throw errors.quickWorkInvalidTransition(row.status, 'posted');

  const missing: string[] = [];
  if (!row.serviceId) missing.push('serviceId');
  if (!row.geo) missing.push('location');
  if (!row.isImmediate && !row.scheduledAt) missing.push('scheduledAt');
  if (missing.length > 0) throw errors.quickWorkMissingFields({ missing });

  const postedAt = new Date();
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'posted', postedAt })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'draft')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'posted');

  await recordTransition(id, 'draft', 'posted', employerId);
  emitToUser(employerId, 'quick_work:request_posted', { requestId: id });

  // Immediate requests start matching right away (employer-plan.md §10:
  // "fires as soon as posted for isImmediate=true"). Scheduled requests
  // stay at POSTED until quickWorkScheduling.service.ts's sweep flips them
  // to MATCHING at scheduledAt - leadTime. Fire-and-forget: the employer's
  // POST /post response shouldn't block on a full matching pass.
  if (updated.isImmediate) {
    void matching.startMatching(id).catch((err) => {
      logger.error({ err, requestId: id }, 'quick work matching kickoff failed');
    });
  } else {
    await notifications.record({
      recipientId: employerId,
      kind: 'quick_work_scheduled_confirmed',
      title: 'Scheduled request confirmed',
      body: updated.scheduledAt
        ? `We'll start matching you with a worker closer to ${updated.scheduledAt.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' })}.`
        : "We'll start matching you with a worker closer to your scheduled time.",
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
    });
  }

  return toPublic(updated);
}

/** POST /quick-work/requests/:id/retry-matching — manual widen/retry (employer-plan.md §11.3 steps 6-7). */
export async function retryMatching(id: string, employerId: string): Promise<void> {
  await matching.retryMatching(id, employerId);
}

// ─── Worker execution flow — employer-plan.md §14-16, seeker-plan.md §13-18 ─

async function getOwnedByWorker(id: string, workerId: string): Promise<QuickWorkRequest> {
  const row = await getOwnedRow(id, workerId);
  if (row.matchedWorkerId !== workerId) throw errors.forbidden();
  return row;
}

/** POST /quick-work/requests/:id/arriving — ACCEPTED -> ARRIVING. Worker taps "I'm on my way". */
export async function markArriving(
  id: string,
  workerId: string,
  lat?: number,
  lng?: number,
): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedByWorker(id, workerId);
  if (row.status !== 'accepted') throw errors.quickWorkInvalidTransition(row.status, 'arriving');

  let etaMinutes: number | null = null;
  if (lat != null && lng != null && row.geo) {
    try {
      const [travel] = await getTravelTimes({ lat, lng }, [{ id: 'dest', lat: row.geo.y, lng: row.geo.x }]);
      etaMinutes = travel?.minutes ?? null;
    } catch {
      etaMinutes = null; // travelTime already degrades gracefully; this is belt-and-suspenders
    }
  }

  const arrivingAt = new Date();
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'arriving', arrivingAt, arrivingEtaMinutes: etaMinutes })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'accepted')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'arriving');

  await recordTransition(id, 'accepted', 'arriving', workerId);
  emitToUser(row.employerId, 'quick_work:worker_arriving', { requestId: id, etaMinutes });
  await notifications.record({
    recipientId: row.employerId,
    kind: 'quick_work_worker_arriving',
    title: 'Worker is on the way',
    body: etaMinutes != null ? `Arriving in about ${etaMinutes} min.` : 'The worker is heading your way.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
  });
  return toPublic(updated);
}

/** POST /quick-work/requests/:id/arrived — ACCEPTED/ARRIVING -> ARRIVED. Worker taps "I've arrived". */
export async function markArrived(id: string, workerId: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedByWorker(id, workerId);
  if (row.status !== 'accepted' && row.status !== 'arriving') {
    throw errors.quickWorkInvalidTransition(row.status, 'arrived');
  }

  const arrivedAt = new Date();
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'arrived', arrivedAt })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, row.status)))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'arrived');

  await recordTransition(id, row.status, 'arrived', workerId);
  emitToUser(row.employerId, 'quick_work:worker_arrived', { requestId: id });
  await notifications.record({
    recipientId: row.employerId,
    kind: 'quick_work_worker_arrived',
    title: 'Worker has arrived',
    body: 'They should be starting shortly.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
  });
  return toPublic(updated);
}

/** POST /quick-work/requests/:id/start — ARRIVED -> IN_PROGRESS. */
export async function startWork(id: string, workerId: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedByWorker(id, workerId);
  if (row.status !== 'arrived') throw errors.quickWorkInvalidTransition(row.status, 'in_progress');

  const startedAt = new Date();
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'in_progress', startedAt })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'arrived')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'in_progress');

  await recordTransition(id, 'arrived', 'in_progress', workerId);
  emitToUser(row.employerId, 'quick_work:started', { requestId: id });
  await notifications.record({
    recipientId: row.employerId,
    kind: 'quick_work_started',
    title: 'Work has started',
    body: 'The worker has begun the job.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
  });
  return toPublic(updated);
}

interface CompleteInput {
  completionPhotoUrl?: string | null;
  completionNotes?: string | null;
  finalPrice?: number | null;
}

/**
 * POST /quick-work/requests/:id/complete — IN_PROGRESS -> COMPLETED, then
 * an automatic COMPLETED -> PAYMENT_PENDING (employer-plan.md §15/§16).
 * `finalPrice` defaults to the original `estimatedPrice` when the worker
 * doesn't submit a revised one — no separate "additional charges" approval
 * flow is built in this pass (seeker-plan.md §17 flags it as its own
 * feature); the worker can still name a different final price here and
 * the employer sees it plainly on the completion/payment screen before
 * paying, which is the minimum honest version of "the price can differ
 * from the estimate."
 */
export async function completeWork(id: string, workerId: string, input: CompleteInput): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedByWorker(id, workerId);
  if (row.status !== 'in_progress') throw errors.quickWorkInvalidTransition(row.status, 'completed');

  const completedAt = new Date();
  const finalPrice = input.finalPrice ?? row.estimatedPrice ?? row.budgetMax ?? row.budgetMin ?? null;

  // Server-side sanity bound (gap #4 — "validate final price server-side").
  // A worker can still legitimately charge more than the original estimate
  // (extra parts, more time on site), so this isn't a hard cap at the
  // estimate — it's a guard against an obviously-wrong submission. The
  // employer's own explicit approval (approvePrice, below) is the real
  // check on the *amount*; this just rejects nonsense before it reaches
  // that screen.
  if (finalPrice != null && finalPrice > 0) {
    const reference = row.estimatedPrice ?? row.budgetMax ?? row.budgetMin;
    if (reference && finalPrice > reference * 5) {
      throw errors.validation(
        { finalPrice: 'implausible' },
        'That final price looks far higher than the original estimate — double-check it.',
      );
    }
  } else if (finalPrice != null && finalPrice <= 0) {
    throw errors.validation({ finalPrice: 'invalid' }, 'Final price must be a positive amount.');
  }

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({
      status: 'payment_pending',
      completedAt,
      completionPhotoUrl: input.completionPhotoUrl ?? null,
      completionNotes: input.completionNotes ?? null,
      finalPrice,
      priceApprovedAt: null, // reset — this completion's price hasn't been approved yet
    })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'in_progress')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'completed');

  // Two history rows — COMPLETED is momentary but real, per the state
  // machine table (employer-plan.md §10): IN_PROGRESS -> COMPLETED is
  // worker-triggered, COMPLETED -> PAYMENT_PENDING is an automatic system
  // transition that happens in the same request.
  await recordTransition(id, 'in_progress', 'completed', workerId);
  await recordTransition(id, 'completed', 'payment_pending', null);

  emitToUser(row.employerId, 'quick_work:completed', { requestId: id, finalPrice });
  await notifications.record({
    recipientId: row.employerId,
    kind: 'quick_work_completed',
    title: 'Work completed',
    body: finalPrice != null ? `Ready to pay ₹${(finalPrice / 100).toFixed(0)}.` : 'Review and pay when ready.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
  });
  emitToUser(row.employerId, 'quick_work:payment_pending', { requestId: id });
  return toPublic(updated);
}

/**
 * POST /quick-work/requests/:id/approve-price — employer only, gap #4's
 * pre-payment approval gate. Stays at `payment_pending` (no new status —
 * "do not unnecessarily complicate the model"); `priceApprovedAt` is what
 * `payment.routes.ts`'s `/intent` route now requires before it will create
 * a payment intent for this request. The employer's other option at this
 * screen is `raiseDispute()` (already allowed from `payment_pending`) —
 * that already blocks payment just by never setting this flag.
 */
export async function approvePrice(id: string, employerId: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, employerId);
  if (row.employerId !== employerId) throw errors.forbidden();
  if (row.status !== 'payment_pending') throw errors.quickWorkInvalidTransition(row.status, 'payment_pending');
  if (row.priceApprovedAt) return toPublic(row); // already approved — idempotent no-op

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ priceApprovedAt: new Date() })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'payment_pending')))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'payment_pending');

  if (updated.matchedWorkerId) {
    emitToUser(updated.matchedWorkerId, 'quick_work:price_approved', { requestId: id, finalPrice: updated.finalPrice });
    await notifications.record({
      recipientId: updated.matchedWorkerId,
      kind: 'quick_work_price_approved',
      title: 'Price approved',
      body: 'The customer approved the final price. Payment is on its way.',
      deeplink: { screen: 'QuickWorkJob', params: { requestId: id } },
    });
  }
  return toPublic(updated);
}

/**
 * PAYMENT_PENDING -> PAID. Called from `payment.routes.ts`'s mark-paid
 * handler after the wallet credit succeeds — payment stays
 * server-authoritative there (employer-plan.md §17/§27's "never trust a
 * client saying payment successful" rule); this only records the Quick
 * Work side of that already-verified event.
 */
export async function markPaid(id: string): Promise<PublicQuickWorkRequest | null> {
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'payment_pending')))
    .returning();
  if (!updated) return null;

  await recordTransition(id, 'payment_pending', 'paid', null);
  if (updated.matchedWorkerId) {
    emitToUser(updated.matchedWorkerId, 'quick_work:paid', { requestId: id });
    await notifications.record({
      recipientId: updated.matchedWorkerId,
      kind: 'quick_work_paid',
      title: 'Payment received',
      body: 'Your Quick Work payment has landed in your wallet.',
      deeplink: { screen: 'MyEarnings' },
    });
  }
  return toPublic(updated);
}

/**
 * POST /quick-work/requests/:id/dispute — either party, only from a
 * terminal-ish execution state (employer-plan.md §20/§21). Routes into
 * `quick_work_requests.status='disputed'` + `disputeReason` — the
 * repository's separate `disputes` table is Jobs/application-scoped
 * (`applicationId`/`jobId` both NOT NULL) and out of scope to relax in
 * this pass; this is the same self-contained shape already used for
 * cancellation reasons, not a second unrelated dispute system.
 */
const DISPUTABLE_STATUSES: QuickWorkStatus[] = ['completed', 'payment_pending', 'paid'];

export async function raiseDispute(id: string, callerId: string, reason: string): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, callerId);
  if (!DISPUTABLE_STATUSES.includes(row.status)) {
    throw errors.quickWorkInvalidTransition(row.status, 'disputed');
  }

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'disputed', disputeReason: reason })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, row.status)))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'disputed');

  await recordTransition(id, row.status, 'disputed', callerId);

  const isEmployer = row.employerId === callerId;
  const otherPartyId = isEmployer ? row.matchedWorkerId : row.employerId;
  for (const recipientId of [callerId, otherPartyId].filter((v): v is string => v != null)) {
    emitToUser(recipientId, 'quick_work:disputed', { requestId: id });
    await notifications.record({
      recipientId,
      kind: 'quick_work_disputed',
      title: 'Dispute raised',
      body: reason,
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
    });
  }
  return toPublic(updated);
}

/** seeker-plan.md §7 — derived BUSY state: does this worker have a live Quick Work job right now? */
export async function isWorkerBusy(workerId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: quickWorkRequests.id })
    .from(quickWorkRequests)
    .where(
      and(
        eq(quickWorkRequests.matchedWorkerId, workerId),
        inArray(quickWorkRequests.status, ['accepted', 'arriving', 'arrived', 'in_progress']),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * POST /quick-work/requests/:id/cancel — status-aware, escalating
 * restrictions (employer-plan.md §20's table, mirrored for both parties):
 *
 *   draft/posted/matching/offered  -> free cancel, no penalty
 *   accepted/arriving/arrived      -> allowed, reason required
 *   in_progress+                   -> not a plain cancel, routes to Dispute
 */
const FREE_CANCEL_STATUSES: QuickWorkStatus[] = ['draft', 'posted', 'matching', 'offered'];
const REASON_REQUIRED_CANCEL_STATUSES: QuickWorkStatus[] = ['accepted', 'arriving', 'arrived'];

export async function cancel(
  id: string,
  callerId: string,
  reason: string | null,
): Promise<PublicQuickWorkRequest> {
  const row = await getOwnedRow(id, callerId);
  const isEmployer = row.employerId === callerId;
  const cancelledBy = isEmployer ? 'employer' : 'worker';

  if (FREE_CANCEL_STATUSES.includes(row.status)) {
    // no extra checks
  } else if (REASON_REQUIRED_CANCEL_STATUSES.includes(row.status)) {
    if (!reason || reason.trim().length < 3) {
      throw errors.validation({ reason: 'A reason is required to cancel at this stage.' });
    }
  } else {
    // in_progress, completed, payment_pending, paid, rated, or already-terminal —
    // not a plain cancel; route to Dispute (employer-plan.md §20/§21) instead.
    throw errors.quickWorkInvalidTransition(row.status, 'cancelled');
  }

  const cancelledAt = new Date();
  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'cancelled', cancelledBy, cancellationReason: reason, cancelledAt })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, row.status)))
    .returning();
  if (!updated) throw errors.quickWorkInvalidTransition(row.status, 'cancelled');

  await recordTransition(id, row.status, 'cancelled', callerId);

  const otherPartyId = isEmployer ? row.matchedWorkerId : row.employerId;
  if (otherPartyId) {
    const kind = isEmployer ? 'quick_work_customer_cancelled' : 'quick_work_cancelled';
    await notifications.record({
      recipientId: otherPartyId,
      kind,
      title: 'Quick Work request cancelled',
      body: isEmployer ? 'The customer cancelled this request.' : 'The worker cancelled this request.',
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: id } },
    });
    emitToUser(otherPartyId, 'quick_work:cancelled', { requestId: id, cancelledBy });
  }
  return toPublic(updated);
}
