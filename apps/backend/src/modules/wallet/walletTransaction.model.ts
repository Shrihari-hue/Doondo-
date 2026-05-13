/**
 * WalletTransaction — a single entry on a user's earnings ledger.
 *
 * v1 supports two kinds:
 *   - `hire_payment`  Credit recorded when a seeker is hired on a job.
 *                     The amount mirrors Job.pay.amount (in paise) so the
 *                     ledger always agrees with the posted pay.
 *   - `adjustment`    Manual adjustment (admin / future support tools).
 *
 * Future kinds: `payout` (money out to the seeker's bank), `bonus`,
 * `dispute_refund`. The schema is open to extension by adding to the
 * `kind` enum.
 *
 * Status tracks settlement lifecycle:
 *   - `pending`   recorded but not yet settled
 *   - `settled`   money is in the seeker's hands (or wallet balance)
 *   - `reversed`  cancelled / refunded
 *
 * Why a separate collection (vs a counter on User): we want an auditable
 * ledger so a seeker can see "where did this number come from", and so
 * disputes can resolve to specific transactions.
 */

import { Schema, model, type Model, type HydratedDocument, type Types } from 'mongoose';

export const WALLET_KINDS = ['hire_payment', 'adjustment'] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

export const WALLET_STATUSES = ['pending', 'settled', 'reversed'] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

export interface WalletTransaction {
  userId: Schema.Types.ObjectId;
  /** Positive = credit (incoming). Negative = debit (payout / reversal). */
  amount: number;
  /** ISO 4217 — for now always 'INR'. */
  currency: string;
  kind: WalletKind;
  status: WalletStatus;
  description: string;
  /** Optional links for "what is this row about?" navigation. */
  jobId?: Schema.Types.ObjectId | null;
  applicationId?: Schema.Types.ObjectId | null;
  /** Set when transitioning to settled. */
  settledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  createdAt: string;
}

interface WalletMethods {
  toPublicJSON(): PublicWalletTransaction;
}

export type WalletTransactionDocument = HydratedDocument<WalletTransaction, WalletMethods>;
type WalletTransactionModelType = Model<WalletTransaction, Record<string, never>, WalletMethods>;

const walletSchema = new Schema<WalletTransaction, WalletTransactionModelType, WalletMethods>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR', maxlength: 3 },
    kind: { type: String, enum: WALLET_KINDS, required: true, index: true },
    status: { type: String, enum: WALLET_STATUSES, default: 'pending', index: true },
    description: { type: String, required: true, trim: true, maxlength: 240 },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// "My ledger, newest first" — primary read.
walletSchema.index({ userId: 1, createdAt: -1 });
// Prevent double-credit: at most one hire_payment per (user, application).
walletSchema.index(
  { userId: 1, applicationId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: 'hire_payment' } },
);

walletSchema.method('toPublicJSON', function (
  this: WalletTransactionDocument,
): PublicWalletTransaction {
  return {
    id: (this._id as unknown as Types.ObjectId).toString(),
    amount: this.amount,
    currency: this.currency ?? 'INR',
    kind: this.kind,
    status: this.status,
    description: this.description,
    jobId: this.jobId ? this.jobId.toString() : null,
    applicationId: this.applicationId ? this.applicationId.toString() : null,
    settledAt: this.settledAt ? this.settledAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const WalletTransactionModel = model<WalletTransaction, WalletTransactionModelType>(
  'WalletTransaction',
  walletSchema,
);
