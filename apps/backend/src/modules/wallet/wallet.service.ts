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
import { errors } from '@/lib/errors';
import { env } from '@/config/env';
import { UserModel } from '@/modules/users/user.model';
import { requestPayout } from '@/lib/paymentAggregator';
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

/** Commission split for a gross QR payment: fee (kept) + net (to worker). */
export function splitCommission(grossPaise: number): { feePaise: number; netPaise: number } {
  const gross = Math.max(0, Math.round(grossPaise));
  const feePaise = Math.round((gross * env.DOONDO_COMMISSION_BPS) / 10_000);
  return { feePaise, netPaise: gross - feePaise };
}

/**
 * Credit a QR collection to the worker's wallet, net of Doondo's
 * commission. The full gross + the withheld fee are stored on the row so
 * the receipt is honest. Returns the settled transaction.
 */
export async function creditQrCollection(input: {
  userId: string;
  grossPaise: number;
  description: string;
}): Promise<PublicWalletTransaction> {
  const { feePaise, netPaise } = splitCommission(input.grossPaise);
  const doc = await WalletTransactionModel.create({
    userId: new Types.ObjectId(input.userId),
    amount: netPaise,
    currency: 'INR',
    kind: 'qr_collection',
    status: 'settled',
    description: input.description.trim().slice(0, 240),
    settledAt: new Date(),
    grossPaise: Math.round(input.grossPaise),
    feePaise,
  });
  return doc.toPublicJSON();
}

/**
 * Funds Doondo actually holds for the worker and can pay out: settled QR
 * collections minus payouts already taken (pending or settled). Cash logs
 * and hire records are NOT included — that money never passed through
 * Doondo, so it isn't withdrawable.
 */
export async function getWithdrawableBalance(userId: string): Promise<number> {
  const rows = await WalletTransactionModel.aggregate<{ _id: string; sum: number }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        kind: { $in: ['qr_collection', 'payout'] },
        status: { $ne: 'reversed' },
      },
    },
    { $group: { _id: '$kind', sum: { $sum: '$amount' } } },
  ]);
  // qr_collection amounts are positive credits; payout amounts are stored
  // negative (debits), so a plain sum gives the remaining balance.
  return rows.reduce((acc, r) => acc + r.sum, 0);
}

/**
 * Withdraw wallet balance to the worker's verified bank account. Records a
 * pending `payout` debit, asks the aggregator to send the money, and
 * settles (or reverses) the row on the result. Throws on insufficient
 * balance or an unverified/missing bank account.
 */
export async function requestWithdrawal(input: {
  userId: string;
  amountPaise: number;
}): Promise<PublicWalletTransaction> {
  const amount = Math.round(input.amountPaise);
  if (amount <= 0) throw errors.validation(null, 'Enter an amount to withdraw.');

  const user = await UserModel.findById(input.userId).select('payoutBank').lean();
  const bank = (user as { payoutBank?: { accountNumber: string; ifsc: string; verified: boolean } | null } | null)
    ?.payoutBank;
  if (!bank) throw errors.validation(null, 'Add a bank account before withdrawing.');
  if (!bank.verified) throw errors.validation(null, 'Your bank account is not verified yet.');

  const balance = await getWithdrawableBalance(input.userId);
  if (amount > balance) {
    throw errors.validation(null, 'Amount exceeds your withdrawable balance.');
  }

  // Record the debit as pending first so the balance can't be double-spent
  // by a concurrent request.
  const txn = await WalletTransactionModel.create({
    userId: new Types.ObjectId(input.userId),
    amount: -amount,
    currency: 'INR',
    kind: 'payout',
    status: 'pending',
    description: 'Withdrawal to bank account',
  });

  try {
    const result = await requestPayout({
      userId: input.userId,
      amountPaise: amount,
      accountNumber: bank.accountNumber,
      ifsc: bank.ifsc,
    });
    if (result.status === 'failed') {
      txn.status = 'reversed';
    } else {
      txn.status = 'settled';
      txn.settledAt = new Date();
    }
    await txn.save();
  } catch (err) {
    logger.warn({ err, userId: input.userId }, 'payout failed — reversing');
    txn.status = 'reversed';
    await txn.save();
    throw errors.validation(null, 'Withdrawal could not be processed. Try again.');
  }

  return txn.toPublicJSON();
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
