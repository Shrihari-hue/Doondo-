/**
 * Offer expiry sweep — lapses time-boxed offers nobody answered.
 *
 * An employer can extend an offer with a deadline (`offer.expiresAt`). If
 * the worker neither accepts nor declines by then, this sweep — run on a
 * tight cadence — flips the offer to `expired` and nudges the employer so
 * they stop waiting on a silent "maybe" and move to the next candidate.
 *
 * Mirrors the other sweeps: mark-then-notify, bounded query, per-row
 * errors swallowed. Idempotent because once `outcome` leaves `pending`
 * the row no longer matches the query.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendOfferExpiredPush } from '@/lib/push';
import { ApplicationModel } from './application.model';

export interface OfferExpirySweepSummary {
  considered: number;
  expired: number;
  errors: number;
}

const BATCH_LIMIT = 300;

export async function runOfferExpirySweep(): Promise<OfferExpirySweepSummary> {
  const now = new Date();
  const candidates = await ApplicationModel.find({
    'offer.outcome': 'pending',
    'offer.expiresAt': { $lte: now },
  })
    .limit(BATCH_LIMIT)
    .lean();

  const summary: OfferExpirySweepSummary = {
    considered: candidates.length,
    expired: 0,
    errors: 0,
  };
  if (candidates.length === 0) return summary;

  const ids = candidates.map((c) => c._id);
  const writeResult = await ApplicationModel.updateMany(
    { _id: { $in: ids }, 'offer.outcome': 'pending', 'offer.expiresAt': { $lte: now } },
    { $set: { 'offer.outcome': 'expired' } },
  );
  summary.expired = writeResult.modifiedCount ?? 0;

  for (const app of candidates) {
    void sendOfferExpiredPush({
      recipientId: app.employerId.toString(),
      applicationId: (app._id as Types.ObjectId).toString(),
    }).catch((err) => {
      summary.errors += 1;
      logger.warn(
        { err, applicationId: (app._id as Types.ObjectId).toString() },
        'offer expiry: employer push failed',
      );
    });
  }

  logger.info(summary, 'offer expiry sweep complete');
  return summary;
}
