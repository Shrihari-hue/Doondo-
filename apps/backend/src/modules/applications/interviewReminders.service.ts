/** UUID-native interview reminder scheduler. */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs } from '@/db/schema';
import { logger } from '@/lib/logger';
import { sendInterviewReminderPush } from '@/lib/push';
import { env } from '@/config/env';
export interface InterviewReminderSweepSummary {
  considered: number;
  remindersSent: number;
  errors: number;
}
const BATCH_LIMIT = 200;
export async function runInterviewReminderSweep(): Promise<InterviewReminderSweepSummary> {
  const now = new Date(),
    end = new Date(now.getTime() + env.INTERVIEW_REMINDER_LEAD_MINUTES * 60_000),
    db = getDb();
  const candidates = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.interviewStatus, 'scheduled'),
        gte(applications.interviewAt, now),
        lte(applications.interviewAt, end),
      ),
    )
    .limit(BATCH_LIMIT);
  const eligible = candidates.filter((a) => !a.interviewDetails?.reminderSentAt);
  const summary = { considered: eligible.length, remindersSent: 0, errors: 0 };
  if (!eligible.length) return summary;
  const markedAt = new Date().toISOString();
  const changed = await Promise.all(
    eligible.map(async (a) => {
      const details = a.interviewDetails ?? {};
      const [row] = await db
        .update(applications)
        .set({ interviewDetails: { ...details, reminderSentAt: markedAt } })
        .where(
          and(
            eq(applications.id, a.id),
            eq(applications.interviewStatus, 'scheduled'),
            sql`(${applications.interviewDetails}->>'reminderSentAt') IS NULL`,
          ),
        )
        .returning({ id: applications.id });
      return row?.id;
    }),
  );
  const changedIds = new Set(changed.filter((id): id is string => Boolean(id)));
  const titles = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(inArray(jobs.id, [...new Set(eligible.map((a) => a.jobId))]));
  const titleMap = new Map(titles.map((j) => [j.id, j.title]));
  for (const app of eligible) {
    if (!changedIds.has(app.id) || !app.interviewAt) continue;
    const details = app.interviewDetails ?? {},
      minutesUntil = Math.max(1, Math.round((app.interviewAt.getTime() - now.getTime()) / 60_000)),
      locationLine =
        app.interviewMode === 'in_person' && details.location
          ? `at ${details.location}`
          : app.interviewMode === 'video' && details.meetingLink
            ? details.meetingLink
            : null,
      jobTitle = titleMap.get(app.jobId);
    for (const recipientId of [app.seekerId, app.employerId])
      void sendInterviewReminderPush({
        recipientId,
        jobTitle,
        minutesUntil,
        locationLine,
        applicationId: app.id,
      }).catch((err) => {
        summary.errors++;
        logger.warn({ err, applicationId: app.id }, 'interview reminder push failed');
      });
    summary.remindersSent++;
  }
  logger.info(summary, 'interview reminder sweep complete');
  return summary;
}
