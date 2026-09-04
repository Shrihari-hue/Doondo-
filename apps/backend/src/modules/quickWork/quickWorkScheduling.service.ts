/**
 * Scheduled Work automation — employer-plan.md §10's "for scheduled, a
 * scheduler job flips this at scheduledAt - leadTime" line, which was
 * never actually built. Two sweeps, both registered on the existing
 * `QUICK_WORK_SWEEP_CRON` cadence (scheduler/index.ts) — no second
 * scheduling system, just two more functions on the same cron tick.
 *
 * Both sweeps are pure "SELECT the rows that are due, act on them"
 * passes with no in-memory state, so they are naturally:
 *   - idempotent: acting on an already-handled row is a no-op (the
 *     `startMatching` compare-and-swap only fires for status='posted';
 *     the reminder compare-and-swap only fires when the flag is unset)
 *   - concurrency-safe: two overlapping sweep runs race harmlessly on
 *     the same WHERE-guarded UPDATE, exactly like every other
 *     transition in this module
 *   - restart-safe: nothing but the database rows drives what happens
 *     next tick, so a server restart loses no state
 */

import { and, eq, isNull, lt, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { quickWorkRequests, quickWorkStatusHistory } from '@/db/schema';
import { emitToUser } from '@/sockets/bus';
import * as notifications from '@/modules/notifications/notification.service';
import { startMatching } from './quickWorkMatching.service';

export interface ScheduledMatchingSweepSummary { started: number; expired: number; }
export interface ScheduledReminderSweepSummary { reminded: number; }

/**
 * POSTED + scheduled (isImmediate=false) + due (scheduledAt - lead <= now)
 * -> kicks off the exact same `startMatching()` an immediate request's
 * `post()` call already uses. Reuses that function outright rather than
 * duplicating its matching-round/offer-fan-out logic.
 */
export async function runScheduledMatchingSweep(): Promise<ScheduledMatchingSweepSummary> {
  const leadMs = env.QUICK_WORK_SCHEDULE_LEAD_MINUTES * 60_000;
  const staleMs = env.QUICK_WORK_SCHEDULE_STALE_MINUTES * 60_000;
  const due = new Date(Date.now() + leadMs);
  const staleBefore = new Date(Date.now() - staleMs);

  // Stale first: a still-POSTED request whose own scheduled time is
  // already well past (a scheduler outage, say) must NOT start hunting
  // for a worker — the booking it represents is gone. Expire it and tell
  // the employer, rather than matching someone to yesterday's job.
  const staleRows = await getDb()
    .update(quickWorkRequests)
    .set({ status: 'expired' })
    .where(
      and(
        eq(quickWorkRequests.status, 'posted'),
        eq(quickWorkRequests.isImmediate, false),
        lt(quickWorkRequests.scheduledAt, staleBefore),
      ),
    )
    .returning({ id: quickWorkRequests.id, employerId: quickWorkRequests.employerId });

  for (const row of staleRows) {
    await getDb()
      .insert(quickWorkStatusHistory)
      .values({ requestId: row.id, fromStatus: 'posted', toStatus: 'expired', actorId: null });
    emitToUser(row.employerId, 'quick_work:expired', { requestId: row.id });
    await notifications.record({
      recipientId: row.employerId,
      kind: 'quick_work_expired',
      title: 'Scheduled request expired',
      body: "Its scheduled time passed without a worker being booked. Post it again when you're ready.",
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: row.id } },
    });
  }

  const rows = await getDb()
    .select({ id: quickWorkRequests.id })
    .from(quickWorkRequests)
    .where(
      and(
        eq(quickWorkRequests.status, 'posted'),
        eq(quickWorkRequests.isImmediate, false),
        lte(quickWorkRequests.scheduledAt, due),
      ),
    );

  for (const row of rows) {
    try {
      // startMatching itself does `WHERE status = 'posted'` compare-and-swap,
      // so calling it twice for the same row (e.g. two overlapping sweep
      // ticks) is safe — the second call's UPDATE affects 0 rows and it
      // returns without doing anything further.
      await startMatching(row.id);
    } catch (err) {
      logger.error({ err, requestId: row.id }, 'scheduled quick work matching kickoff failed');
    }
  }
  return { started: rows.length, expired: staleRows.length };
}

/**
 * ACCEPTED + scheduled + within the reminder window + not yet reminded
 * -> notifies both parties once, then flips the flag so it never fires
 * again for this request. The `WHERE scheduledReminderSentAt IS NULL`
 * compare-and-swap is what makes "safe if executed twice" actually true
 * here — without a persisted flag, a duplicate sweep tick (or a second
 * process instance) would double-notify.
 */
export async function runScheduledReminderSweep(): Promise<ScheduledReminderSweepSummary> {
  const reminderMs = env.QUICK_WORK_SCHEDULE_REMINDER_MINUTES * 60_000;
  const due = new Date(Date.now() + reminderMs);
  const candidates = await getDb()
    .select()
    .from(quickWorkRequests)
    .where(
      and(
        eq(quickWorkRequests.status, 'accepted'),
        eq(quickWorkRequests.isImmediate, false),
        lte(quickWorkRequests.scheduledAt, due),
        isNull(quickWorkRequests.scheduledReminderSentAt),
      ),
    );

  let reminded = 0;
  for (const row of candidates) {
    const [claimed] = await getDb()
      .update(quickWorkRequests)
      .set({ scheduledReminderSentAt: new Date() })
      .where(and(eq(quickWorkRequests.id, row.id), isNull(quickWorkRequests.scheduledReminderSentAt)))
      .returning({ id: quickWorkRequests.id });
    if (!claimed) continue; // another concurrent tick already claimed it

    reminded += 1;
    const when = row.scheduledAt ? row.scheduledAt.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'soon';
    emitToUser(row.employerId, 'quick_work:scheduled_reminder', { requestId: row.id });
    await notifications.record({
      recipientId: row.employerId,
      kind: 'quick_work_scheduled_reminder',
      title: 'Your Quick Work is coming up',
      body: `Your booked worker is due around ${when}.`,
      deeplink: { screen: 'QuickWorkDetail', params: { requestId: row.id } },
    });
    if (row.matchedWorkerId) {
      emitToUser(row.matchedWorkerId, 'quick_work:scheduled_reminder', { requestId: row.id });
      await notifications.record({
        recipientId: row.matchedWorkerId,
        kind: 'quick_work_scheduled_reminder',
        title: 'Upcoming Quick Work job',
        body: `You're booked around ${when}. Plan your travel time.`,
        deeplink: { screen: 'QuickWorkJob', params: { requestId: row.id } },
      });
    }
  }
  return { reminded };
}

/** Runs both sweeps back-to-back — this is what the scheduler registers. */
export async function runScheduledWorkSweep(): Promise<void> {
  await runScheduledMatchingSweep();
  await runScheduledReminderSweep();
}
