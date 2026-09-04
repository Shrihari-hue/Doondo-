/**
 * Wallet API — seeker's earnings ledger.
 */

import { apiRequest } from './client';

export type WalletKind = 'hire_payment' | 'adjustment' | 'cash_log';
export type WalletStatus = 'pending' | 'settled' | 'reversed';

export interface PublicWalletTransaction {
  id: string;
  /** Amount in minor units (paise). Positive = credit, negative = debit. */
  amount: number;
  currency: string;
  kind: WalletKind;
  status: WalletStatus;
  description: string;
  jobId: string | null;
  applicationId: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface EarningsSummary {
  totalEarnedPaise: number;
  pendingPaise: number;
  hireCount: number;
  /** Number of self-reported cash earnings. */
  cashLogCount: number;
  /** Sum of self-reported cash earnings, in paise. */
  cashLogPaise: number;
  /** Number of settled Quick Work payments. employer-plan.md §17. */
  quickWorkCount: number;
  /** Sum of settled Quick Work payments, in paise. */
  quickWorkPaise: number;
  currency: 'INR';
}

export interface LogCashEarningPayload {
  /** Paise. */
  amount: number;
  description: string;
  /** Optional ISO date of when the work was done. */
  workedOn?: string;
}

export const walletApi = {
  myEarnings: (limit = 50) =>
    apiRequest<{ transactions: PublicWalletTransaction[]; summary: EarningsSummary }>(
      `/me/earnings?limit=${limit}`,
    ),

  logCash: (body: LogCashEarningPayload) =>
    apiRequest<{ transaction: PublicWalletTransaction }>(
      `/me/earnings/cash`,
      { method: 'POST', body },
    ),

  deleteCash: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/me/earnings/cash/${id}`, {
      method: 'DELETE',
    }),
};
