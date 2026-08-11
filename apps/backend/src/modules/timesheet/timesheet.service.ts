/**
 * Timesheet — per-worker worked hours for a month, derived from shift
 * check-ins.
 *
 * Shift check-in already records a timestamped check_in / check_out for
 * every worker (selfie + geofence). This rolls those events up: per worker,
 * we pair each check_in with the next check_out and sum the intervals into
 * total hours, shift count, and distinct days worked — exactly what an
 * employer needs at month-end. No new tracking; it's a report over data
 * that's already there.
 *
 * Robustness: a check_in with no matching check_out (worker forgot to
 * check out) is ignored rather than counted as an open-ended shift, and any
 * single interval is capped so a stale pair can't inflate the total.
 */

import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shiftCheckIns, users } from '@/db/schema';

export interface TimesheetWorker {
  workerId: string;
  name: string;
  photoUrl: string | null;
  totalMinutes: number;
  shifts: number;
  days: number;
}

export interface TimesheetResult {
  /** The month covered, "YYYY-MM". */
  month: string;
  workers: TimesheetWorker[];
}

/** Cap on a single paired interval (hours) so a missed check-out can't run away. */
const MAX_SHIFT_HOURS = 16;

/** Parse "YYYY-MM" into [start, end) Date bounds; defaults to current month. */
function monthBounds(month?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based
  const match = (month ?? '').match(/^(\d{4})-(\d{2})$/);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]) - 1;
  }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1));
  const label = `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start, end, label };
}

export async function getTimesheet(
  employerId: string,
  month?: string,
): Promise<TimesheetResult> {
  const db = getDb();
  const { start, end, label } = monthBounds(month);

  const events = await db
    .select({ seekerId: shiftCheckIns.seekerId, kind: shiftCheckIns.kind, timestamp: shiftCheckIns.timestamp })
    .from(shiftCheckIns)
    .where(and(eq(shiftCheckIns.employerId, employerId), gte(shiftCheckIns.timestamp, start), lt(shiftCheckIns.timestamp, end)))
    .orderBy(asc(shiftCheckIns.seekerId), asc(shiftCheckIns.timestamp));
  if (events.length === 0) return { month: label, workers: [] };

  // Walk per-seeker, pairing check_in → check_out.
  type Acc = { minutes: number; shifts: number; days: Set<string> };
  const byWorker = new Map<string, Acc>();
  const openInByWorker = new Map<string, Date>();

  for (const e of events) {
    const wid = e.seekerId;
    if (!byWorker.has(wid)) byWorker.set(wid, { minutes: 0, shifts: 0, days: new Set() });
    const ts = e.timestamp;
    if (e.kind === 'check_in') {
      openInByWorker.set(wid, ts);
    } else if (e.kind === 'check_out') {
      const inAt = openInByWorker.get(wid);
      if (inAt) {
        const mins = Math.min(MAX_SHIFT_HOURS * 60, Math.max(0, (ts.getTime() - inAt.getTime()) / 60_000));
        const acc = byWorker.get(wid)!;
        acc.minutes += mins;
        acc.shifts += 1;
        acc.days.add(inAt.toISOString().slice(0, 10));
        openInByWorker.delete(wid);
      }
    }
  }

  const workerIds = [...byWorker.keys()];
  const workerRows = await db.select({ id: users.id, name: users.name, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, workerIds));
  const userMap = new Map(workerRows.map((u) => [u.id, u]));

  const workers: TimesheetWorker[] = workerIds
    .map((wid) => {
      const acc = byWorker.get(wid)!;
      const u = userMap.get(wid);
      return {
        workerId: wid,
        name: u?.name ?? 'Worker',
        photoUrl: u?.photoUrl ?? null,
        totalMinutes: Math.round(acc.minutes),
        shifts: acc.shifts,
        days: acc.days.size,
      };
    })
    .filter((w) => w.shifts > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  return { month: label, workers };
}
