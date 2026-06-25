/**
 * employerWallet.api — Doondo employer wallet top-up flow.
 *
 * Flow:
 *   1. POST /employer/wallet/topup/initiate   → get UPI payment URI + orderId
 *   2. App opens upi:// deep link             → user pays in their UPI app
 *   3. GET  /employer/wallet/topup/:orderId   → poll until paid/failed
 *   4. POST /employer/wallet/topup/:orderId/confirm → mark confirmed
 */
import { apiRequest } from './client';

export type TopUpStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';

export interface WalletTopUpOrder {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Ready-to-use UPI intent URI — open with Linking.openURL() */
  upiUri: string;
  /** Merchant UPI VPA for manual entry fallback */
  merchantVpa: string;
  /** Human-readable transaction reference */
  txnRef: string;
  status: TopUpStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface EmployerWalletBalance {
  balancePaise: number;
  currency: 'INR';
  lastTopUpAt: string | null;
}

export const employerWalletApi = {
  /** Fetch current wallet balance */
  balance: () =>
    apiRequest<{ wallet: EmployerWalletBalance }>('/employer/wallet'),

  /** Initiate a top-up — returns a UPI URI to open */
  initiateTopUp: (amountPaise: number, note?: string) =>
    apiRequest<{ order: WalletTopUpOrder }>('/employer/wallet/topup/initiate', {
      method: 'POST',
      body: { amountPaise, note },
    }),

  /** Poll payment status */
  topUpStatus: (orderId: string) =>
    apiRequest<{ order: WalletTopUpOrder }>(`/employer/wallet/topup/${orderId}`),

  /** Confirm after UPI callback / user manual confirmation */
  confirmTopUp: (orderId: string) =>
    apiRequest<{ order: WalletTopUpOrder; newBalancePaise: number }>(
      `/employer/wallet/topup/${orderId}/confirm`,
      { method: 'POST', body: {} },
    ),

  /** Transaction history */
  transactions: (limit = 20) =>
    apiRequest<{
      transactions: Array<{
        id: string;
        amountPaise: number;
        type: 'topup' | 'debit';
        description: string;
        status: TopUpStatus;
        createdAt: string;
      }>;
    }>(`/employer/wallet/transactions?limit=${limit}`),
};
