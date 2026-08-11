/**
 * Auto-escalation of a stalling job.
 *
 * A post is "stalling" when it's active, still short of its headcount, and
 * hasn't drawn enough candidates to fill it after a quiet window. Rather
 * than let it die unnoticed, a scheduler walks active jobs and advances a
 * graduated escalation ladder, taking a concrete action at each rung:
 *
 *   stage 1 (boost)         — lift the post in the "right now" feed for 48h
 *                             (the feed reads `escalation.boostedUntil`).
 *   stage 2 (recommend)     — keep the boost live and nudge the employer
 *                             with a specific fix: raise the wage if it's
 *                             below the local market, else widen / enrich.
 *   stage 3 (final nudge)   — tell the employer it's still unfilled and to
 *                             consider reposting or editing.
 *
 * Stages only move forward, one per sweep, gated by time so a post can't
 * jump rungs in an hour. State lives on `job.escalation`; the employer is
 * notified at each step. Per-row failures are swallowed so one bad job
 * never kills the batch.
 */

import { and, asc, count, eq, lte, notInArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';
import { getDb } from '@/db/client';
import { applications, jobs, type JobEscalationJson } from '@/db/schema';
import { getWageBenchmark } from './job.service';
import * as notifications from '@/modules/notifications/notification.service';

export interface EscalationSweepSummary {
  considered: number;
  escalated: number;
  errors: number;
}

const BATCH_LIMIT = 300;
const BOOST_WINDOW_MS = 48 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface EscalationJob {
  id: string;
  title: string;
  employerId: string;
  headcount: number;
  createdAt: Date;
  escalation: JobEscalationJson | null;
}

/** Decide the stage this job should be at, or null to leave it alone. */
function targetStage(job: EscalationJob, now: number): number | null {
  const ageHours = (now - job.createdAt.getTime()) / HOUR_MS;
  const current = job.escalation?.stage ?? 0;
  if (current >= 3) return null;

  if (current === 0) {
    return ageHours >= env.ESCALATION_STALL_HOURS ? 1 : null;
  }
  // Advancing past stage 1 needs a gap since the last escalation.
  const lastAt = job.escalation?.lastEscalatedAt
    ? new Date(job.escalation.lastEscalatedAt).getTime()
    : 0;
  const gapOk = now - lastAt >= env.ESCALATION_STAGE_GAP_HOURS * HOUR_MS;
  return gapOk ? current + 1 : null;
}

export async function runEscalationSweep(): Promise<EscalationSweepSummary> {
  const db = getDb();
  const now = Date.now();
  const stallBefore = new Date(now - env.ESCALATION_STALL_HOURS * HOUR_MS);

  const jobRows = await db
    .select({ id: jobs.id, title: jobs.title, employerId: jobs.employerId, headcount: jobs.headcount, createdAt: jobs.createdAt, escalation: jobs.escalation })
    .from(jobs)
    .where(and(eq(jobs.status, 'active'), lte(jobs.createdAt, stallBefore)))
    .orderBy(asc(jobs.createdAt))
    .limit(BATCH_LIMIT);

  const summary: EscalationSweepSummary = { considered: jobRows.length, escalated: 0, errors: 0 };

  for (const job of jobRows) {
    try {
      const headcount = job.headcount ?? 1;
      const jobId = job.id;

      const [[hiredRow], [applicantsRow]] = await Promise.all([
        db.select({ n: count() }).from(applications).where(and(eq(applications.jobId, jobId), eq(applications.status, 'hired'))),
        db.select({ n: count() }).from(applications).where(and(eq(applications.jobId, jobId), notInArray(applications.status, ['rejected', 'withdrawn']))),
      ]);
      const hired = hiredRow!.n;
      const applicants = applicantsRow!.n;

      // Filled, or has enough live candidates to fill — not stalling.
      if (hired >= headcount || applicants >= headcount) continue;

      const next = targetStage(job, now);
      if (next === null) continue;

      const boostedUntil = new Date(now + BOOST_WINDOW_MS);
      const nextEscalation: JobEscalationJson = {
        stage: next,
        lastEscalatedAt: new Date(now).toISOString(),
        // Stages 1 & 2 keep the boost live; stage 3 lets it lapse.
        boostedUntil: next <= 2 ? boostedUntil.toISOString() : job.escalation?.boostedUntil ?? null,
      };
      await db.update(jobs).set({ escalation: nextEscalation }).where(eq(jobs.id, jobId));

      const title = job.title ?? 'your job';
      let body: string;
      if (next === 1) {
        body = `We boosted "${title}" to the top of the feed for nearby workers.`;
      } else if (next === 2) {
        let belowMarket = false;
        let medianPaise: number | null = null;
        let yourPaise = 0;
        try {
          const bench = await getWageBenchmark(job.employerId, jobId);
          belowMarket = bench.belowMarket;
          medianPaise = bench.medianPaise;
          yourPaise = bench.yourPaise;
        } catch {
          /* benchmark optional */
        }
        body =
          belowMarket && medianPaise
            ? `"${title}" is still unfilled. Nearby employers pay around ₹${Math.round(
                medianPaise / 100,
              ).toLocaleString('en-IN')} vs your ₹${Math.round(
                yourPaise / 100,
              ).toLocaleString('en-IN')} — raising the wage could help.`
            : `"${title}" is still quiet. Try widening the area or adding more detail to draw applicants.`;
      } else {
        body = `"${title}" has been open a while with few applicants. Consider reposting or editing it.`;
      }

      void notifications.record({
        recipientId: job.employerId,
        kind: 'job_escalated',
        title: next === 1 ? 'Your job got a boost' : 'Your job needs attention',
        body,
        deeplink: { screen: 'JobApplicants', params: { jobId, jobTitle: title } },
      });

      summary.escalated += 1;
    } catch (err) {
      summary.errors += 1;
      logger.warn({ err, jobId: job.id }, 'escalation: job failed');
    }
  }

  logger.info(summary, 'escalation sweep complete');
  return summary;
}
