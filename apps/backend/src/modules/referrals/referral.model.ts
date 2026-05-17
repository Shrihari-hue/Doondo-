/**
 * Referral — seeker A shared a job, seeker B applied via the link, and
 * (eventually) got hired. A earns ₹100 credit on their wallet when B's
 * application hits `hired`.
 *
 * Doondo absorbs the ₹100 in v1 as a CAC line item. The economics live
 * in code (see `REFERRAL_BONUS_PAISE` in the service) so they're easy
 * to tune without a schema change.
 *
 * Lifecycle:
 *   pending  → application created with a ?ref=A on the apply call
 *   hired    → B's application reached `hired`; bonus credited to A
 *   reverted → B's hire was rolled back (rare); bonus debited
 *
 * Unique on (referrerId, refereeId, jobId) so the same person can't
 * be double-credited for the same job + worker pair.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const REFERRAL_STATUSES = ['pending', 'hired', 'reverted'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export interface Referral {
  referrerId: Schema.Types.ObjectId;
  refereeId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  applicationId?: Schema.Types.ObjectId | null;
  status: ReferralStatus;
  /** Set when `status` transitions to 'hired'. Paise. */
  bonusPaise?: number | null;
  hiredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicReferral {
  id: string;
  referrerId: string;
  refereeId: string;
  jobId: string;
  applicationId: string | null;
  status: ReferralStatus;
  bonusPaise: number | null;
  hiredAt: string | null;
  createdAt: string;
}

interface ReferralMethods {
  toPublicJSON(): PublicReferral;
}

export type ReferralDocument = HydratedDocument<Referral, ReferralMethods>;
type ReferralModelType = Model<Referral, Record<string, never>, ReferralMethods>;

const referralSchema = new Schema<Referral, ReferralModelType, ReferralMethods>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refereeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
    status: { type: String, enum: REFERRAL_STATUSES, default: 'pending', index: true },
    bonusPaise: { type: Number, default: null, min: 0 },
    hiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One referral row per (referrer, referee, job).
referralSchema.index(
  { referrerId: 1, refereeId: 1, jobId: 1 },
  { unique: true },
);
// "Show me all my referrals, newest first" — drives the referrer's
// dashboard counter on Profile.
referralSchema.index({ referrerId: 1, createdAt: -1 });

referralSchema.method('toPublicJSON', function (
  this: ReferralDocument,
): PublicReferral {
  return {
    id: this._id.toString(),
    referrerId: (this.referrerId as unknown as { toString(): string }).toString(),
    refereeId: (this.refereeId as unknown as { toString(): string }).toString(),
    jobId: (this.jobId as unknown as { toString(): string }).toString(),
    applicationId: this.applicationId
      ? (this.applicationId as unknown as { toString(): string }).toString()
      : null,
    status: this.status,
    bonusPaise: this.bonusPaise ?? null,
    hiredAt: this.hiredAt ? this.hiredAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const ReferralModel = model<Referral, ReferralModelType>(
  'Referral',
  referralSchema,
);
