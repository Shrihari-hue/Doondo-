/**
 * Payroll math shared by Worker Salary + Run Payroll. Pure functions —
 * every number comes from the job's pay rate and the worker's real
 * attendance / logged hours for the month. No invented bonuses.
 */

import type { WorkerDetail } from '@/api/workforce.api';

export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'fixed';

export interface MonthEarnings {
  ratePaise: number | null;
  period: PayPeriod | null;
  /** Units the rate was multiplied by (hours, days, weeks) — 1 for month/fixed. */
  units: number;
  unitLabel: string;
  earnedPaise: number;
  paidThisMonthPaise: number;
  duePaise: number;
  /** Human explanation of how `earnedPaise` was derived. */
  basis: string;
}

export function formatINR(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Estimate what a worker has earned in the month described by `detail`
 * (fetched with `{ month }`), and what's still due after payments made
 * in that month.
 */
export function computeMonthEarnings(
  pay: { amount: number; period: string } | null | undefined,
  detail: WorkerDetail | undefined,
  month: string,
): MonthEarnings {
  const ratePaise = pay?.amount ?? null;
  const period = (pay?.period as PayPeriod | undefined) ?? null;
  const attended = detail ? detail.attendance.present + detail.attendance.late : 0;
  const working = detail?.attendance.workingDays ?? 0;
  const minutes = (detail?.shifts ?? []).reduce((s, x) => s + (x.minutes ?? 0), 0);
  const hours = Math.round((minutes / 60) * 10) / 10;

  let units = 0;
  let unitLabel = '';
  let earnedPaise = 0;
  let basis = 'No pay rate set on this job.';
  if (ratePaise != null && period) {
    switch (period) {
      case 'hour':
        units = hours;
        unitLabel = `${hours}h logged`;
        earnedPaise = Math.round(ratePaise * hours);
        basis = `${formatINR(ratePaise)}/hour × ${hours} hours checked in`;
        break;
      case 'day':
        units = attended;
        unitLabel = `${attended} days`;
        earnedPaise = ratePaise * attended;
        basis = `${formatINR(ratePaise)}/day × ${attended} days present`;
        break;
      case 'week': {
        const weeks = Math.round((attended / 6) * 10) / 10;
        units = weeks;
        unitLabel = `${weeks} weeks`;
        earnedPaise = Math.round(ratePaise * weeks);
        basis = `${formatINR(ratePaise)}/week × ${weeks} weeks (6 working days each)`;
        break;
      }
      case 'month':
        units = 1;
        unitLabel = working > 0 ? `${attended}/${working} days` : 'month';
        // Pro-rate only for unpaid absences; leave days are excluded from `working`.
        earnedPaise = working > 0 ? Math.round((ratePaise * attended) / working) : 0;
        basis =
          working > 0
            ? `${formatINR(ratePaise)}/month × ${attended} of ${working} working days so far`
            : 'No working days yet this month';
        break;
      case 'fixed':
        units = 1;
        unitLabel = 'fixed';
        earnedPaise = ratePaise;
        basis = 'Fixed amount for the job';
        break;
    }
  }

  const paidThisMonthPaise = (detail?.payments ?? [])
    .filter((p) => p.status === 'paid' && p.paidAt && monthKey(p.paidAt) === month)
    .reduce((s, p) => s + p.amountPaise, 0);

  return {
    ratePaise,
    period,
    units,
    unitLabel,
    earnedPaise,
    paidThisMonthPaise,
    duePaise: Math.max(0, earnedPaise - paidThisMonthPaise),
    basis,
  };
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Paid totals for the last `n` calendar months (oldest first). */
export function paidByMonth(detail: WorkerDetail | undefined, n: number): Array<{ month: string; paise: number }> {
  const now = new Date();
  const out: Array<{ month: string; paise: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const paise = (detail?.payments ?? [])
      .filter((p) => p.status === 'paid' && p.paidAt && monthKey(p.paidAt) === key)
      .reduce((s, p) => s + p.amountPaise, 0);
    out.push({ month: key, paise });
  }
  return out;
}
