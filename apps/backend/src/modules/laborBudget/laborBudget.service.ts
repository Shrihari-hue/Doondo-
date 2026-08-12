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

import { and, eq, gte, lte, sum } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { employerBudgets, paymentIntents, budgetPeriodEnum, type BudgetPeriod } from '@/db/schema';

export const BUDGET_PERIODS = budgetPeriodEnum.enumValues;
export type { BudgetPeriod };

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
  const db = getDb();
  const now = new Date();
  const [budgetRow] = await db
    .select()
    .from(employerBudgets)
    .where(eq(employerBudgets.employerId, employerId))
    .limit(1);

  // Spend window follows the budget's period; default to month when no
  // budget is set so the employer still sees a meaningful spend figure.
  const period: BudgetPeriod = budgetRow?.period ?? 'month';
  const start = windowStart(period, now);

  const [spentRow] = await db
    .select({ total: sum(paymentIntents.amountPaise) })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.employerId, employerId),
        eq(paymentIntents.status, 'paid'),
        gte(paymentIntents.paidAt, start),
        lte(paymentIntents.paidAt, now),
      ),
    );
  const spentPaise = Number(spentRow?.total ?? 0);

  const budget = budgetRow
    ? {
        period: budgetRow.period,
        amountPaise: budgetRow.amountPaise,
        currency: budgetRow.currency,
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
  await getDb()
    .insert(employerBudgets)
    .values({ employerId, period, amountPaise })
    .onConflictDoUpdate({
      target: employerBudgets.employerId,
      set: { period, amountPaise, updatedAt: new Date() },
    });
  return getLaborBudgetSummary(employerId);
}
