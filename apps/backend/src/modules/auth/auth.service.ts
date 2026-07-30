/**
 * Auth service — pure business logic, no HTTP, no Express types.
 *
 * Why this layer: controllers stay tiny ("parse request → call service →
 * format response"). Services are unit-testable without spinning up Express.
 *
 * Refresh token strategy:
 *   1. On login/register, mint an access + refresh pair. The refresh has a
 *      unique jti (= the RefreshToken row's id) and a familyId that groups
 *      all rotations of the same login session.
 *   2. On refresh, if the presented token is valid AND not revoked AND
 *      matches the stored hash, we issue a new pair (same familyId, new jti)
 *      and mark the old token revoked + replacedBy = newJti.
 *   3. If a presented token is already revoked, we treat that as REUSE —
 *      revoke the entire family. Classic stolen-refresh-token defense.
 *   4. On logout, revoke the presented refresh token.
 *
 * ms-style TTLs in env (e.g. "30d") are converted to a Date for the
 * refresh_tokens.expires_at column via parseTtl().
 *
 * Ported from Mongoose to Postgres/Drizzle (Phase 1 of the Mongo→Postgres
 * migration) — behavior is unchanged; only the storage layer moved.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { sha256 } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { hashPhone } from '@/lib/phoneHash';
import {
  signAccessToken,
  signRefreshToken,
  signResetToken,
  verifyRefreshToken,
  verifyResetToken,
  type UserRole,
} from '@/lib/jwt';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getDb } from '@/db/client';
import { users, userLinks } from '@/db/schema/users';
import { refreshTokens } from '@/db/schema/auth';
import type { PublicUser } from '@/modules/users/user.model';
import { toPublicUser, type UserRow } from '@/modules/users/user.serializers';
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

/**
 * The login endpoint's return shape. A `LoginResult` is either a normal
 * `AuthSuccess` (user picked the right (email, role) combo on the first
 * try) OR a `LoginNeedsRoleChoice` payload, which the client uses to
 * render a role picker before re-submitting with `role` filled in.
 */
export interface LoginNeedsRoleChoice {
  needsRoleChoice: true;
  availableRoles: UserRole[];
}

export type LoginResult = AuthSuccess | LoginNeedsRoleChoice;

interface ClientContext {
  ip?: string | null;
  userAgent?: string | null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function register(
  input: RegisterInput,
  ctx: ClientContext = {},
): Promise<AuthSuccess> {
  const db = getDb();

  // Uniqueness is (email, role) — same physical person can hold both a
  // seeker and an employer account on the same email. The compound unique
  // index on `users` enforces this at the DB level; the explicit lookup
  // here gives us a clean AUTH_EMAIL_TAKEN error instead of a raw
  // duplicate-key crash.
  const existing = await db.query.users.findFirst({
    where: and(eq(users.email, input.email), eq(users.role, input.role)),
  });
  if (existing) throw errors.emailTaken();

  // Phone is required at signup so password reset works for every new
  // account. Canonicalise here so the value stored matches what the
  // verification / reset flows look up (both go through canonicalisePhone).
  const phone = canonicalisePhone(input.phone);

  const passwordHash = await hashPassword(input.password);

  // Look up accounts the new user is plausibly linked to BEFORE we insert.
  // "Linked" means same physical human: shares either the email OR the
  // phone with an already-active account.
  const siblings = await findSiblingAccounts(input.email, phone);

  // If at least one sibling has phoneVerifiedAt set AND shares THIS phone,
  // inherit the timestamp. Only the phone-OTP step is safely transferable
  // (selfie/GSTIN are role-specific and must be redone per account).
  const inheritedPhoneVerifiedAt =
    siblings.find((s) => s.phone === phone && s.phoneVerifiedAt)?.phoneVerifiedAt ?? null;

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      phone,
      phoneHash: phone ? hashPhone(phone) : null,
      phoneVerifiedAt: inheritedPhoneVerifiedAt,
      workType: input.role === 'seeker' ? (input.workType ?? null) : null,
      teamSize:
        input.role === 'seeker' && input.workType === 'team' ? (input.teamSize ?? null) : null,
    })
    .returning();
  if (!user) throw new Error('user insert returned no row');

  // Link bidirectionally — one row per direction, mirroring the old
  // $addToSet-onto-both-sides behavior.
  if (siblings.length > 0) {
    await db.insert(userLinks).values(
      siblings.flatMap((s) => [
        { userId: user.id, linkedUserId: s.id },
        { userId: s.id, linkedUserId: user.id },
      ]),
    );
    logger.info(
      { userId: user.id, linkedTo: siblings.map((s) => s.id), count: siblings.length },
      'new account linked to sibling accounts',
    );
  }

  logger.info({ userId: user.id, role: user.role }, 'user registered');

  const tokens = await issueTokens(user.id, user.role, randomUUID(), ctx);
  return {
    user: toPublicUser(user, { linkedUserIds: siblings.map((s) => s.id) }),
    tokens,
  };
}

