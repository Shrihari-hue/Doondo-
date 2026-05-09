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
  verifyRefreshToken,
  type UserRole,
} from '@/lib/jwt';
import { hashPassword, verifyPassword } from '@/lib/password';
import { UserModel, type PublicUser } from '@/modules/users/user.model';
import { RefreshTokenModel } from '@/modules/users/refreshToken.model';
import type { LoginInput, RegisterInput } from './auth.schemas';

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

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    phone: input.phone ?? null,
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
