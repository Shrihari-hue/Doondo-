/**
 * WalletTransaction types — a single entry on a user's earnings ledger.
 * The actual row lives in Postgres (see src/db/schema); this file holds
 * the pure TS types/consts still shared with the service.
 *
 * Kinds:
 *   - `hire_payment`  Credit recorded when a seeker is hired on a job.
 *                     The amount mirrors Job.pay.amount (in paise) so the
 *                     ledger always agrees with the posted pay.
 *   - `adjustment`    Manual adjustment (admin / future support tools).
 *   - `qr_collection` / `payout` — Doondo Collect: a QR payment credited
 *     net of commission, and a withdrawal to the worker's bank.
 *
 * Status tracks settlement lifecycle:
 *   - `pending`   recorded but not yet settled
 *   - `settled`   money is in the seeker's hands (or wallet balance)
 *   - `reversed`  cancelled / refunded
 */

export const WALLET_KINDS = [
  'hire_payment',
  'adjustment',
  'cash_log',
  'qr_collection',
  'payout',
] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

export const WALLET_STATUSES = ['pending', 'settled', 'reversed'] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export interface PublicWalletTransaction {
  id: string;
  amount: number;
  currency: string;
  kind: WalletKind;
  status: WalletStatus;
  description: string;
  jobId: string | null;
  applicationId: string | null;
  settledAt: string | null;
  grossPaise: number | null;
  feePaise: number | null;
  createdAt: string;
}
