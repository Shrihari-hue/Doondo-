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

import { Types } from 'mongoose';
import { ShiftCheckInModel } from '@/modules/applications/shiftCheckIn.model';
import { PaymentIntentModel } from '@/modules/payments/payment.model';
import { UserModel } from '@/modules/users/user.model';

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
  const { start, end, label } = monthBounds(month);

  const events = await ShiftCheckInModel.find({
    seekerId: new Types.ObjectId(seekerId),
    timestamp: { $gte: start, $lt: end },
  })
    .select('employerId kind timestamp')
    .sort({ employerId: 1, timestamp: 1 })
    .lean();

  // Pair per employer; an open check-in with no check-out is ignored.
  const byEmp = new Map<string, Tally>();
  const openByEmp = new Map<string, Date>();
  const allDays = new Set<string>();
  let totalMinutes = 0;
  let totalShifts = 0;

  for (const e of events) {
    const emp = (e.employerId as unknown as Types.ObjectId).toString();
    const ts = new Date(e.timestamp as Date);
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
  const employers = await UserModel.find({ _id: { $in: empIds } })
    .select('name companyName')
    .lean();
  const nameMap = new Map(
    employers.map((u) => [
      (u._id as Types.ObjectId).toString(),
      (u as { companyName?: string | null; name?: string }).companyName ??
        (u as { name?: string }).name ??
        'Employer',
    ]),
  );

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
  const { start, end, label } = monthBounds(month);
  const seekerObj = new Types.ObjectId(seekerId);
  const employerObj = new Types.ObjectId(employerId);

  const events = await ShiftCheckInModel.find({
    seekerId: seekerObj,
    employerId: employerObj,
    timestamp: { $gte: start, $lt: end },
  })
    .select('kind timestamp')
    .sort({ timestamp: 1 })
    .lean();

  const tally = emptyTally();
  let openAt: Date | null = null;
  for (const e of events) {
    const ts = new Date(e.timestamp as Date);
    if (e.kind === 'check_in') openAt = ts;
    else if (e.kind === 'check_out' && openAt) {
      const mins = Math.min(MAX_SHIFT_HOURS * 60, Math.max(0, (ts.getTime() - openAt.getTime()) / 60_000));
      tally.minutes += mins;
      tally.shifts += 1;
      tally.days.add(openAt.toISOString().slice(0, 10));
      openAt = null;
    }
  }

  const payAgg = await PaymentIntentModel.aggregate<{ _id: null; paidPaise: number }>([
    {
      $match: {
        seekerId: seekerObj,
        employerId: employerObj,
        status: 'paid',
        paidAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: null, paidPaise: { $sum: '$amountPaise' } } },
  ]);

  const [worker, employer] = await Promise.all([
    UserModel.findById(seekerObj).select('name').lean(),
    UserModel.findById(employerObj).select('name companyName').lean(),
  ]);

  return {
    month: label,
    workerName: (worker as { name?: string } | null)?.name ?? 'Worker',
    employerName:
      (employer as { companyName?: string | null } | null)?.companyName ??
      (employer as { name?: string } | null)?.name ??
      'Employer',
    shifts: tally.shifts,
    minutes: Math.round(tally.minutes),
    days: tally.days.size,
    paidPaise: payAgg[0]?.paidPaise ?? 0,
  };
}
