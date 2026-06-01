/**
 * Night-before shift confirmation — pre-shift "are you coming?" push to
 * the hired worker.
 *
 * A hired Application can carry a concrete `nextShiftAt` (set by the
 * employer). This sweep, run each evening, finds shifts that:
 *   - belong to a still-hired application,
 *   - start within the next `SHIFT_CONFIRM_LEAD_HOURS`,
 *   - are still in the future,
 *   - haven't already been prompted,
 * and sends the worker one "confirm you're coming tomorrow" push.
 *
 * Idempotency lives on `shiftConfirmation.promptedAt`: the sweep stamps it
 * before pushing, so a worker is asked once per shift. The worker's reply
 * (confirm / decline) sets `confirmedAt` / `declinedAt`; a prompt with no
 * reply by shift time reads as `awaiting` to the employer — their cue to
 * line up backfill before a silent no-show.
 *
 * Mirrors `interviewReminders.service.ts` in shape: mark-then-push, bound
 * the window both ends, swallow per-row errors so one bad row never kills
 * the batch.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendShiftConfirmationPush } from '@/lib/push';
import { env } from '@/config/env';
import { ApplicationModel } from './application.model';
import { JobModel } from '@/modules/jobs/job.model';

export interface ShiftConfirmationSweepSummary {
  considered: number;
  promptsSent: number;
  errors: number;
}

const BATCH_LIMIT = 200;

/** "tomorrow 8:00 AM" / "today 6:00 PM" — a short, worker-friendly label. */
function shiftWhenLabel(shiftAt: Date, now: Date): string {
  const time = shiftAt.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dayDiff = Math.round(
    (new Date(shiftAt.getFullYear(), shiftAt.getMonth(), shiftAt.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  const day = dayDiff <= 0 ? 'today' : dayDiff === 1 ? 'tomorrow' : `in ${dayDiff} days`;
  return `${day} ${time}`;
}

export async function runShiftConfirmationSweep(): Promise<ShiftConfirmationSweepSummary> {
  const leadHours = env.SHIFT_CONFIRM_LEAD_HOURS;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadHours * 60 * 60 * 1000);

  const candidates = await ApplicationModel.find({
    status: 'hired',
    nextShiftAt: { $gte: now, $lte: windowEnd },
    $or: [
      { shiftConfirmation: null },
      { 'shiftConfirmation.promptedAt': null },
    ],
  })
    .limit(BATCH_LIMIT)
    .lean();

  const summary: ShiftConfirmationSweepSummary = {
    considered: candidates.length,
    promptsSent: 0,
    errors: 0,
  };
  if (candidates.length === 0) return summary;

  // Hydrate job titles once for the batch.
  const jobIds = [...new Set(candidates.map((c) => c.jobId.toString()))];
  const jobs = await JobModel.find({ _id: { $in: jobIds } })
    .select('title')
    .lean();
  const jobTitleMap = new Map(
    jobs.map((j) => [
      (j._id as Types.ObjectId).toString(),
      (j as { title?: string }).title ?? null,
    ]),
  );

  // Mark prompted first so a partial failure doesn't re-sweep these rows.
  const ids = candidates.map((c) => c._id);
  const markedAt = new Date();
  await ApplicationModel.updateMany(
    { _id: { $in: ids } },
    { $set: { 'shiftConfirmation.promptedAt': markedAt } },
  );

  for (const app of candidates) {
    const shiftAt = app.nextShiftAt;
    if (!shiftAt) continue;
    const jobTitle = jobTitleMap.get(app.jobId.toString()) ?? undefined;
    void sendShiftConfirmationPush({
      recipientId: app.seekerId.toString(),
      jobTitle,
      whenLabel: shiftWhenLabel(new Date(shiftAt), now),
      applicationId: (app._id as Types.ObjectId).toString(),
    }).catch((err) => {
      summary.errors += 1;
      logger.warn(
        { err, applicationId: (app._id as Types.ObjectId).toString() },
        'shift confirmation: worker push failed',
      );
    });
    summary.promptsSent += 1;
  }

  logger.info(summary, 'shift confirmation sweep complete');
  return summary;
}
