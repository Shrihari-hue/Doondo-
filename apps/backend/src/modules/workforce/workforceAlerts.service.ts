/**
 * Employer-facing workforce alerts, run by the scheduler:
 *
 *   runAbsenceSweep     — every 15 min: a hired worker on a job with a fixed
 *                         start time hasn't checked in 30 min after start on
 *                         a working day (and isn't on leave) → one push per
 *                         hire per day.
 *   runPayrollDueSweep  — daily: on the last day of the month (IST), remind
 *                         employers with active hires to run payroll.
 */

import { Schema, model, type Model, Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { ApplicationModel } from '@/modules/applications/application.model';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { sendPayrollDuePush, sendWorkerAbsentPush } from '@/lib/push';
import { WorkerLeaveModel } from './workerLeave.model';
import { istDay } from './workforce.service';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ABSENT_GRACE_MIN = 30;

/** Dedupe: one absence alert per (application, IST day). */
const absenceAlertSchema = new Schema<{ applicationId: Types.ObjectId; date: string; createdAt: Date }>({
  applicationId: { type: Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
});
absenceAlertSchema.index({ applicationId: 1, date: 1 }, { unique: true });
export const AbsenceAlertModel = model('AbsenceAlert', absenceAlertSchema) as Model<{
  applicationId: Types.ObjectId;
  date: string;
  createdAt: Date;
}>;

function istNow(): { day: string; minutes: number; weekday: number } {
  const t = new Date(Date.now() + IST_OFFSET_MS);
  return { day: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), weekday: t.getUTCDay() };
}

export async function runAbsenceSweep(): Promise<{ alerted: number }> {
  const now = istNow();
  const jobs = await JobModel.find({ 'schedule.startTime': { $type: 'string' }, 'schedule.days': now.weekday })
    .select('_id title schedule')
    .lean();
  const dueJobs = jobs.filter((j) => {
    const st = (j as { schedule?: { startTime?: string } }).schedule?.startTime ?? '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(st);
    if (!m) return false;
    const start = Number(m[1]) * 60 + Number(m[2]);
    // Only alert within a 3h window after the grace so a late server start doesn't spam at night.
    return now.minutes >= start + ABSENT_GRACE_MIN && now.minutes <= start + ABSENT_GRACE_MIN + 180;
  });
  if (dueJobs.length === 0) return { alerted: 0 };

  const jobById = new Map(dueJobs.map((j) => [String(j._id), j]));
  const apps = await ApplicationModel.find({
    jobId: { $in: dueJobs.map((j) => j._id) },
    status: 'hired',
    endedAt: null,
  })
    .select('_id jobId seekerId employerId hiredAt')
    .lean();
  const startOfDay = new Date(new Date(`${now.day}T00:00:00Z`).getTime() - IST_OFFSET_MS);
  let alerted = 0;
  for (const a of apps) {
    if (a.hiredAt && istDay(a.hiredAt) === now.day) continue; // hired today — no shift expected yet
    const [checkedIn, onLeave] = await Promise.all([
      ShiftCheckInModel.exists({ applicationId: a._id, kind: 'check_in', timestamp: { $gte: startOfDay } }),
      WorkerLeaveModel.exists({ applicationId: a._id, date: now.day }),
    ]);
    if (checkedIn || onLeave) continue;
    try {
      await AbsenceAlertModel.create({ applicationId: a._id, date: now.day });
    } catch {
      continue; // already alerted today
    }
    const job = jobById.get(a.jobId.toString()) as { title?: string; schedule?: { startTime?: string } } | undefined;
    const worker = await UserModel.findById(a.seekerId).select('name').lean();
    void sendWorkerAbsentPush({
      recipientId: a.employerId.toString(),
      workerName: (worker as { name?: string } | null)?.name ?? 'Your worker',
      jobTitle: job?.title ?? 'your job',
      startTime: job?.schedule?.startTime ?? '',
      applicationId: a._id.toString(),
    });
    alerted++;
  }
  logger.info({ alerted }, 'absence sweep complete');
  return { alerted };
}

export async function runPayrollDueSweep(): Promise<{ reminded: number }> {
  const now = istNow();
  const tomorrow = new Date(`${now.day}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (tomorrow.getUTCDate() !== 1) return { reminded: 0 }; // not the last day of the month
  const groups = await ApplicationModel.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { status: 'hired', endedAt: null } },
    { $group: { _id: '$employerId', n: { $sum: 1 } } },
  ]);
  for (const g of groups) {
    void sendPayrollDuePush({ recipientId: g._id.toString(), workerCount: g.n });
  }
  logger.info({ reminded: groups.length }, 'payroll-due sweep complete');
  return { reminded: groups.length };
}
