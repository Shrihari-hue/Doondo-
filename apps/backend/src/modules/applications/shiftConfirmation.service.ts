/** UUID-native night-before shift confirmation scheduler. */
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs } from '@/db/schema';
import { logger } from '@/lib/logger';
import { sendShiftConfirmationPush } from '@/lib/push';
import { env } from '@/config/env';
export interface ShiftConfirmationSweepSummary {
  considered: number;
  promptsSent: number;
  errors: number;
}
const BATCH_LIMIT = 200;
function shiftWhenLabel(shiftAt: Date, now: Date): string {
  const time = shiftAt.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const days = Math.round(
    (new Date(shiftAt.getFullYear(), shiftAt.getMonth(), shiftAt.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  return `${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} ${time}`;
}
export async function runShiftConfirmationSweep(): Promise<ShiftConfirmationSweepSummary> {
  const now = new Date(),
    end = new Date(now.getTime() + env.SHIFT_CONFIRM_LEAD_HOURS * 3_600_000),
    db = getDb();
  const candidates = (
    await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.status, 'hired'),
          gte(applications.nextShiftAt, now),
          lte(applications.nextShiftAt, end),
        ),
      )
      .limit(BATCH_LIMIT)
  ).filter((a) => !a.shiftConfirmationPromptedAt);
  const summary = { considered: candidates.length, promptsSent: 0, errors: 0 };
  if (!candidates.length) return summary;
  const marked = await db
    .update(applications)
    .set({ shiftConfirmationPromptedAt: now, shiftConfirmationStatus: 'awaiting' })
    .where(
      and(
        inArray(
          applications.id,
          candidates.map((a) => a.id),
        ),
        isNull(applications.shiftConfirmationPromptedAt),
      ),
    )
    .returning({ id: applications.id });
  const markedIds = new Set(marked.map((r) => r.id));
  const titleRows = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(inArray(jobs.id, [...new Set(candidates.map((a) => a.jobId))]));
  const titles = new Map(titleRows.map((j) => [j.id, j.title]));
  for (const app of candidates)
    if (markedIds.has(app.id) && app.nextShiftAt) {
      void sendShiftConfirmationPush({
        recipientId: app.seekerId,
        jobTitle: titles.get(app.jobId),
        whenLabel: shiftWhenLabel(app.nextShiftAt, now),
        applicationId: app.id,
      }).catch((err) => {
        summary.errors++;
        logger.warn({ err, applicationId: app.id }, 'shift confirmation: worker push failed');
      });
      summary.promptsSent++;
    }
  logger.info(summary, 'shift confirmation sweep complete');
  return summary;
}