/**
 * Find the set of existing active users that should be linked to a brand
 * new account. "Linked" = same physical person, inferred from shared email
 * OR shared phone. Ordered by createdAt ascending for deterministic
 * ordering (mirrors the old ascending-by-_id order, since Mongo ObjectIds
 * encode creation time but Postgres uuid v4 PKs don't).
 */
async function findSiblingAccounts(
  email: string,
  canonicalPhone: string,
): Promise<Array<Pick<UserRow, 'id' | 'email' | 'phone' | 'phoneVerifiedAt'>>> {
  const db = getDb();
  return db.query.users.findMany({
    where: and(
      eq(users.isActive, true),
      canonicalPhone ? or(eq(users.email, email), eq(users.phone, canonicalPhone)) : eq(users.email, email),
    ),
    columns: { id: true, email: true, phone: true, phoneVerifiedAt: true },
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });
}

export async function login(input: LoginInput, ctx: ClientContext = {}): Promise<LoginResult> {
  const db = getDb();

  // One email can belong to multiple users (one per role). Fetch all,
  // filter active in app code (matches the original select-then-filter
  // shape rather than pushing isActive into the WHERE, so the "no active
  // candidates" vs "role doesn't exist" distinction stays identical).
  const candidates = await db.query.users.findMany({ where: eq(users.email, input.email) });
  const activeCandidates = candidates.filter((u) => u.isActive);

  if (activeCandidates.length === 0) throw errors.invalidCredentials();

  // Multi-account disambiguation — same as before, a happy-path envelope
  // rather than an error so we don't leak password-correctness while
  // enumerating.
  if (activeCandidates.length > 1 && !input.role) {
    return {
      needsRoleChoice: true,
      availableRoles: dedupedRoles(activeCandidates.map((u) => u.role)),
    };
  }

  const user = input.role
    ? activeCandidates.find((u) => u.role === input.role)
    : activeCandidates[0];

  if (!user) throw errors.invalidCredentials();

  if (!user.passwordHash) {
    logger.warn({ userId: user.id }, 'login attempt on user with no passwordHash');
    throw errors.invalidCredentials();
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw errors.invalidCredentials();

  const [updated] = await db
    .update(users)
    .set({ lastLoginAt: new Date(), reengagementAttempts: 0 })
    .where(eq(users.id, user.id))
    .returning();
  if (!updated) throw new Error('user update returned no row');

  const tokens = await issueTokens(updated.id, updated.role, randomUUID(), ctx);
  const linkedUserIds = await getLinkedUserIds(updated.id);
  return { user: toPublicUser(updated, { linkedUserIds }), tokens };
}

/**
 * Deterministic, deduped ordering of the roles attached to a shared email.
 * Seeker first, then employer, then anything else in insertion order.
 */
function dedupedRoles(roles: UserRole[]): UserRole[] {
  const seen = new Set<UserRole>();
  const out: UserRole[] = [];
  const preferred: UserRole[] = ['seeker', 'employer'];
  for (const r of preferred) {
    if (roles.includes(r) && !seen.has(r)) {
      out.push(r);
      seen.add(r);
    }
  }
  for (const r of roles) {
    if (!seen.has(r)) {
      out.push(r);
      seen.add(r);
    }
  }
  return out;
}

async function getLinkedUserIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.query.userLinks.findMany({
    where: eq(userLinks.userId, userId),
    columns: { linkedUserId: true },
  });
  return rows.map((r) => r.linkedUserId);
}

export async function refresh(rawToken: string, ctx: ClientContext = {}): Promise<TokenPair> {
  const db = getDb();
  const payload = verifyRefreshToken(rawToken);

  const tokenHash = sha256(rawToken);
  const stored = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  });

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
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, stored.familyId), isNull(refreshTokens.revokedAt)));
    throw errors.refreshReused();
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw errors.tokenExpired();
  }

  // Valid + active — rotate.
  const newJti = randomUUID();
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), replacedBy: newJti })
    .where(eq(refreshTokens.id, stored.id));

  return mintAndStoreTokenPair({
    userId: payload.sub,
    role: await fetchRole(payload.sub),
    familyId: stored.familyId,
    jti: newJti,
    ctx,
  });
}

