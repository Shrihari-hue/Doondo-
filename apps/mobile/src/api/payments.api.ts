/**
 * payments.api — UPI intent creation + history.
 */
import { apiRequest } from './client';

export type PaymentStatus =
  | 'pending'
  | 'in_progress'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface PaymentIntent {
  id: string;
  employerId: string;
  seekerId: string;
  applicationId: string | null;
  amountPaise: number;
  currency: string;
  seekerVpa: string;
  upiUri: string;
  ref: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

/** A GST-friendly payment receipt for a settled payment. */
export interface PaymentReceipt {
  receiptNo: string;
  issuedAt: string;
  payer: { name: string; gstin: string | null; location: string | null };
  payee: { name: string; upiVpa: string };
  amountPaise: number;
  currency: string;
  method: string;
  reference: string;
  disclaimer: string;
}

export const paymentsApi = {
  create: (input: {
    seekerId: string;
    applicationId?: string;
    amountPaise: number;
    note?: string;
  }) =>
    apiRequest<{ intent: PaymentIntent }>('/payments/intent', {
      method: 'POST',
      body: input,
    }),
  markPaid: (id: string) =>
    apiRequest<{ intent: PaymentIntent }>(`/payments/${id}/mark-paid`, {
      method: 'POST',
      body: {},
    }),
  cancel: (id: string) =>
    apiRequest<{ intent: PaymentIntent }>(`/payments/${id}/cancel`, {
      method: 'POST',
      body: {},
    }),
  mine: () => apiRequest<{ intents: PaymentIntent[] }>('/payments/mine'),
  /** Fetch the GST-friendly receipt for a paid payment. */
  receipt: (id: string) =>
    apiRequest<{ receipt: PaymentReceipt }>(`/payments/${id}/receipt`),
};
