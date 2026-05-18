/**
 * Anti-ghost sweep — periodic background job that flags employers who
 * leave seekers on read.
 *
 * Rule:
 *   An application is "ghosted" when it stays in `status === 'pending'`
 *   for longer than the SLA window (default 72h) AND has not yet been
 *   flagged. The sweep marks `flaggedAsGhostedAt`, fires a push to the
 *   seeker ("No reply yet — the employer hasn't responded in 72 hours"),
 *   and increments the employer's ghost count via a $inc on the User
 *   document (denormalised counter for fast sort/filter on the
 *   employer-rep dashboard later).
 *
 *   Once flagged, an application is NOT re-flagged on later sweeps —
 *   the `flaggedAsGhostedAt` check at the top of the query is the
 *   idempotency guard.
 *
 * What the sweep deliberately doesn't do:
 *   - It doesn't change `status`. The seeker can still get a real
 *     reply afterwards; ghosting is an informational layer.
 *   - It doesn't tank the employer's Doondo Score directly. The score
 *     v1 doesn't look at ghosting; that's a deliberate v2 decision so
 *     we can tune the sweep against real data first.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendGhostedPush } from '@/lib/push';
import { env } from '@/config/env';
import { ApplicationModel } from './application.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';

export interface GhostSweepSummary {
  /** Total applications considered (i.e. fetched in this run). */
  considered: number;
  /** Applications newly flagged in this run. */
  flagged: number;
  /** Per-user push failures (push pipeline is fire-and-forget so this is rare). */
  errors: number;
}

const BATCH_LIMIT = 500;

/**
 * Run one ghost sweep pass. Designed to be called from a scheduled
 * task (cron) but safe to invoke manually for backfills.
 *
 * Returns a summary the caller can log. Doesn't throw on per-row
 * errors — only on top-level DB failures.
 */
export async function runGhostSweep(): Promise<GhostSweepSummary> {
  const slaHours = env.GHOST_SLA_HOURS;
  const cutoff = new Date(Date.now() - slaHours * 60 * 60 * 1000);

  const candidates = await ApplicationModel.find({
    status: 'pending',
    appliedAt: { $lte: cutoff },
    flaggedAsGhostedAt: null,
  })
    .limit(BATCH_LIMIT)
    .lean();

  const summary: GhostSweepSummary = {
    considered: candidates.length,
    flagged: 0,
    errors: 0,
  };

  if (candidates.length === 0) {
    return summary;
  }

  // Hydrate jobs + employers once for the whole batch.
  const jobIds = [...new Set(candidates.map((c) => c.jobId.toString()))];
  const employerIds = [...new Set(candidates.map((c) => c.employerId.toString()))];
  const [jobs, employers] = await Promise.all([
    JobModel.find({ _id: { $in: jobIds } })
      .select('title')
      .lean(),
    UserModel.find({ _id: { $in: employerIds } })
      .select('name companyName')
      .lean(),
  ]);
  const jobMap = new Map(
    jobs.map((j) => [
      (j._id as Types.ObjectId).toString(),
      (j as { title?: string }).title ?? null,
    ]),
  );
  const employerMap = new Map(
    employers.map((e) => [
      (e._id as Types.ObjectId).toString(),
      (e as { companyName?: string | null; name?: string }).companyName ??
        (e as { name?: string }).name ??
        null,
    ]),
  );

  // Flag in one shot so a partial failure can't leave a half-flagged batch.
  const now = new Date();
  const ids = candidates.map((c) => c._id);
  const writeResult = await ApplicationModel.updateMany(
    { _id: { $in: ids }, flaggedAsGhostedAt: null },
    { $set: { flaggedAsGhostedAt: now } },
  );
  summary.flagged = writeResult.modifiedCount ?? 0;

  // Best-effort per-recipient push. We don't await all — fan-out is
  // OK to be async. Each helper records its own in-app row.
  for (const app of candidates) {
    const jobTitle = jobMap.get(app.jobId.toString()) ?? undefined;
    const employerName = employerMap.get(app.employerId.toString()) ?? undefined;
    void sendGhostedPush({
      recipientId: app.seekerId.toString(),
      jobTitle: jobTitle ?? undefined,
      employerName: employerName ?? undefined,
      hours: slaHours,
      applicationId: (app._id as Types.ObjectId).toString(),
    }).catch((err) => {
      summary.errors += 1;
      logger.warn(
        { err, applicationId: (app._id as Types.ObjectId).toString() },
        'ghost sweep: push failed',
      );
    });
  }

  logger.info(summary, 'ghost sweep complete');
  return summary;
}
