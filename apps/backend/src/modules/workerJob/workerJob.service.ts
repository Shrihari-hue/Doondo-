/**
 * Worker-job hub — the seeker side of attendance + payslip.
 *
 * Mirror of the employer's timesheet/statement, but scoped to one worker:
 *   - getWorkerAttendance: this worker's worked days/hours for a month,
 *     broken down per employer, derived from their own shift check-ins.
 *   - getWorkerPayslip: a single employer's month for this worker — shifts,
 *     hours, and the settled (paid) UPI total — the data the mobile turns
 *     into a downloadable salary slip PDF.
 *
 * No new tracking: both read over ShiftCheckIn (already recorded on every
 * check-in/out) and paid PaymentIntents (already settled by the employer).
 */

import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { paymentIntents, shiftCheckIns, users } from '@/db/schema';

const MAX_SHIFT_HOURS = 16;

function monthBounds(month?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
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

/** Pair check_in→check_out per key, returning minutes / shifts / days. */
interface Tally {
  minutes: number;
  shifts: number;
  days: Set<string>;
}
function emptyTally(): Tally {
  return { minutes: 0, shifts: 0, days: new Set() };
}

export interface AttendanceEmployer {
  employerId: string;
  employerName: string;
  minutes: number;
  shifts: number;
  days: number;
}
export interface WorkerAttendance {
  month: string;
  totalMinutes: number;
  totalShifts: number;
  totalDays: number;
  byEmployer: AttendanceEmployer[];
}

export async function getWorkerAttendance(
  seekerId: string,
  month?: string,
): Promise<WorkerAttendance> {
  const db = getDb();
  const { start, end, label } = monthBounds(month);

  const events = await db
    .select({ employerId: shiftCheckIns.employerId, kind: shiftCheckIns.kind, timestamp: shiftCheckIns.timestamp })
    .from(shiftCheckIns)
    .where(and(eq(shiftCheckIns.seekerId, seekerId), gte(shiftCheckIns.timestamp, start), lt(shiftCheckIns.timestamp, end)))
    .orderBy(asc(shiftCheckIns.employerId), asc(shiftCheckIns.timestamp));

  // Pair per employer; an open check-in with no check-out is ignored.
  const byEmp = new Map<string, Tally>();
  const openByEmp = new Map<string, Date>();
  const allDays = new Set<string>();
  let totalMinutes = 0;
  let totalShifts = 0;

  for (const e of events) {
    const emp = e.employerId;
    const ts = e.timestamp;
    if (e.kind === 'check_in') {
      openByEmp.set(emp, ts);
    } else if (e.kind === 'check_out') {
      const inAt = openByEmp.get(emp);
      if (inAt) {
        const mins = Math.min(MAX_SHIFT_HOURS * 60, Math.max(0, (ts.getTime() - inAt.getTime()) / 60_000));
        if (!byEmp.has(emp)) byEmp.set(emp, emptyTally());
        const tally = byEmp.get(emp)!;
        const day = inAt.toISOString().slice(0, 10);
        tally.minutes += mins;
        tally.shifts += 1;
        tally.days.add(day);
        totalMinutes += mins;
        totalShifts += 1;
        allDays.add(day);
        openByEmp.delete(emp);
      }
    }
  }

  const empIds = [...byEmp.keys()];
  const employers = empIds.length
    ? await db.select({ id: users.id, name: users.name, companyName: users.companyName }).from(users).where(inArray(users.id, empIds))
    : [];
  const nameMap = new Map(employers.map((u) => [u.id, u.companyName ?? u.name ?? 'Employer']));

  const byEmployer: AttendanceEmployer[] = empIds
    .map((id) => {
      const tally = byEmp.get(id)!;
      return {
        employerId: id,
        employerName: nameMap.get(id) ?? 'Employer',
        minutes: Math.round(tally.minutes),
        shifts: tally.shifts,
        days: tally.days.size,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    month: label,
    totalMinutes: Math.round(totalMinutes),
    totalShifts,
    totalDays: allDays.size,
    byEmployer,
  };
}

export interface WorkerPayslip {
  month: string;
  workerName: string;
  employerName: string;
  shifts: number;
  minutes: number;
  days: number;
  paidPaise: number;
}

export async function getWorkerPayslip(
  seekerId: string,
  employerId: string,
  month?: string,
): Promise<WorkerPayslip> {
  const db = getDb();
  const { start, end, label } = monthBounds(month);

  const events = await db
    .select({ kind: shiftCheckIns.kind, timestamp: shiftCheckIns.timestamp })
    .from(shiftCheckIns)
    .where(
      and(
        eq(shiftCheckIns.seekerId, seekerId),
        eq(shiftCheckIns.employerId, employerId),
        gte(shiftCheckIns.timestamp, start),
        lt(shiftCheckIns.timestamp, end),
      ),
    )
    .orderBy(asc(shiftCheckIns.timestamp));

  const tally = emptyTally();
  let openAt: Date | null = null;
  for (const e of events) {
    const ts = e.timestamp;
    if (e.kind === 'check_in') openAt = ts;
    else if (e.kind === 'check_out' && openAt) {
      const mins = Math.min(MAX_SHIFT_HOURS * 60, Math.max(0, (ts.getTime() - openAt.getTime()) / 60_000));
      tally.minutes += mins;
      tally.shifts += 1;
      tally.days.add(openAt.toISOString().slice(0, 10));
      openAt = null;
    }
  }

  const [[payRow], [worker], [employer]] = await Promise.all([
    db
      .select({ paidPaise: sql<number>`coalesce(sum(${paymentIntents.amountPaise}), 0)::int` })
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.seekerId, seekerId),
          eq(paymentIntents.employerId, employerId),
          eq(paymentIntents.status, 'paid'),
          gte(paymentIntents.paidAt, start),
          lt(paymentIntents.paidAt, end),
        ),
      ),
    db.select({ name: users.name }).from(users).where(eq(users.id, seekerId)).limit(1),
    db.select({ name: users.name, companyName: users.companyName }).from(users).where(eq(users.id, employerId)).limit(1),
  ]);

  return {
    month: label,
    workerName: worker?.name ?? 'Worker',
    employerName: employer?.companyName ?? employer?.name ?? 'Employer',
    shifts: tally.shifts,
    minutes: Math.round(tally.minutes),
    days: tally.days.size,
    paidPaise: payRow?.paidPaise ?? 0,
  };
}
