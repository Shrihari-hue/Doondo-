/**
 * Wallet service — read the seeker's earnings ledger and record credits.
 *
 * v1 records one credit per hire (`hire_payment`). The unique index on
 * (userId, applicationId, kind='hire_payment') makes recording idempotent —
 * calling `creditOnHire` twice for the same application is a no-op.
 *
 * Status is `settled` immediately for hires since the work is committed.
 * Future flows (e.g. payouts to a bank) will use `pending` → `settled`.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import {
  WalletTransactionModel,
  type PublicWalletTransaction,
} from './walletTransaction.model';

export interface EarningsSummary {
  /** Sum of all settled credits, in paise. */
  totalEarnedPaise: number;
  /** Sum of pending credits (e.g. hire recorded but not settled). */
  pendingPaise: number;
  /** Count of hires recorded as transactions. */
  hireCount: number;
  /** Self-reported cash earnings — count + total paise. */
  cashLogCount: number;
  cashLogPaise: number;
  currency: 'INR';
}

interface CreditOnHireInput {
  userId: string;
  applicationId: string;
  jobId: string;
  /** Paise — pass Job.pay.amount as-is. */
  amount: number;
  jobTitle?: string;
}

/**
 * Idempotently records a hire credit. Returns true if a new row was
 * created, false if one already existed (re-hire / duplicate event).
 */
export async function creditOnHire(input: CreditOnHireInput): Promise<boolean> {
  try {
    await WalletTransactionModel.create({
      userId: new Types.ObjectId(input.userId),
      applicationId: new Types.ObjectId(input.applicationId),
      jobId: new Types.ObjectId(input.jobId),
      amount: Math.max(0, input.amount),
      currency: 'INR',
      kind: 'hire_payment',
      status: 'settled',
      description: input.jobTitle
        ? `Hired for "${input.jobTitle}"`
        : 'Hired for a job',
      settledAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      // Duplicate — already credited for this hire. Safe to ignore.
      return false;
    }
    logger.warn({ err, applicationId: input.applicationId }, 'wallet credit failed');
    return false;
  }
}

interface RecordCashLogInput {
  userId: string;
  /** Paise — convert rupees → paise on the mobile side. */
  amount: number;
  description: string;
  /** Optional ISO date the work was done. Defaults to now. */
  workedOn?: string;
}

/**
 * Records a self-reported cash earning — work the seeker did off-Doondo
 * (a private mason job, a wedding waiter shift, a friend's tutoring).
 * Stored as a `cash_log` settled transaction so it sums into their
 * lifetime total alongside Doondo-recorded hires.
 */
export async function recordCashLog(
  input: RecordCashLogInput,
): Promise<PublicWalletTransaction> {
  const settledAt = input.workedOn ? new Date(input.workedOn) : new Date();
  const doc = await WalletTransactionModel.create({
    userId: new Types.ObjectId(input.userId),
    amount: Math.max(0, input.amount),
    currency: 'INR',
    kind: 'cash_log',
    status: 'settled',
    description: input.description.trim().slice(0, 240),
    settledAt,
  });
  return doc.toPublicJSON();
}

export async function deleteCashLog(
  userId: string,
  transactionId: string,
): Promise<boolean> {
  if (!Types.ObjectId.isValid(transactionId)) return false;
  const result = await WalletTransactionModel.deleteOne({
    _id: new Types.ObjectId(transactionId),
    userId: new Types.ObjectId(userId),
    kind: 'cash_log',
  });
  return result.deletedCount > 0;
}

export async function listForUser(userId: string, limit = 50): Promise<PublicWalletTransaction[]> {
  const rows = await WalletTransactionModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit);
  return rows.map((r) => r.toPublicJSON());
}

export async function summarize(userId: string): Promise<EarningsSummary> {
  // Group by (kind, status) — we want hires AND cash logs in the
  // lifetime total, but only hires drive the hireCount badge.
  const result = await WalletTransactionModel.aggregate<{
    _id: { kind: string; status: string };
    sum: number;
    count: number;
  }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        kind: { $in: ['hire_payment', 'cash_log'] },
      },
    },
    {
      $group: {
        _id: { kind: '$kind', status: '$status' },
        sum: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let totalEarnedPaise = 0;
  let pendingPaise = 0;
  let hireCount = 0;
  let cashLogCount = 0;
  let cashLogPaise = 0;
  for (const r of result) {
    if (r._id.status === 'settled') totalEarnedPaise += r.sum;
    else if (r._id.status === 'pending') pendingPaise += r.sum;
    if (r._id.kind === 'hire_payment') hireCount += r.count;
    if (r._id.kind === 'cash_log') {
      cashLogCount += r.count;
      cashLogPaise += r.sum;
    }
  }
  return {
    totalEarnedPaise,
    pendingPaise,
    hireCount,
    cashLogCount,
    cashLogPaise,
    currency: 'INR',
  };
}
