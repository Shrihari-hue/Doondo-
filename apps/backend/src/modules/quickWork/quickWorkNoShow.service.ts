/**
 * No-show handling (gap #3).
 *
 * Two genuinely different mechanisms, on purpose:
 *
 *   - Worker no-show is detected automatically. We have a real signal for
 *     it: the job's expected start time has passed by more than the grace
 *     period and the request never reached `arrived`. Nobody needs to be
 *     present to observe that — it's pure elapsed time (see the sweep
 *     below for why the anchor is the expected start, not `acceptedAt`).
 *
 *   - Customer no-show has no equivalent automatic signal. Whether the
 *     customer is actually present is only observable by the worker
 *     standing at the address — there's no geofencing/camera check in
 *     this repository to infer it from. So this is a manual, worker-
 *     triggered report (`reportCustomerNoShow`), gated by a minimum wait
 *     since `arrivedAt` so it can't be used to skip work the instant a
 *     worker arrives.
 *
 * Neither path invents a financial penalty — both only record
 * who/why/when (`noShowBy`/`noShowReason`/`noShowAt`) and notify both
 * parties. The request's `status` is deliberately left untouched so the
 * existing cancel (reason-required past ACCEPTED) and dispute machinery
 * keep working exactly as built — a no-show is a fact surfaced on top of
 * the existing state machine, not a new terminal state.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { quickWorkRequests, type QuickWorkRequest } from '@/db/schema';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import { getById as getRequestById, type PublicQuickWorkRequest } from './quickWork.service';

export interface NoShowSweepSummary { flagged: number; }

function notifyNoShow(row: QuickWorkRequest, title: string, body: string): void {
  const recipients = [row.employerId, row.matchedWorkerId].filter((v): v is string => v != null);
  for (const recipientId of recipients) {
    emitToUser(recipientId, 'quick_work:no_show', { requestId: row.id, noShowBy: row.noShowBy });
    void notifications.record({
      recipientId,
      kind: 'quick_work_no_show',
      title,
      body,
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: row.id } },
    });
  }
}

/**
 * Sweep: ACCEPTED or ARRIVING, still not flagged, past its arrival
 * deadline, and never reached ARRIVED. Flags once (guarded by
 * `noShowAt IS NULL`) — a second sweep tick sees the row already claimed
 * and does nothing, so this is safe to run twice or after a restart.
 *
 * The deadline is measured from the job's EXPECTED START, not merely from
 * when the worker accepted: `COALESCE(scheduled_at, accepted_at) + grace`.
 * Anchoring on `accepted_at` alone would flag a worker who accepted a
 * scheduled job hours in advance as a no-show ~20 minutes later, while
 * they are still perfectly on time for a job that hasn't started yet —
 * the exact cross-feature break Scheduled Work introduces here.
 */
export async function runWorkerNoShowSweep(): Promise<NoShowSweepSummary> {
  const graceMinutes = env.QUICK_WORK_ARRIVAL_GRACE_MINUTES;
  const cutoff = new Date(Date.now() - graceMinutes * 60_000);
  const candidates = await getDb()
    .select()
    .from(quickWorkRequests)
    .where(
      and(
        inArray(quickWorkRequests.status, ['accepted', 'arriving']),
        isNull(quickWorkRequests.noShowAt),
        // `${cutoff.toISOString()}::timestamptz`, not `${cutoff}`: a raw
        // `sql` template hands postgres.js an untyped bind param, and a
        // bare JS Date there throws at runtime ("Received an instance of
        // Date") — drizzle's own operators (lt/eq) don't, because they
        // know the column's type and serialize for it. Same raw-SQL-vs-
        // query-builder trap as the `ANY(${arr})` and date-parsing bugs
        // already documented in availability.service.ts, and it silently
        // killed every tick of this sweep until a test caught it.
        sql`coalesce(${quickWorkRequests.scheduledAt}, ${quickWorkRequests.acceptedAt}) < ${cutoff.toISOString()}::timestamptz`,
      ),
    );

  let flagged = 0;
  for (const row of candidates) {
    const [claimed] = await getDb()
      .update(quickWorkRequests)
      .set({
        noShowBy: 'worker',
        noShowReason: row.scheduledAt
          ? `Worker had not arrived ${graceMinutes} minutes after the scheduled start time.`
          : `Worker had not arrived ${graceMinutes} minutes after accepting.`,
        noShowAt: new Date(),
      })
      .where(and(eq(quickWorkRequests.id, row.id), isNull(quickWorkRequests.noShowAt)))
      .returning();
    const updated = claimed;
    if (!updated) continue;
    flagged += 1;
    notifyNoShow(
      updated,
      'Worker running late',
      "The worker hasn't arrived yet. You can wait, cancel and find another worker, or raise a dispute.",
    );
  }
  return { flagged };
}

/**
 * POST /quick-work/requests/:id/report-no-show — worker only, and only
 * once they've actually arrived and waited a minimum grace period. This
 * is the "signal" the automatic sweep above can't have: the worker is
 * physically there and the customer isn't responding.
 */
export async function reportCustomerNoShow(
  id: string,
  workerId: string,
  reason: string,
): Promise<PublicQuickWorkRequest> {
  const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, id)).limit(1);
  if (!row) throw errors.quickWorkNotFound();
  if (row.matchedWorkerId !== workerId) throw errors.forbidden();
  if (row.status !== 'arrived') {
    throw errors.conflict('You can only report the customer as unavailable after marking yourself arrived.');
  }
  if (row.noShowAt) throw errors.conflict('A no-show has already been recorded for this request.');
  const minWaitMs = env.QUICK_WORK_CUSTOMER_NOSHOW_MIN_WAIT_MINUTES * 60_000;
  if (!row.arrivedAt || Date.now() - row.arrivedAt.getTime() < minWaitMs) {
    throw errors.conflict(
      `Wait at least ${env.QUICK_WORK_CUSTOMER_NOSHOW_MIN_WAIT_MINUTES} minutes after arriving before reporting this.`,
    );
  }

  const [updated] = await getDb()
    .update(quickWorkRequests)
    .set({ noShowBy: 'employer', noShowReason: reason, noShowAt: new Date() })
    .where(and(eq(quickWorkRequests.id, id), eq(quickWorkRequests.status, 'arrived'), isNull(quickWorkRequests.noShowAt)))
    .returning();
  if (!updated) throw errors.conflict('A no-show has already been recorded for this request.');

  notifyNoShow(
    updated,
    'Customer unavailable',
    'The worker reported the customer as unavailable on site. You can cancel, dispute, or wait for them to arrive.',
  );
  return getRequestById(id, workerId);
}
