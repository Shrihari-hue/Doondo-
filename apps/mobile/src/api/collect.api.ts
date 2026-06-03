/**
 * Doondo Collect — worker bank account, collection QRs, balance + withdraw.
 */

import { apiRequest } from './client';
import type { QrMatrix } from '@/components';

export interface BankAccount {
  holderName: string;
  accountNumberMasked: string;
  ifsc: string;
  verified: boolean;
  addedAt: string;
}

export type CollectQrKind = 'open' | 'fixed';

export interface CollectQr {
  ref: string;
  kind: CollectQrKind;
  amountPaise: number | null;
  applicationId: string | null;
  payload: string;
  qr: QrMatrix;
  createdAt: string;
}

export const collectApi = {
  getBank: () => apiRequest<{ bank: BankAccount | null }>('/collect/bank').then((r) => r.bank),

  setBank: (input: { holderName: string; accountNumber: string; ifsc: string }) =>
    apiRequest<{ bank: BankAccount }>('/collect/bank', { method: 'PUT', body: input }).then(
      (r) => r.bank,
    ),

  removeBank: () => apiRequest<{ removed: boolean }>('/collect/bank', { method: 'DELETE' }),

  listQrs: () => apiRequest<{ qrs: CollectQr[] }>('/collect/qr').then((r) => r.qrs),

  createQr: (input: { kind: CollectQrKind; amountPaise?: number | null; applicationId?: string | null }) =>
    apiRequest<{ qr: CollectQr }>('/collect/qr', { method: 'POST', body: input }).then((r) => r.qr),

  /** Dev stand-in for the PSP webhook — credits the wallet net of commission. */
  simulatePayment: (ref: string, amountPaise: number, payerName?: string) =>
    apiRequest<{ grossPaise: number; netPaise: number }>(`/collect/qr/${ref}/simulate-payment`, {
      method: 'POST',
      body: { amountPaise, payerName },
    }),

  balance: () => apiRequest<{ balancePaise: number }>('/collect/balance').then((r) => r.balancePaise),

  withdraw: (amountPaise: number) =>
    apiRequest<{ transaction: { id: string; amount: number; status: string } }>('/collect/withdraw', {
      method: 'POST',
      body: { amountPaise },
    }),
};
