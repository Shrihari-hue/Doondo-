/**
 * Interview reminders — pre-interview push to both sides.
 *
 * The Application document already carries an embedded `interview`
 * subdocument with `scheduledFor`. This sweep runs on a tight cadence
 * (every 15 min by default), finds interviews that:
 *   - are still scheduled (not cancelled / not completed),
 *   - start within the next `INTERVIEW_REMINDER_LEAD_MINUTES`,
 *   - haven't already had a reminder sent,
 * and sends one push to the seeker AND one to the employer.
 *
 * Idempotency lives on `interview.reminderSentAt`. A rescheduled
 * interview clears it (see scheduleInterview), so the new time gets
 * its own reminder.
 *
 * Production notes:
 *   - We bound the search window above by the lead time so a 3-day-out
 *     interview doesn't get a reminder today.
 *   - We bound it below by `now` so already-started interviews aren't
 *     spammed retroactively.
 *   - Per-app failures are swallowed so one bad row doesn't kill the
 *     batch.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendInterviewReminderPush } from '@/lib/push';
import { env } from '@/config/env';
import { ApplicationModel } from './application.model';
import { JobModel } from '@/modules/jobs/job.model';

export interface InterviewReminderSweepSummary {
  /** Total upcoming interviews considered in this run. */
  considered: number;
  /** Reminders successfully marked + pushed (seeker side). */
  remindersSent: number;
  /** Per-row push errors. */
  errors: number;
}

const BATCH_LIMIT = 200;

export async function runInterviewReminderSweep(): Promise<InterviewReminderSweepSummary> {
  const leadMinutes = env.INTERVIEW_REMINDER_LEAD_MINUTES;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadMinutes * 60 * 1000);

  const candidates = await ApplicationModel.find({
    'interview.status': 'scheduled',
    'interview.scheduledFor': { $gte: now, $lte: windowEnd },
    'interview.reminderSentAt': null,
  })
    .limit(BATCH_LIMIT)
    .lean();

  const summary: InterviewReminderSweepSummary = {
    considered: candidates.length,
    remindersSent: 0,
    errors: 0,
  };

  if (candidates.length === 0) {
    return summary;
  }

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

  // Mark them first so a partial failure doesn't leave us re-sweeping.
  const ids = candidates.map((c) => c._id);
  const markedAt = new Date();
  await ApplicationModel.updateMany(
    { _id: { $in: ids }, 'interview.reminderSentAt': null },
    { $set: { 'interview.reminderSentAt': markedAt } },
  );

  for (const app of candidates) {
    const interview = app.interview;
    if (!interview) continue;
    const minutesUntil = Math.max(
      1,
      Math.round(
        (new Date(interview.scheduledFor).getTime() - now.getTime()) / 60_000,
      ),
    );
    const jobTitle = jobTitleMap.get(app.jobId.toString()) ?? undefined;

    // Build the location line per mode so the push gives the seeker
    // the next-action info without opening the app.
    const locationLine =
      interview.mode === 'in_person' && interview.location
        ? `at ${interview.location}`
        : interview.mode === 'video' && interview.meetingLink
          ? interview.meetingLink
          : null;

    // Seeker side.
    void sendInterviewReminderPush({
      recipientId: app.seekerId.toString(),
      jobTitle,
      minutesUntil,
      locationLine,
      applicationId: (app._id as Types.ObjectId).toString(),
    }).catch((err) => {
      summary.errors += 1;
      logger.warn(
        { err, applicationId: (app._id as Types.ObjectId).toString() },
        'interview reminder: seeker push failed',
      );
    });

    // Employer side — same helper, different recipient. We deliberately
    // don't skip when seeker push fails: the two pushes are independent.
    void sendInterviewReminderPush({
      recipientId: app.employerId.toString(),
      jobTitle,
      minutesUntil,
      locationLine,
      applicationId: (app._id as Types.ObjectId).toString(),
    }).catch((err) => {
      summary.errors += 1;
      logger.warn(
        { err, applicationId: (app._id as Types.ObjectId).toString() },
        'interview reminder: employer push failed',
      );
    });

    summary.remindersSent += 1;
  }

  logger.info(summary, 'interview reminder sweep complete');
  return summary;
}
