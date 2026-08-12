/** UUID-native anti-ghost scheduler. Activation remains owned by scheduler/index. */
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs, users } from '@/db/schema';
import { logger } from '@/lib/logger';
import { sendGhostedPush } from '@/lib/push';
import { env } from '@/config/env';
import { employersInQuietHours } from '@/modules/employerResponse/employerResponse.service';
export interface GhostSweepSummary {
  considered: number;
  flagged: number;
  errors: number;
}
const BATCH_LIMIT = 500;
export async function runGhostSweep(): Promise<GhostSweepSummary> {
  const slaHours = env.GHOST_SLA_HOURS,
    cutoff = new Date(Date.now() - slaHours * 3_600_000),
    now = new Date(),
    db = getDb();
  const all = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.status, 'pending'),
        lte(applications.appliedAt, cutoff),
        isNull(applications.flaggedAsGhostedAt),
      ),
    )
    .limit(BATCH_LIMIT);
  const quiet = await employersInQuietHours([...new Set(all.map((a) => a.employerId))], now);
  const candidates = all.filter((a) => !quiet.has(a.employerId));
  const summary: GhostSweepSummary = { considered: candidates.length, flagged: 0, errors: 0 };
  if (!candidates.length) return summary;
  const ids = candidates.map((a) => a.id);
  const flagged = await db
    .update(applications)
    .set({ flaggedAsGhostedAt: now })
    .where(and(inArray(applications.id, ids), isNull(applications.flaggedAsGhostedAt)))
    .returning({ id: applications.id });
  summary.flagged = flagged.length;
  const [jobRows, employerRows] = await Promise.all([
    db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(inArray(jobs.id, [...new Set(candidates.map((a) => a.jobId))])),
    db
      .select({ id: users.id, name: users.name, companyName: users.companyName })
      .from(users)
      .where(inArray(users.id, [...new Set(candidates.map((a) => a.employerId))])),
  ]);
  const jobMap = new Map(jobRows.map((j) => [j.id, j.title]));
  const employerMap = new Map(employerRows.map((u) => [u.id, u.companyName ?? u.name]));
  for (const app of candidates)
    void sendGhostedPush({
      recipientId: app.seekerId,
      jobTitle: jobMap.get(app.jobId),
      employerName: employerMap.get(app.employerId),
      hours: slaHours,
      applicationId: app.id,
    }).catch((err) => {
      summary.errors++;
      logger.warn({ err, applicationId: app.id }, 'ghost sweep: push failed');
    });
  logger.info(summary, 'ghost sweep complete');
  return summary;
}