export async function logout(rawToken: string): Promise<void> {
  const db = getDb();
  const tokenHash = sha256(rawToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

/**
 * Read-only ownership check for a refresh token. Does NOT rotate, consume,
 * or revoke anything, and does NOT trip reuse detection.
 */
export async function inspectRefreshToken(
  rawToken: string,
): Promise<{ userId: string } | null> {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    return null;
  }

  const db = getDb();
  const stored = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, sha256(rawToken)),
  });
  if (!stored) return null;
  if (stored.revokedAt) return null;
  if (stored.expiresAt.getTime() <= Date.now()) return null;

  return { userId: payload.sub };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !user.isActive) throw errors.notFound('User not found');
  const linkedUserIds = await getLinkedUserIds(user.id);
  return toPublicUser(user, { linkedUserIds });
}

// ─── Password reset ───────────────────────────────────────────────────────
//
// Three-step phone-OTP flow, enumeration-safe: `requestPasswordReset`
// returns the same shape whether or not a user is on file.

export interface RequestPasswordResetResult {
  phone: string;
  expiresAt: string;
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<RequestPasswordResetResult> {
  const phone = canonicalisePhone(input.phone);
  const resetUsers = await pickResetUsers(phone);

  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  if (resetUsers.length > 0) {
    try {
      await issueOtp(resetUsers[0]!.id, phone);
    } catch (err) {
      logger.error({ err, phone }, 'password-reset OTP issue failed');
    }
  } else {
    logger.info({ phone }, 'password-reset requested for unknown phone');
  }

  return { phone, expiresAt: expiresAt.toISOString() };
}

/**
 * Active users matching a phone, ordered by createdAt ascending so the
 * "primary" user (the one whose id keys the OTP challenge) is deterministic
 * across issue + verify calls.
 */
async function pickResetUsers(canonicalPhone: string) {
  const db = getDb();
  return db.query.users.findMany({
    where: and(eq(users.phone, canonicalPhone), eq(users.isActive, true)),
    columns: { id: true, role: true },
    orderBy: (u, { asc }) => [asc(u.createdAt)],
  });
}

export interface VerifyResetCodeResult {
  resetToken: string;
  expiresIn: string;
}

export async function verifyResetCode(
  input: VerifyResetCodeInput,
): Promise<VerifyResetCodeResult> {
  const db = getDb();
  const phone = canonicalisePhone(input.phone);
  const resetUsers = await pickResetUsers(phone);
  if (resetUsers.length === 0) throw errors.otpInvalid();

  const primary = resetUsers[0]!;
  await verifyOtp(primary.id, phone, input.code);

  const jti = randomUUID();
  const resetToken = signResetToken({ sub: primary.id, jti });

  const tokenHash = sha256(jti);
  await db
    .update(users)
    .set({ passwordResetTokenHash: tokenHash })
    .where(
      inArray(
        users.id,
        resetUsers.map((u) => u.id),
      ),
    );

  return { resetToken, expiresIn: '15m' };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const db = getDb();
  const payload = verifyResetToken(input.resetToken);

  // Look users up BY HASH, not `sub` — this lets the same reset token
  // apply to every account sharing the phone the OTP was sent to.
  const expectedHash = sha256(payload.jti);
  const affected = await db.query.users.findMany({
    where: and(eq(users.passwordResetTokenHash, expectedHash), eq(users.isActive, true)),
    columns: { id: true },
  });

  if (affected.length === 0) {
    throw errors.resetTokenInvalid();
  }

  const affectedIds = affected.map((u) => u.id);
  const newHash = await hashPassword(input.newPassword);

  await db
    .update(users)
    .set({ passwordHash: newHash, passwordResetTokenHash: null })
    .where(inArray(users.id, affectedIds));

  // Belt-and-braces: revoke every outstanding refresh token for each
  // affected account.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(inArray(refreshTokens.userId, affectedIds), isNull(refreshTokens.revokedAt)));

  logger.info({ userIds: affectedIds, count: affectedIds.length }, 'password reset succeeded');
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function fetchRole(userId: string): Promise<UserRole> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  if (!user) throw errors.notFound('User not found');
  return user.role;
}

async function issueTokens(
  userId: string,
  role: UserRole,
  familyId: string,
  ctx: ClientContext,
): Promise<TokenPair> {
  return mintAndStoreTokenPair({ userId, role, familyId, jti: randomUUID(), ctx });
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
  const db = getDb();
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, fid: familyId, jti });

  await db.insert(refreshTokens).values({
    id: jti,
    userId,
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
 * Parse a TTL string like "15m" / "30d" / "2h" into milliseconds.
 */
function parseTtl(ttl: string): number {
  const m = /^(\d+)\s*([smhdw])$/.exec(ttl);
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit!];
  return value * mult!;
}
