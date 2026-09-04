/**
 * Quick Work offers — worker-facing inbox + the atomic accept race.
 * employer-plan.md §11.3/§12, seeker-plan.md §10-12.
 *
 * No cron currently sweeps expired offers in the background (see
 * quickWorkMatching.service.ts's module doc) — expiry is enforced lazily,
 * the same idiom `hiringRequests` already uses: `listIncoming` only
 * returns offers whose `expiresAt` hasn't passed, and `accept`'s
 * compare-and-swap includes `expiresAt > now()` in its WHERE clause, so an
 * expired offer can never be accepted even if nothing has "marked" it
 * expired yet. A best-effort sweep (`sweepExpiredOffers`) is registered
 * with the scheduler for the common case (see scheduler/index.ts) so an
 * expired offer's status reflects reality for anyone still looking at it.
 */

import { and, eq, gt, lte, ne } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { errors } from '@/lib/errors';
import { quickWorkOffers, quickWorkRequests, quickWorkStatusHistory, type QuickWorkOffer } from '@/db/schema';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import { getById as getRequestById, type PublicQuickWorkRequest } from './quickWork.service';

export interface PublicQuickWorkOffer {
  id: string;
  requestId: string;
  workerId: string;
  status: string;
  distanceMeters: number | null;
  etaMinutes: number | null;
  offeredAt: string;
  expiresAt: string;
}

function toPublic(row: QuickWorkOffer): PublicQuickWorkOffer {
  return {
    id: row.id,
    requestId: row.requestId,
    workerId: row.workerId,
    status: row.status,
    distanceMeters: row.distanceMeters,
    etaMinutes: row.etaMinutes,
    offeredAt: row.offeredAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** GET /quick-work/offers/incoming — the worker's live, unexpired pending offers. */
export async function listIncoming(workerId: string): Promise<PublicQuickWorkOffer[]> {
  const rows = await getDb()
    .select()
    .from(quickWorkOffers)
    .where(and(eq(quickWorkOffers.workerId, workerId), eq(quickWorkOffers.status, 'offered'), gt(quickWorkOffers.expiresAt, new Date())))
    .orderBy(quickWorkOffers.offeredAt);
  return rows.map(toPublic);
}

/**
 * POST /quick-work/offers/:id/accept — atomic first-accept-wins.
 * employer-plan.md §11.3.4: a single transaction flips the offer AND the
 * parent request's status only if both are still in their pre-accept
 * state; if either compare-and-swap affects 0 rows, the whole transaction
 * throws and rolls back, and the caller gets a clean 409.
 */
export async function acceptOffer(offerId: string, workerId: string): Promise<PublicQuickWorkRequest> {
  const requestId = await getDb().transaction(async (tx) => {
    const [offer] = await tx
      .update(quickWorkOffers)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(
        and(
          eq(quickWorkOffers.id, offerId),
          eq(quickWorkOffers.workerId, workerId),
          eq(quickWorkOffers.status, 'offered'),
          gt(quickWorkOffers.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!offer) throw errors.quickWorkAlreadyTaken();

    const [request] = await tx
      .update(quickWorkRequests)
      .set({ status: 'accepted', matchedWorkerId: workerId, acceptedAt: new Date() })
      .where(and(eq(quickWorkRequests.id, offer.requestId), eq(quickWorkRequests.status, 'offered')))
      .returning();
    if (!request) throw errors.quickWorkAlreadyTaken();

    await tx.insert(quickWorkStatusHistory).values({
      requestId: request.id,
      fromStatus: 'offered',
      toStatus: 'accepted',
      actorId: workerId,
    });

    // Supersede every sibling offer on this request — nobody else can win it now.
    const siblings = await tx
      .update(quickWorkOffers)
      .set({ status: 'superseded' })
      .where(and(eq(quickWorkOffers.requestId, request.id), eq(quickWorkOffers.status, 'offered'), ne(quickWorkOffers.id, offerId)))
      .returning({ workerId: quickWorkOffers.workerId });

    return {
      requestId: request.id,
      employerId: request.employerId,
      isImmediate: request.isImmediate,
      scheduledAt: request.scheduledAt,
      loserIds: siblings.map((s) => s.workerId),
    };
  });

  emitToUser(requestId.employerId, 'quick_work:matched', { requestId: requestId.requestId, workerId });
  await notifications.record({
    recipientId: requestId.employerId,
    kind: 'quick_work_matched',
    title: 'Worker found!',
    body: 'A nearby worker accepted your request.',
    deeplink: { screen: 'QuickWorkDetail', params: { requestId: requestId.requestId } },
  });
  if (!requestId.isImmediate) {
    const when = requestId.scheduledAt
      ? requestId.scheduledAt.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' })
      : 'your scheduled time';
    await notifications.record({
      recipientId: workerId,
      kind: 'quick_work_matched',
      title: "You're booked",
      body: `Scheduled Quick Work confirmed for ${when}.`,
      deeplink: { screen: 'QuickWorkJob', params: { requestId: requestId.requestId } },
    });
  }
  for (const loserId of requestId.loserIds) {
    emitToUser(loserId, 'quick_work:offer_closed', { requestId: requestId.requestId });
    await notifications.record({
      recipientId: loserId,
      kind: 'quick_work_offer_closed',
      title: 'Job already taken',
      body: 'Another worker accepted this Quick Work request.',
      deeplink: { screen: 'Home' },
    });
  }

  return getRequestById(requestId.requestId, workerId);
}

/** POST /quick-work/offers/:id/decline — explicit, immediate, frees the slot without waiting for expiry. */
export async function declineOffer(offerId: string, workerId: string): Promise<void> {
  const [offer] = await getDb()
    .update(quickWorkOffers)
    .set({ status: 'declined', respondedAt: new Date() })
    .where(and(eq(quickWorkOffers.id, offerId), eq(quickWorkOffers.workerId, workerId), eq(quickWorkOffers.status, 'offered')))
    .returning();
  if (!offer) throw errors.quickWorkOfferNotFound();
}

export interface OfferSweepSummary {
  expired: number;
}

/** Best-effort sweep — marks lapsed 'offered' rows as 'expired' for anyone still reading them. Registered in scheduler/index.ts. */
export async function sweepExpiredOffers(): Promise<OfferSweepSummary> {
  const rows = await getDb()
    .update(quickWorkOffers)
    .set({ status: 'expired' })
    .where(and(eq(quickWorkOffers.status, 'offered'), lte(quickWorkOffers.expiresAt, new Date())))
    .returning({ id: quickWorkOffers.id, workerId: quickWorkOffers.workerId });
  for (const row of rows) {
    emitToUser(row.workerId, 'quick_work:offer_expired', { offerId: row.id });
  }
  return { expired: rows.length };
}
