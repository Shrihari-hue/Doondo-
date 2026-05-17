/**
 * Referrals service — record a referral at apply time, credit the bonus
 * at hire time. The actual money movement is a wallet `referral_bonus`
 * transaction; Doondo eats the cost in v1.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import {
  ReferralModel,
  type PublicReferral,
} from './referral.model';
import { WalletTransactionModel } from '@/modules/wallet/walletTransaction.model';

/** ₹100 bonus when the referee gets hired. Tune freely. */
export const REFERRAL_BONUS_PAISE = 10_000; // ₹100 in paise

interface RecordInput {
  referrerId: string;
  refereeId: string;
  jobId: string;
  applicationId: string;
}

/**
 * Idempotently record a referral when seeker B applies via A's link.
 * Returns true if a new row was created, false on duplicate-key (the
 * pair already had a referral on this job).
 */
export async function recordReferral(input: RecordInput): Promise<boolean> {
  if (input.referrerId === input.refereeId) return false;
  try {
    await ReferralModel.create({
      referrerId: new Types.ObjectId(input.referrerId),
      refereeId: new Types.ObjectId(input.refereeId),
      jobId: new Types.ObjectId(input.jobId),
      applicationId: new Types.ObjectId(input.applicationId),
      status: 'pending',
    });
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      // Already recorded — fine.
      return false;
    }
    logger.warn({ err }, 'referral record failed');
    return false;
  }
}

/**
 * Called when an Application transitions to `hired`. Looks up any
 * pending referral for this (refereeId, jobId) pair and credits the
 * referrer's wallet. Idempotent — re-firing for an already-hired
 * referral is a no-op.
 */
export async function creditOnHire(input: {
  refereeId: string;
  jobId: string;
  applicationId: string;
}): Promise<void> {
  const referral = await ReferralModel.findOne({
    refereeId: new Types.ObjectId(input.refereeId),
    jobId: new Types.ObjectId(input.jobId),
    status: 'pending',
  });
  if (!referral) return;

  // Credit the wallet first (it's the money operation; the referral
  // status flip is bookkeeping that follows).
  try {
    await WalletTransactionModel.create({
      userId: referral.referrerId,
      amount: REFERRAL_BONUS_PAISE,
      currency: 'INR',
      kind: 'adjustment',
      status: 'settled',
      description: 'Referral bonus — thank you for sharing the job',
      applicationId: new Types.ObjectId(input.applicationId),
      settledAt: new Date(),
    });
  } catch (err: unknown) {
    logger.warn({ err }, 'referral bonus wallet credit failed');
    return;
  }

  referral.status = 'hired';
  referral.bonusPaise = REFERRAL_BONUS_PAISE;
  referral.hiredAt = new Date();
  await referral.save();
}

export async function listForReferrer(
  referrerId: string,
): Promise<PublicReferral[]> {
  const rows = await ReferralModel.find({
    referrerId: new Types.ObjectId(referrerId),
  })
    .sort({ createdAt: -1 })
    .limit(50);
  return rows.map((r) => r.toPublicJSON());
}

export interface ReferralSummary {
  /** Total referrals the user has ever made. */
  total: number;
  /** Referrals that ended in a hire (and thus a bonus credit). */
  hired: number;
  /** Total bonus paise credited to date. */
  totalBonusPaise: number;
}

export async function summarizeForReferrer(
  referrerId: string,
): Promise<ReferralSummary> {
  const rows = await ReferralModel.aggregate<{
    _id: string;
    count: number;
    bonusSum: number;
  }>([
    { $match: { referrerId: new Types.ObjectId(referrerId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        bonusSum: { $sum: { $ifNull: ['$bonusPaise', 0] } },
      },
    },
  ]);
  let total = 0;
  let hired = 0;
  let totalBonusPaise = 0;
  for (const r of rows) {
    total += r.count;
    if (r._id === 'hired') {
      hired += r.count;
      totalBonusPaise += r.bonusSum;
    }
  }
  return { total, hired, totalBonusPaise };
}
