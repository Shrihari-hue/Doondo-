/**
 * Monthly consolidated statement — one month-end roll-up per employer.
 *
 * Two facts an employer cares about at month-end, per worker:
 *   1. How much they actually worked — shifts, hours, days. This comes
 *      straight from the timesheet roll-up (paired shift check-ins), so
 *      there's no new tracking, just a reuse of `getTimesheet`.
 *   2. How much they were paid — the sum of settled (`paid`) UPI
 *      PaymentIntents in the month window, grouped by worker.
 *
 * A worker can appear in one list but not the other: someone paid in cash
 * outside Doondo still has hours but no PaymentIntent; someone paid for
 * work that spanned the month boundary has a payment but no in-month
 * check-ins. We union both id sets so the statement is complete, and
 * hydrate names for any payment-only worker the timesheet didn't already
 * name.
 */

import { Types } from 'mongoose';
import { PaymentIntentModel } from '@/modules/payments/payment.model';
import { UserModel } from '@/modules/users/user.model';
import { getTimesheet } from '@/modules/timesheet/timesheet.service';

export interface StatementRow {
  workerId: string;
  name: string;
  shifts: number;
  /** Worked minutes from check-ins (0 if paid-only this month). */
  minutes: number;
  days: number;
  /** Settled UPI total in paise for the month (0 if no in-month payment). */
  paidPaise: number;
}

export interface StatementResult {
  month: string;
  employerName: string;
  rows: StatementRow[];
  totals: {
    workerCount: number;
    totalMinutes: number;
    totalShifts: number;
    totalPaidPaise: number;
  };
}

/** Parse "YYYY-MM" into [start, end) UTC bounds; defaults to current month. */
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

export async function getMonthlyStatement(
  employerId: string,
  month?: string,
): Promise<StatementResult> {
  const { start, end, label } = monthBounds(month);

  // Worked-hours side — reuse the timesheet roll-up verbatim.
  const timesheet = await getTimesheet(employerId, label);

  // Paid side — settled UPI intents grouped by worker for the window.
  const payAgg = await PaymentIntentModel.aggregate<{
    _id: Types.ObjectId;
    paidPaise: number;
  }>([
    {
      $match: {
        employerId: new Types.ObjectId(employerId),
        status: 'paid',
        paidAt: { $gte: start, $lt: end },
      },
    },
    { $group: { _id: '$seekerId', paidPaise: { $sum: '$amountPaise' } } },
  ]);

  // Merge into rows keyed by worker.
  const rows = new Map<string, StatementRow>();
  for (const w of timesheet.workers) {
    rows.set(w.workerId, {
      workerId: w.workerId,
      name: w.name,
      shifts: w.shifts,
      minutes: w.totalMinutes,
      days: w.days,
      paidPaise: 0,
    });
  }
  for (const p of payAgg) {
    const wid = p._id.toString();
    const existing = rows.get(wid);
    if (existing) {
      existing.paidPaise += p.paidPaise;
    } else {
      rows.set(wid, {
        workerId: wid,
        name: 'Worker',
        shifts: 0,
        minutes: 0,
        days: 0,
        paidPaise: p.paidPaise,
      });
    }
  }

  // Hydrate names for payment-only workers the timesheet didn't name.
  const unnamed = [...rows.values()].filter((r) => r.name === 'Worker' && r.shifts === 0);
  if (unnamed.length > 0) {
    const users = await UserModel.find({ _id: { $in: unnamed.map((r) => r.workerId) } })
      .select('name')
      .lean();
    const nameMap = new Map(
      users.map((u) => [(u._id as Types.ObjectId).toString(), (u as { name?: string }).name]),
    );
    for (const r of unnamed) {
      const n = nameMap.get(r.workerId);
      if (n) r.name = n;
    }
  }

  const employer = await UserModel.findById(employerId).select('name').lean();
  const employerName = (employer as { name?: string } | null)?.name ?? 'Employer';

  const sorted = [...rows.values()].sort((a, b) => b.paidPaise - a.paidPaise || b.minutes - a.minutes);

  return {
    month: label,
    employerName,
    rows: sorted,
    totals: {
      workerCount: sorted.length,
      totalMinutes: sorted.reduce((s, r) => s + r.minutes, 0),
      totalShifts: sorted.reduce((s, r) => s + r.shifts, 0),
      totalPaidPaise: sorted.reduce((s, r) => s + r.paidPaise, 0),
    },
  };
}
