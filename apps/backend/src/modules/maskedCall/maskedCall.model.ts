/**
 * MaskedCallSession — an audit row for one "call via Doondo" attempt
 * between the two parties on a hire.
 *
 * When a telephony provider is configured the row stores the allocated
 * proxy number; until then it records that the call fell back to a gated
 * number reveal. Either way we keep a trail of who called whom and how,
 * which is what a future provider integration (and any abuse review)
 * needs.
 */
import { Schema, model, type Model, type HydratedDocument, Types } from 'mongoose';

export const MASKED_CALL_MODES = ['proxy', 'reveal'] as const;
export type MaskedCallMode = (typeof MASKED_CALL_MODES)[number];

interface MaskedCallSession {
  applicationId: Types.ObjectId;
  callerId: Types.ObjectId;
  calleeId: Types.ObjectId;
  callerRole: 'employer' | 'seeker';
  mode: MaskedCallMode;
  provider: string;
  proxyNumber?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type MaskedCallSessionDocument = HydratedDocument<MaskedCallSession>;
type MaskedCallSessionModelType = Model<MaskedCallSession>;

const schema = new Schema<MaskedCallSession, MaskedCallSessionModelType>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calleeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    callerRole: { type: String, enum: ['employer', 'seeker'], required: true },
    mode: { type: String, enum: MASKED_CALL_MODES, required: true },
    provider: { type: String, required: true },
    proxyNumber: { type: String, default: null },
  },
  { timestamps: true },
);
schema.index({ callerId: 1, createdAt: -1 });

export const MaskedCallSessionModel = model<MaskedCallSession, MaskedCallSessionModelType>(
  'MaskedCallSession',
  schema,
);

export type { MaskedCallSession, MaskedCallSessionDocument };
