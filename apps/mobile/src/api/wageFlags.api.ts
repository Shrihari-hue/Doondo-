/**
 * Wage Strike Alerts (#46) API — anonymous per-job wage-issue flags +
 * the aggregate signal surfaced on EmployerDetail.
 */
import { apiRequest } from './client';

export type WageFlagReason = 'below_promised_wage' | 'late_payment' | 'unpaid_overtime' | 'wage_theft' | 'other';
export type WagePeriod = 'hour' | 'day' | 'week' | 'month' | 'fixed';

export interface PublicWageFlag {
  id: string;
  jobId: string;
  jobTitle: string;
  reason: WageFlagReason;
  createdAt: string;
}

export interface WageFlagReasonEntry {
  reason: WageFlagReason;
  count: number;
  ratio: number;
}

export type WageFlagSummary =
  | { hasSignal: false }
  | { hasSignal: true; totalFlags: number; windowDays: number; reasons: WageFlagReasonEntry[] };

export const wageFlagsApi = {
  create: (input: {
    jobId: string;
    reason: WageFlagReason;
    promisedWageAmount?: number;
    actualWageAmount?: number;
    wagePeriod?: WagePeriod;
    note?: string;
  }) => apiRequest<{ flag: PublicWageFlag }>('/wage-flags', { method: 'POST', body: input }),

  mine: () => apiRequest<{ flags: PublicWageFlag[] }>('/wage-flags/mine'),

  summaryForEmployer: (employerId: string) =>
    apiRequest<{ summary: WageFlagSummary }>(`/users/${employerId}/wage-flags-summary`),
};
