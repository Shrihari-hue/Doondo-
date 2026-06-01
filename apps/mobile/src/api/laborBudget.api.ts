/**
 * Labor budget tracker — the employer's wage budget + live spend-to-date.
 * Turns Doondo into a cost tool: set a weekly/monthly ceiling, see how
 * much has been paid out against it this period. Guidance, never a gate.
 */

import { apiRequest } from './client';

export type BudgetPeriod = 'week' | 'month';

export interface LaborBudgetSummary {
  budget: { period: BudgetPeriod; amountPaise: number; currency: string } | null;
  spentPaise: number;
  remainingPaise: number | null;
  overBudget: boolean;
  periodStart: string;
  periodEnd: string;
}

export const laborBudgetApi = {
  get: () => apiRequest<LaborBudgetSummary>('/labor-budget'),

  save: (period: BudgetPeriod, amountPaise: number) =>
    apiRequest<LaborBudgetSummary>('/labor-budget', {
      method: 'PUT',
      body: { period, amountPaise },
    }),
};
