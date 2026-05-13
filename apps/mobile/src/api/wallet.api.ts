/**
 * Wallet API — seeker's earnings ledger.
 */

import { apiRequest } from './client';

export type WalletKind = 'hire_payment' | 'adjustment';
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
  currency: 'INR';
}

export const walletApi = {
  myEarnings: (limit = 50) =>
    apiRequest<{ transactions: PublicWalletTransaction[]; summary: EarningsSummary }>(
      `/me/earnings?limit=${limit}`,
    ),
};
