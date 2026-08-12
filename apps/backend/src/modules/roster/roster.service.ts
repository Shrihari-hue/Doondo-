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

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, jobs, users } from '@/db/schema';

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
  const db = getDb();
  const recurringJobs = await db
    .select({ id: jobs.id, title: jobs.title, schedule: jobs.schedule })
    .from(jobs)
    .where(and(eq(jobs.employerId, employerId), eq(jobs.status, 'active'), eq(jobs.recurring, true)));
  if (recurringJobs.length === 0) return [];

  const jobIds = recurringJobs.map((j) => j.id);

  // Hired applications across all these jobs, in one query.
  const hired = await db
    .select({ jobId: applications.jobId, seekerId: applications.seekerId })
    .from(applications)
    .where(and(inArray(applications.jobId, jobIds), eq(applications.status, 'hired')));

  // Hydrate the worker summaries once.
  const seekerIds = [...new Set(hired.map((h) => h.seekerId))];
  const seekers = seekerIds.length
    ? await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, seekerIds))
    : [];
  const userMap = new Map(
    seekers.map((u) => [u.id, { id: u.id, name: u.name ?? 'Worker', photoUrl: u.photoUrl ?? null }]),
  );

  // Group hired workers by job.
  const workersByJob = new Map<string, RosterWorker[]>();
  for (const h of hired) {
    const w = userMap.get(h.seekerId);
    if (!w) continue;
    const list = workersByJob.get(h.jobId) ?? [];
    list.push(w);
    workersByJob.set(h.jobId, list);
  }

  return recurringJobs.map((j) => ({
    jobId: j.id,
    title: j.title ?? 'Shift',
    days: j.schedule?.days ?? [],
    startTime: j.schedule?.startTime ?? null,
    workers: workersByJob.get(j.id) ?? [],
  }));
}
