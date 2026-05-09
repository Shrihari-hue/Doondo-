/**
 * OtpChallenge — short-lived "we sent this user a code, did they enter it?"
 * record for the phone-verification step.
 *
 * Design notes:
 *   - codeHash, never the plaintext code. We compare bcrypt-hashed inputs.
 *   - TTL index on expiresAt: the doc evaporates automatically when the
 *     window passes, so we never have to GC.
 *   - A user can have at most one *active* challenge for a phone at a time;
 *     issuing a new code invalidates the previous one (consumed=true).
 *   - attempts capped at env.OTP_MAX_ATTEMPTS — past that, the doc is dead
 *     and the client must request a fresh code.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface OtpChallenge {
  userId: Schema.Types.ObjectId;
  /** Canonical E.164 number ("+919812345678"). One challenge per (user, phone). */
  phone: string;
  codeHash: string;
  attempts: number;
  consumed: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpChallengeDocument = HydratedDocument<OtpChallenge>;
type OtpChallengeModelType = Model<OtpChallenge>;

const otpChallengeSchema = new Schema<OtpChallenge, OtpChallengeModelType>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0, min: 0 },
    consumed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB drops the document automatically when expiresAt passes.
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Quick lookup of "the active challenge for this user+phone".
otpChallengeSchema.index({ userId: 1, phone: 1, consumed: 1 });

export const OtpChallengeModel = model<OtpChallenge, OtpChallengeModelType>(
  'OtpChallenge',
  otpChallengeSchema,
);
