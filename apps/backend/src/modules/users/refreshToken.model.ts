/**
 * RefreshToken — server-side record of issued refresh tokens.
 *
 * We store SHA-256 hashes, never the raw token. The raw token only ever
 * exists on the client (in expo-secure-store). This means:
 *   - Even a full DB dump can't be replayed against our auth.
 *   - We can revoke tokens by marking the record `revokedAt`.
 *   - We can detect refresh-token reuse (token already revoked → entire
 *     family is compromised, revoke them all).
 *
 * Family ID groups all rotations of the same login session. When a token
 * is rotated, the new token shares the family ID and references the old
 * via `replacedBy`. Reuse detection walks the family.
 */

import { Schema, model, type HydratedDocument } from 'mongoose';

export interface RefreshToken {
  userId: Schema.Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null; // jti of the next token in the family
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

const refreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index — Mongo will auto-delete documents past expiry.
      index: { expireAfterSeconds: 0 },
    },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const RefreshTokenModel = model<RefreshToken>('RefreshToken', refreshTokenSchema);
