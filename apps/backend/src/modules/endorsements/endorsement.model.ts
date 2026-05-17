/**
 * Endorsement — an employer who has hired a seeker vouches for them on a
 * specific trade ("This worker IS actually an electrician, I worked
 * with them and confirm it.").
 *
 * Unique on (endorserId, seekerId, trade) so each employer can endorse
 * a given seeker on a given trade exactly once. Multiple endorsements
 * from different employers compound into a "verified [trade]" status
 * on the seeker profile.
 *
 * Higher trust than self-declared skills. Cheaper than running a real
 * verification flow (selfie + ID + trade test). Self-correcting because
 * the endorser has actually worked with the seeker — there's no point
 * issuing a fake endorsement.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface Endorsement {
  endorserId: Schema.Types.ObjectId;
  seekerId: Schema.Types.ObjectId;
  trade: string;
  /** Optional — links back to the application that justified the endorsement. */
  applicationId?: Schema.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicEndorsement {
  id: string;
  endorserId: string;
  endorserName: string;
  endorserCompanyName: string | null;
  seekerId: string;
  trade: string;
  applicationId: string | null;
  createdAt: string;
}

interface EndorsementMethods {
  toPublicJSON(opts: {
    endorserName: string;
    endorserCompanyName?: string | null;
  }): PublicEndorsement;
}

export type EndorsementDocument = HydratedDocument<Endorsement, EndorsementMethods>;
type EndorsementModelType = Model<Endorsement, Record<string, never>, EndorsementMethods>;

const endorsementSchema = new Schema<Endorsement, EndorsementModelType, EndorsementMethods>(
  {
    endorserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    trade: { type: String, required: true, trim: true, maxlength: 40, index: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', default: null },
  },
  { timestamps: true },
);

// One endorsement per (endorser, seeker, trade) — re-endorsing is a no-op.
endorsementSchema.index(
  { endorserId: 1, seekerId: 1, trade: 1 },
  { unique: true },
);
// "Count endorsements for this seeker grouped by trade" — used to compute
// the verified-trade badge thresholds.
endorsementSchema.index({ seekerId: 1, trade: 1 });

endorsementSchema.method('toPublicJSON', function (
  this: EndorsementDocument,
  opts,
): PublicEndorsement {
  return {
    id: this._id.toString(),
    endorserId: (this.endorserId as unknown as { toString(): string }).toString(),
    endorserName: opts.endorserName,
    endorserCompanyName: opts.endorserCompanyName ?? null,
    seekerId: (this.seekerId as unknown as { toString(): string }).toString(),
    trade: this.trade,
    applicationId: this.applicationId
      ? (this.applicationId as unknown as { toString(): string }).toString()
      : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const EndorsementModel = model<Endorsement, EndorsementModelType>(
  'Endorsement',
  endorsementSchema,
);
