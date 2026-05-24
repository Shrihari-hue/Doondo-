/**
 * ScoreCredential — the stored record behind a worker's shareable
 * Doondo Score QR.
 *
 * The QR encodes a short verification URL (`…/score/verify/AB12CD34`)
 * rather than a long signed token, so the QR stays low-density and
 * crisp. The `code` is the lookup key; the `signature` is an HMAC over
 * the record so a tampered row fails verification.
 *
 * One credential per worker — re-issuing ("refresh") keeps the same
 * `code` and just updates the score snapshot, so a QR a worker already
 * shared keeps resolving to their current score.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface ScoreCredentialRecord {
  userId: Schema.Types.ObjectId;
  /** Short, URL-safe lookup code embedded in the QR. */
  code: string;
  /** Worker's display name at issue time. */
  name: string;
  /** Score snapshot (0-100). */
  score: number;
  /** Scoring algorithm version. */
  scoreVersion: number;
  /** HMAC over the credential fields — integrity check on verify. */
  signature: string;
  issuedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ScoreCredentialDocument = HydratedDocument<ScoreCredentialRecord>;
type ScoreCredentialModelType = Model<ScoreCredentialRecord>;

const scoreCredentialSchema = new Schema<ScoreCredentialRecord, ScoreCredentialModelType>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    score: { type: Number, required: true, min: 0, max: 100 },
    scoreVersion: { type: Number, required: true },
    signature: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const ScoreCredentialModel = model<ScoreCredentialRecord, ScoreCredentialModelType>(
  'ScoreCredential',
  scoreCredentialSchema,
);
