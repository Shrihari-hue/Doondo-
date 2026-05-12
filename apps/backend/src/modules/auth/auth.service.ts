/**
 * Auth service — pure business logic, no HTTP, no Express types.
 *
 * Why this layer: controllers stay tiny ("parse request → call service →
 * format response"). Services are unit-testable without spinning up Express.
 *
 * Refresh token strategy:
 *   1. On login/register, mint an access + refresh pair. The refresh has a
 *      unique jti (= the RefreshToken._id) and a familyId that groups all
 *      rotations of the same login session.
 *   2. On refresh, if the presented token is valid AND not revoked AND
 *      matches the stored hash, we issue a new pair (same familyId, new jti)
 *      and mark the old token revoked + replacedBy = newJti.
 *   3. If a presented token is already revoked, we treat that as REUSE —
 *      revoke the entire family. Classic stolen-refresh-token defense.
 *   4. On logout, revoke the presented refresh token.
 *
 * ms-style TTLs in env (e.g. "30d") are converted to a Date for the
 * RefreshToken.expiresAt field via parseTtl().
 */

import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { sha256 } from '@/lib/ids';
import { logger } from '@/lib/logger';
import {
  signAccessToken,
  signRefreshToken,
  signResetToken,
  verifyRefreshToken,
  verifyResetToken,
  type UserRole,
} from '@/lib/jwt';
import { hashPassword, verifyPassword } from '@/lib/password';
import { UserModel, type PublicUser } from '@/modules/users/user.model';
import { RefreshTokenModel } from '@/modules/users/refreshToken.model';
import { canonicalisePhone, issueOtp, verifyOtp } from '@/modules/verification/otp.service';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyResetCodeInput,
} from './auth.schemas';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export interface AuthSuccess {
  user: PublicUser;
  tokens: TokenPair;
}

interface ClientContext {
  ip?: string | null;
  userAgent?: string | null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function register(
  input: RegisterInput,
  ctx: ClientContext = {},
): Promise<AuthSuccess> {
  const existing = await UserModel.findOne({ email: input.email }).lean();
  if (existing) throw errors.emailTaken();

  // Phone is required at signup so password reset works for every new
  // account. Canonicalise here so the value stored matches what the
  // verification / reset flows look up (both go through canonicalisePhone).
  const phone = canonicalisePhone(input.phone);

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    phone,
    // Solo/Team only applies to seekers — quietly ignore for employers.
    workType: input.role === 'seeker' ? (input.workType ?? null) : null,
    teamSize:
      input.role === 'seeker' && input.workType === 'team'
        ? (input.teamSize ?? null)
        : null,
  });

  logger.info({ userId: user.id, role: user.role }, 'user registered');

  const tokens = await issueTokens(user.id, user.role, randomUUID(), ctx);
  return { user: user.toPublicJSON(), tokens };
}

