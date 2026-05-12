/**
 * JWT helpers — access tokens (short-lived) and refresh tokens (long-lived).
 *
 * Two separate secrets so a leak of one doesn't compromise the other. Both
 * are HS256 — symmetric is fine because both signing and verifying happen
 * inside the backend.
 *
 * Refresh tokens carry only the minimum needed to look them up: the user
 * ID and a familyId. The actual token string is hashed and stored in the
 * RefreshToken collection so we can revoke and detect reuse.
 */

import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { errors } from './errors';

export type UserRole = 'seeker' | 'employer' | 'admin';

export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // userId
  fid: string; // familyId — same across rotations of the same login session
  jti: string; // unique per token; matches RefreshToken._id
  type: 'refresh';
}

/**
 * Reset-password token. Issued after a user proves they control a phone via
 * OTP; presented back when they submit a new password. Short-lived (15 min)
 * and single-use — the `jti` is hashed and stored on the User record so we
 * can reject reuse after a successful reset.
 */
export interface ResetTokenPayload {
  sub: string; // userId
  jti: string; // unique per reset; matches passwordResetTokenHash on the user
  type: 'password_reset';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access') throw errors.tokenInvalid();
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw errors.tokenExpired();
    if (err instanceof jwt.JsonWebTokenError) throw errors.tokenInvalid();
    throw err;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') throw errors.tokenInvalid();
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw errors.tokenExpired();
    if (err instanceof jwt.JsonWebTokenError) throw errors.tokenInvalid();
    throw err;
  }
}

// ─── Password-reset tokens ──────────────────────────────────────────────
// Signed with the access-token secret (separate key types are isolated by
// the embedded `type` field). 15-minute TTL — long enough that a user
// reading the OTP off their phone has time to enter both code and new
// password, short enough to limit the blast radius if intercepted.

const RESET_TOKEN_TTL = '15m';

export function signResetToken(payload: Omit<ResetTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'password_reset' }, env.JWT_ACCESS_SECRET, {
    expiresIn: RESET_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyResetToken(token: string): ResetTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as ResetTokenPayload;
    // Cross-type smuggling defense — an access token shouldn't authorize a
    // password reset and vice versa.
    if (decoded.type !== 'password_reset') throw errors.resetTokenInvalid();
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw errors.resetTokenExpired();
    if (err instanceof jwt.JsonWebTokenError) throw errors.resetTokenInvalid();
    throw err;
  }
}
