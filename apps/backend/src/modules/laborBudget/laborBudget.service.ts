/**
 * Labor budget service — reads the employer's budget and computes
 * spend-to-date against it for the current period.
 *
 * "Spend" is real money the employer has marked paid: the sum of `paid`
 * PaymentIntents in the current window. Cash-marked and UPI payments both
 * count, because both are recorded as intents. The window is the current
 * calendar month (1st → now) or the current week (Monday → now), matching
 * the budget's period. Everything is computed live, so the number is
 * always current without a running ledger to maintain.
 */

import { Types } from 'mongoose';
import { PaymentIntentModel } from '@/modules/payments/payment.model';
import {
  EmployerBudgetModel,
  type BudgetPeriod,
} from './laborBudget.model';

export interface LaborBudgetSummary {
  /** The set budget, or null if the employer hasn't set one. */
  budget: { period: BudgetPeriod; amountPaise: number; currency: string } | null;
  /** Money marked paid in the current window. */
  spentPaise: number;
  /** budget − spent, floored at 0. Null when no budget is set. */
  remainingPaise: number | null;
  /** True when spend has met or exceeded the budget. */
  overBudget: boolean;
  /** ISO window the spend was summed over. */
  periodStart: string;
  periodEnd: string;
}

/** Start of the current window for a period, in server local time. */
function windowStart(period: BudgetPeriod, now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'month') {
    d.setDate(1);
    return d;
  }
  // Week: back up to Monday (treat Monday as the first day of the week).
  const dow = d.getDay(); // 0 = Sun … 6 = Sat
  const backToMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - backToMonday);
  return d;
}

export async function getLaborBudgetSummary(
  employerId: string,
): Promise<LaborBudgetSummary> {
  const now = new Date();
  const budgetDoc = await EmployerBudgetModel.findOne({
    employerId: new Types.ObjectId(employerId),
  }).lean();

  // Spend window follows the budget's period; default to month when no
  // budget is set so the employer still sees a meaningful spend figure.
  const period: BudgetPeriod = budgetDoc?.period ?? 'month';
  const start = windowStart(period, now);

  const agg = await PaymentIntentModel.aggregate([
    {
      $match: {
        employerId: new Types.ObjectId(employerId),
        status: 'paid',
        paidAt: { $gte: start, $lte: now },
      },
    },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ]);
  const spentPaise = (agg[0]?.total as number | undefined) ?? 0;

  const budget = budgetDoc
    ? {
        period: budgetDoc.period,
        amountPaise: budgetDoc.amountPaise,
        currency: budgetDoc.currency ?? 'INR',
      }
    : null;

  const remainingPaise = budget ? Math.max(0, budget.amountPaise - spentPaise) : null;
  const overBudget = budget ? spentPaise >= budget.amountPaise : false;

  return {
    budget,
    spentPaise,
    remainingPaise,
    overBudget,
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
  };
}

export async function setLaborBudget(
  employerId: string,
  period: BudgetPeriod,
  amountPaise: number,
): Promise<LaborBudgetSummary> {
  await EmployerBudgetModel.findOneAndUpdate(
    { employerId: new Types.ObjectId(employerId) },
    { $set: { period, amountPaise } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return getLaborBudgetSummary(employerId);
}