export async function login(input: LoginInput, ctx: ClientContext = {}): Promise<AuthSuccess> {
  // .select('+passwordHash') because the field is select:false by default.
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  if (!user || !user.isActive) throw errors.invalidCredentials();

  // Defensive: if a user record somehow lacks a passwordHash (partial write,
  // manual DB edit, or future social-login flow), don't crash — just fail
  // auth the same way as a wrong password.
  if (!user.passwordHash) {
    logger.warn({ userId: user.id }, 'login attempt on user with no passwordHash');
    throw errors.invalidCredentials();
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw errors.invalidCredentials();

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokens(user.id, user.role, randomUUID(), ctx);
  return { user: user.toPublicJSON(), tokens };
}

export async function refresh(rawToken: string, ctx: ClientContext = {}): Promise<TokenPair> {
  const payload = verifyRefreshToken(rawToken);

  const tokenHash = sha256(rawToken);
  const stored = await RefreshTokenModel.findOne({ tokenHash });

  if (!stored) {
    // Token verifies cryptographically but isn't in our store — treat as
    // unknown. Could be a token from before a secret rotation, or a forgery.
    logger.warn({ jti: payload.jti, sub: payload.sub }, 'refresh token not found in store');
    throw errors.refreshRevoked();
  }

  if (stored.revokedAt) {
    // REUSE: this token was already exchanged or revoked. Compromise the
    // family — assume the original was stolen.
    logger.error(
      { userId: payload.sub, familyId: stored.familyId, jti: payload.jti },
      'refresh token reuse detected — revoking family',
    );
    await RefreshTokenModel.updateMany(
      { familyId: stored.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw errors.refreshReused();
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw errors.tokenExpired();
  }

  // Valid + active — rotate.
  const newJti = new Types.ObjectId().toHexString();
  stored.revokedAt = new Date();
  stored.replacedBy = newJti;
  await stored.save();

  return mintAndStoreTokenPair({
    userId: payload.sub,
    role: await fetchRole(payload.sub),
    familyId: stored.familyId,
    jti: newJti,
    ctx,
  });
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  await RefreshTokenModel.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) throw errors.notFound('User not found');
  return user.toPublicJSON();
}

// ─── Password reset ───────────────────────────────────────────────────────
//
// Three-step phone-OTP flow. The service is intentionally enumeration-safe:
// `requestPasswordReset` returns the same shape whether or not a user is on
// file, so an attacker can't probe for registered numbers by timing or
// response code. The actual SMS is only sent when a matching, active user
// exists.

export interface RequestPasswordResetResult {
  /** Canonical phone we'd send the OTP to. Echoed so the UI can display it. */
  phone: string;
  /** ISO timestamp; client should hint the user to retry after this. */
  expiresAt: string;
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<RequestPasswordResetResult> {
  const phone = canonicalisePhone(input.phone);
  // Even if there's no user with this phone, return the same envelope so
  // we don't leak which numbers exist. We DO skip the SMS in that case —
  // sending an OTP to a stranger's phone "from Doondo" would be worse than
  // the enumeration risk it would prevent.
  const user = await UserModel.findOne({ phone, isActive: true }).select('_id');

  // Default expiry hint matches the SMS provider's TTL.
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  if (user) {
    try {
      await issueOtp(user.id, phone);
    } catch (err) {
      // Don't surface provider-specific failures to the unauthenticated
      // caller — that would also leak existence. Log and pretend success.
      logger.error({ err, phone }, 'password-reset OTP issue failed');
    }
  } else {
    logger.info({ phone }, 'password-reset requested for unknown phone');
  }

  return { phone, expiresAt: expiresAt.toISOString() };
}

export interface VerifyResetCodeResult {
  /** Short-lived JWT to present to /auth/reset-password. */
  resetToken: string;
  /** Seconds until the reset token expires — matches the JWT TTL. */
  expiresIn: string;
}

export async function verifyResetCode(
  input: VerifyResetCodeInput,
): Promise<VerifyResetCodeResult> {
  const phone = canonicalisePhone(input.phone);
  const user = await UserModel.findOne({ phone, isActive: true }).select('_id');
  // No matching user → treat the same as a wrong code. Same response,
  // same status. Anything more specific would leak.
  if (!user) throw errors.otpInvalid();

  // Throws otpInvalid / otpExpired / otpTooMany on the corresponding
  // failure modes. On success the OTP challenge is marked consumed.
  await verifyOtp(user.id, phone, input.code);

  // Mint a single-use reset token. We store the SHA-256 of its jti on the
  // user; /auth/reset-password compares to detect reuse / forgery.
  const jti = new Types.ObjectId().toHexString();
  const resetToken = signResetToken({ sub: user.id, jti });

  await UserModel.updateOne(
    { _id: user._id },
    { $set: { passwordResetTokenHash: sha256(jti) } },
  );

  return { resetToken, expiresIn: '15m' };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  // verifyResetToken throws AUTH_RESET_TOKEN_INVALID / _EXPIRED for us.
  const payload = verifyResetToken(input.resetToken);

  // Need +passwordResetTokenHash (select:false) for the single-use check
  // and +passwordHash so we can confirm the hash actually rotates.
  const user = await UserModel.findById(payload.sub).select(
    '+passwordHash +passwordResetTokenHash',
  );
  if (!user || !user.isActive) throw errors.resetTokenInvalid();

  const expectedHash = sha256(payload.jti);
  if (!user.passwordResetTokenHash || user.passwordResetTokenHash !== expectedHash) {
    // Either already consumed (cleared after a prior success) or forged
    // (signed jti doesn't match our record). Both are "invalid".
    throw errors.resetTokenInvalid();
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordResetTokenHash = null; // single-use: burn it now.
  await user.save();

  // Belt-and-braces: revoke every outstanding refresh token for this user.
  // A successful reset implies "I've lost control of one device" — log all
  // sessions out so an attacker who slipped a refresh token through can't
  // continue. The user signs in fresh on the next screen.
  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  logger.info({ userId: user.id }, 'password reset succeeded');
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function fetchRole(userId: string): Promise<UserRole> {
  const user = await UserModel.findById(userId).select('role').lean();
  if (!user) throw errors.notFound('User not found');
  return user.role;
}

async function issueTokens(
  userId: string,
  role: UserRole,
  familyId: string,
  ctx: ClientContext,
): Promise<TokenPair> {
  const jti = new Types.ObjectId().toHexString();
  return mintAndStoreTokenPair({ userId, role, familyId, jti, ctx });
}

interface MintArgs {
  userId: string;
  role: UserRole;
  familyId: string;
  jti: string;
  ctx: ClientContext;
}

async function mintAndStoreTokenPair({
  userId,
  role,
  familyId,
  jti,
  ctx,
}: MintArgs): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, fid: familyId, jti });

  await RefreshTokenModel.create({
    _id: new Types.ObjectId(jti),
    userId: new Types.ObjectId(userId),
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + parseTtl(env.JWT_REFRESH_TTL)),
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresIn: env.JWT_ACCESS_TTL,
    refreshExpiresIn: env.JWT_REFRESH_TTL,
  };
}

/**
 * Parse a TTL string like "15m" / "30d" / "2h" into milliseconds. Tiny
 * implementation — don't pull in `ms` for one use.
 */
function parseTtl(ttl: string): number {
  const m = /^(\d+)\s*([smhdw])$/.exec(ttl);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit!];
  return value * mult!;
}
