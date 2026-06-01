/**
 * Weekly roster — the employer's standing (recurring) shifts and who is
 * filling each one this week.
 *
 * A recurring job repeats on the weekdays in its `schedule.days`. The
 * roster pairs each such job with the workers currently hired on it, so
 * the employer sees "Dishwasher · Mon/Wed/Fri · Ravi, Sita" at a glance
 * instead of hunting through individual posts. Reuses the jobs +
 * applications data already in place — no new tracking.
 */

import { Types } from 'mongoose';
import { JobModel } from '@/modules/jobs/job.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { UserModel } from '@/modules/users/user.model';

export interface RosterWorker {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface RosterEntry {
  jobId: string;
  title: string;
  /** Weekdays the shift repeats on (0 = Sun … 6 = Sat). */
  days: number[];
  startTime: string | null;
  /** Workers currently hired on this recurring job. */
  workers: RosterWorker[];
}

export async function getWeeklyRoster(employerId: string): Promise<RosterEntry[]> {
  const jobs = await JobModel.find({
    employerId: new Types.ObjectId(employerId),
    status: 'active',
    recurring: true,
  })
    .select('title schedule')
    .lean();
  if (jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j._id as Types.ObjectId);

  // Hired applications across all these jobs, in one query.
  const hired = await ApplicationModel.find({
    jobId: { $in: jobIds },
    status: 'hired',
  })
    .select('jobId seekerId')
    .lean();

  // Hydrate the worker summaries once.
  const seekerIds = [...new Set(hired.map((h) => (h.seekerId as unknown as Types.ObjectId).toString()))];
  const users = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl')
    .lean();
  const userMap = new Map(
    users.map((u) => [
      (u._id as Types.ObjectId).toString(),
      {
        id: (u._id as Types.ObjectId).toString(),
        name: (u as { name?: string }).name ?? 'Worker',
        photoUrl: (u as { photoUrl?: string | null }).photoUrl ?? null,
      },
    ]),
  );

  // Group hired workers by job.
  const workersByJob = new Map<string, RosterWorker[]>();
  for (const h of hired) {
    const jid = (h.jobId as unknown as Types.ObjectId).toString();
    const w = userMap.get((h.seekerId as unknown as Types.ObjectId).toString());
    if (!w) continue;
    const list = workersByJob.get(jid) ?? [];
    list.push(w);
    workersByJob.set(jid, list);
  }

  return jobs.map((j) => {
    const schedule = (j as { schedule?: { days?: number[]; startTime?: string | null } | null })
      .schedule;
    return {
      jobId: (j._id as Types.ObjectId).toString(),
      title: (j as { title?: string }).title ?? 'Shift',
      days: schedule?.days ?? [],
      startTime: schedule?.startTime ?? null,
      workers: workersByJob.get((j._id as Types.ObjectId).toString()) ?? [],
    };
  });
}
