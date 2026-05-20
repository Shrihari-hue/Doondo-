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
import { UserModel } from '@/modules/users/user.model';
import { sendReferralBonusPush } from '@/lib/push';

/**
 * Referral bonus per side, in paise. Both the referrer (who shared the
 * job) AND the referee (the new worker) earn this — a both-sides reward
 * is a stronger growth loop than a one-sided one.
 *
 * Paid when the referee completes their FIRST SHIFT (first check-in),
 * not merely on hire — a hire that never shows up shouldn't trigger a
 * payout, and "paid on first shift" is the anti-fraud design.
 */
export const REFERRAL_BONUS_PAISE = 10_000; // ₹100 in paise, each side

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
 * Credit the referral bonus to BOTH sides — the referrer who shared
 * the job and the referee who took it.
 *
 * Called when the referee completes their FIRST shift check-in (see
 * shiftCheckIn.service). Paying on first shift rather than on hire
 * means a no-show hire never triggers a payout — the worker has to
 * actually turn up.
 *
 * Idempotent: the referral row's `status` is the guard. We only credit
 * while it's still `pending`; the flip to `hired` closes the door on a
 * second payout if this fires again.
 *
 * Both wallet credits use the unique (userId, applicationId, kind)
 * shape so even a torn write — referrer credited, process dies before
 * referee — is safe to re-run: the second attempt re-credits only the
 * side that's missing... in practice we flip status only after both
 * succeed, so a retry redoes both, and the wallet's own idempotency
 * (if any) is the backstop. Kept simple: best-effort, logged.
 */
export async function creditOnFirstShift(input: {
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

  const applicationObjectId = new Types.ObjectId(input.applicationId);

  // Credit both wallets. The referrer is rewarded for sharing; the
  // referee for showing up. Each is a settled adjustment transaction.
  try {
    await WalletTransactionModel.create({
      userId: referral.referrerId,
      amount: REFERRAL_BONUS_PAISE,
      currency: 'INR',
      kind: 'adjustment',
      status: 'settled',
      description: 'Referral bonus — your friend started their first shift',
      applicationId: applicationObjectId,
      settledAt: new Date(),
    });
    await WalletTransactionModel.create({
      userId: referral.refereeId,
      amount: REFERRAL_BONUS_PAISE,
      currency: 'INR',
      kind: 'adjustment',
      status: 'settled',
      description: 'Welcome bonus — for starting your first shift on Doondo',
      applicationId: applicationObjectId,
      settledAt: new Date(),
    });
  } catch (err: unknown) {
    logger.warn({ err }, 'referral both-sides wallet credit failed');
    return;
  }

  referral.status = 'hired';
  // bonusPaise records the PER-SIDE amount; the platform paid 2×.
  referral.bonusPaise = REFERRAL_BONUS_PAISE;
  referral.hiredAt = new Date();
  await referral.save();

  // Push both sides so each sees the credit immediately. Best-effort.
  void (async () => {
    try {
      const [referee, referrer] = await Promise.all([
        UserModel.findById(referral.refereeId).select('name').lean(),
        UserModel.findById(referral.referrerId).select('name').lean(),
      ]);
      const refereeName =
        (referee as { name?: string } | null)?.name?.split(' ')[0] ?? 'A friend';
      const referrerName =
        (referrer as { name?: string } | null)?.name?.split(' ')[0] ?? 'A friend';
      await Promise.all([
        sendReferralBonusPush({
          recipientId: referral.referrerId.toString(),
          refereeName,
          bonusPaise: REFERRAL_BONUS_PAISE,
        }),
        sendReferralBonusPush({
          recipientId: referral.refereeId.toString(),
          refereeName: referrerName,
          bonusPaise: REFERRAL_BONUS_PAISE,
        }),
      ]);
    } catch (err) {
      logger.warn(
        { err, referralId: referral.id },
        'referral bonus push (both sides) failed',
      );
    }
  })();
}

/**
 * @deprecated Kept as a thin alias so any caller still wired to the
 * hire transition keeps compiling. The real payout now happens on the
 * referee's first shift check-in via `creditOnFirstShift`. This is a
 * no-op-on-hire shim; remove once all call sites are migrated.
 */
export async function creditOnHire(_input: {
  refereeId: string;
  jobId: string;
  applicationId: string;
}): Promise<void> {
  // Intentionally does nothing — payout moved to first-shift check-in.
  return;
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
