/**
 * AdvanceRequest — seeker asks for a small advance against confirmed
 * upcoming work.
 *
 * V1 stub: we persist the request and surface it back to the seeker
 * with status updates. No lender is wired yet — Doondo's ops team
 * processes these manually until we partner with a microfinance
 * provider.
 *
 * Eligibility (enforced at controller):
 *   - Hired application(s) in the next 30 days, OR a settled hire in
 *     the last 30 days
 *   - Average rating ≥ 4.0
 *   - Verified profile (phone + selfie)
 *
 * Amount cap: max ₹5,000 (500_000 paise). The cap exists so the v1
 * stub can never accumulate a meaningful liability before a real
 * lender takes over.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const ADVANCE_STATUSES = [
  'requested',
  'approved',
  'paid',
  'repaid',
  'declined',
  'cancelled',
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

interface AdvanceRequest {
  seekerId: Types.ObjectId;
  /** Paise — capped at 500_000 (₹5,000). */
  amountPaise: number;
  currency: string;
  /** Free-text reason the seeker types in. */
  reason: string;
  /** Application this advance is tied to (helps ops verify a real hire). */
  applicationId?: Types.ObjectId | null;
  status: AdvanceStatus;
  /** ISO date the seeker expects to repay by (out of the upcoming wage). */
  repayBy?: Date | null;
  /** Internal note from ops (visible to seeker as "Update from Doondo"). */
  opsNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type AdvanceRequestDocument = HydratedDocument<AdvanceRequest>;
type AdvanceRequestModelType = Model<AdvanceRequest>;

const schema = new Schema<AdvanceRequest, AdvanceRequestModelType>(
  {
    seekerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 50_000, max: 500_000 },
    currency: { type: String, default: 'INR', uppercase: true, length: 3 },
    reason: { type: String, default: '', maxlength: 400, trim: true },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
    },
    status: {
      type: String,
      enum: ADVANCE_STATUSES,
      default: 'requested',
      index: true,
    },
    repayBy: { type: Date, default: null },
    opsNote: { type: String, default: null, maxlength: 400 },
  },
  { timestamps: true },
);
schema.index({ seekerId: 1, status: 1, createdAt: -1 });

export const AdvanceRequestModel = model<AdvanceRequest, AdvanceRequestModelType>(
  'AdvanceRequest',
  schema,
);

export type { AdvanceRequest, AdvanceRequestDocument };
