/**
 * insurance.api — gig-worker accident cover opt-in.
 */
import { apiRequest } from './client';

export type InsuranceStatus = 'pending' | 'active' | 'paused' | 'cancelled';

export interface InsuranceSubscription {
  id: string;
  tier: 'standard';
  monthlyPremiumPaise: number;
  status: InsuranceStatus;
  startedAt: string | null;
  lastPaidAt: string | null;
  createdAt: string;
}

export interface InsuranceTier {
  name: 'standard';
  monthlyPremiumPaise: number;
  deathCoverPaise: number;
  hospitalCashPerDayPaise: number;
  hospitalCashMaxDaysPerYear: number;
}

export const insuranceApi = {
  status: () =>
    apiRequest<{ subscription: InsuranceSubscription | null; tier: InsuranceTier }>(
      '/me/insurance',
    ),
  optIn: () =>
    apiRequest<{ subscription: InsuranceSubscription }>('/me/insurance', {
      method: 'POST',
      body: {},
    }),
  cancel: () =>
    apiRequest<{ ok: true }>('/me/insurance', { method: 'DELETE' }),
};
