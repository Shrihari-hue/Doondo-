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
import { Schema, Types } from 'mongoose';
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

/**
 * The login endpoint's return shape. A `LoginResult` is either a normal
 * `AuthSuccess` (user picked the right (email, role) combo on the first
 * try) OR a `LoginNeedsRoleChoice` payload, which the client uses to
 * render a role picker before re-submitting with `role` filled in.
 *
 * We chose a discriminated success-envelope instead of an error code
 * because "needs disambiguation" is a happy path: the user typed valid
 * credentials, we just don't know which of their accounts they mean.
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
  // Uniqueness is now (email, role) — same physical person can hold both
  // a seeker and an employer account on the same email. The compound
  // index on UserModel enforces this at the DB level; the explicit
  // lookup here gives us a clean AUTH_EMAIL_TAKEN error instead of a raw
  // duplicate-key crash from Mongo.
  const existing = await UserModel.findOne({
    email: input.email,
    role: input.role,
  }).lean();
  if (existing) throw errors.emailTaken();

  // Phone is required at signup so password reset works for every new
  // account. Canonicalise here so the value stored matches what the
  // verification / reset flows look up (both go through canonicalisePhone).
  const phone = canonicalisePhone(input.phone);

  const passwordHash = await hashPassword(input.password);

  // Look up accounts the new user is plausibly linked to BEFORE we
  // insert. "Linked" means same physical human: shares either the
  // email OR the phone with an already-active account. We use this both
  // to populate `linkedAccountIds` and to inherit phone-verification
  // status from any sibling account that already proved this phone via
  // OTP (no need to make the same human OTP twice).
  const siblings = await findSiblingAccounts(input.email, phone);

  // If at least one sibling has phoneVerifiedAt set AND shares THIS
  // phone, inherit the timestamp. We don't inherit `isVerified` /
  // `verificationStatus` because the full Phase 5 flow (selfie, GSTIN
  // format for employers) is role-specific — that has to be redone per
  // account. Only the phone-OTP step is safely transferable.
  const inheritedPhoneVerifiedAt = siblings.find(
    (s) => s.phone === phone && s.phoneVerifiedAt,
  )?.phoneVerifiedAt ?? null;

  const user = await UserModel.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: input.role,
    phone,
    phoneVerifiedAt: inheritedPhoneVerifiedAt,
    linkedAccountIds: siblings.map((s) => s._id),
    // Solo/Team only applies to seekers — quietly ignore for employers.
    workType: input.role === 'seeker' ? (input.workType ?? null) : null,
    teamSize:
      input.role === 'seeker' && input.workType === 'team'
        ? (input.teamSize ?? null)
        : null,
  });

  // Push the new user's id onto every sibling so the link is
  // bidirectional. `$addToSet` is a no-op if the entry is somehow
  // already there (defensive against re-runs).
  if (siblings.length > 0) {
    await UserModel.updateMany(
      { _id: { $in: siblings.map((s) => s._id) } },
      { $addToSet: { linkedAccountIds: user._id } },
    );
    logger.info(
      { userId: user.id, linkedTo: siblings.map((s) => s.id), count: siblings.length },
      'new account linked to sibling accounts',
    );
  }

  logger.info({ userId: user.id, role: user.role }, 'user registered');

  const tokens = await issueTokens(user.id, user.role, randomUUID(), ctx);
  return { user: user.toPublicJSON(), tokens };
}

/**
 * Find the set of existing active users that should be linked to a brand
 * new account. "Linked" = same physical person, which we infer from
 * shared email OR shared phone. Both anchors matter: a user might create
 * a second account with the same email but a freshly-bought phone (so
 * email-only match catches it), and conversely some users sign up to
 * Doondo on a phone they share with family (so phone-only match catches
 * mismatched-email pairs too).
 *
 * Returns ascending by _id for deterministic ordering — important so
 * downstream code (notification dedup, "primary" account selection)
 * behaves the same way across replicas.
 */
async function findSiblingAccounts(
  email: string,
  canonicalPhone: string,
): Promise<
  Array<{
    _id: Schema.Types.ObjectId;
    id: string;
    email: string;
    phone: string | null;
    phoneVerifiedAt: Date | null;
  }>
> {
  const candidates = await UserModel.find({
    isActive: true,
    $or: [{ email }, ...(canonicalPhone ? [{ phone: canonicalPhone }] : [])],
  })
    .select('_id email phone phoneVerifiedAt')
    .sort({ _id: 1 });

  // Casting because Mongoose's lean inference is loose; we explicitly
  // selected the fields we need so the runtime shape matches.
  return candidates as unknown as Array<{
    _id: Schema.Types.ObjectId;
    id: string;
    email: string;
    phone: string | null;
    phoneVerifiedAt: Date | null;
  }>;
}

export async function login(input: LoginInput, ctx: ClientContext = {}): Promise<LoginResult> {
  // One email can now belong to multiple users (one per role — the same
  // human can hold a seeker and an employer account on the same email).
  // `.find()` instead of `.findOne()` is the core change.
  //
  // .select('+passwordHash') because the field is select:false by default.
  const candidates = await UserModel.find({ email: input.email })
    .select('+passwordHash');
  const activeCandidates = candidates.filter((u) => u.isActive);

  if (activeCandidates.length === 0) throw errors.invalidCredentials();

  // Multi-account disambiguation. If the caller didn't pass a role and the
  // email is shared across roles, we don't even attempt password
  // verification — we return a 200 envelope telling the client to ask the
  // user which account they meant, then re-submit. This avoids leaking
  // password-correctness for either side-account during enumeration.
  if (activeCandidates.length > 1 && !input.role) {
    return {
      needsRoleChoice: true,
      // Deterministic order — seeker first if present, then employer, then
      // anything else — so the picker UI is stable across requests.
      availableRoles: dedupedRoles(activeCandidates.map((u) => u.role)),
    };
  }

  // Either there's exactly one user for this email, or the caller
  // narrowed it with `role`. Pick the target.
  const user = input.role
    ? activeCandidates.find((u) => u.role === input.role)
    : activeCandidates[0];

  // Treat "role you asked for doesn't exist for this email" as invalid
  // credentials. We don't want to confirm to a probe that role X exists
  // for this email but the password is wrong.
  if (!user) throw errors.invalidCredentials();

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
  // The user is back — clear the re-engagement attempt budget so that if
  // they lapse again later the dormant-user sweep can nudge them afresh.
  user.reengagementAttempts = 0;
  await user.save();

  const tokens = await issueTokens(user.id, user.role, randomUUID(), ctx);
  return { user: user.toPublicJSON(), tokens };
}

/**
 * Deterministic, deduped ordering of the roles attached to a shared email.
 * The mobile picker uses this list verbatim, so we keep it stable: seeker
 * first (covers the typical "I'm a worker first, employer second" path),
 * then employer, then anything else in insertion order.
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

/**
 * Read-only ownership check for a refresh token.
 *
 * Unlike `refresh()` this does NOT rotate, consume, or revoke anything —
 * it merely confirms the token is cryptographically valid, present in
 * the store, not revoked, and not expired, then returns the user it
 * belongs to. It also does NOT trip reuse detection: we never present a
 * revoked token here, we just read.
 *
 * Used by the cross-account activity summary so the account switcher can
 * show a badge for a worker's *other* account without burning a refresh
 * rotation (and risking a reuse-race) on every Profile open.
 *
 * Returns `null` for any token that fails a check — callers treat that
 * as "no summary for this account" rather than an error.
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

  const stored = await RefreshTokenModel.findOne({
    tokenHash: sha256(rawToken),
  }).lean();
  if (!stored) return null;
  if (stored.revokedAt) return null;
  if (stored.expiresAt.getTime() <= Date.now()) return null;

  return { userId: payload.sub };
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
  //
  // Why `find()` (plural): one phone can legitimately belong to multiple
  // accounts now — the same human signs up as a seeker AND as an employer
  // on the same phone (see the (email, role) compound index on
  // UserModel). The OTP only proves "the holder of this phone is in front
  // of us", so we issue a single OTP keyed off whichever user comes back
  // first; verify uses the same key.
  const users = await pickResetUsers(phone);

  // Default expiry hint matches the SMS provider's TTL.
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  if (users.length > 0) {
    try {
      await issueOtp(users[0]!.id, phone);
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

/**
 * Resolve the set of users a phone-based password reset should affect.
 *
 * Returns active users sorted by _id ascending so the "primary" user
 * (the one whose userId we use as the OTP key) is deterministic across
 * issue + verify calls — without this the OtpChallenge issue/verify
 * pair could mismatch when more than one user shares the phone.
 */
async function pickResetUsers(canonicalPhone: string) {
  return UserModel.find({ phone: canonicalPhone, isActive: true })
    .select('_id role')
    .sort({ _id: 1 });
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
  const users = await pickResetUsers(phone);
  // No matching user → treat the same as a wrong code. Same response,
  // same status. Anything more specific would leak.
  if (users.length === 0) throw errors.otpInvalid();

  // The OTP was issued under the primary user's id (see
  // requestPasswordReset). Verify against that SAME id so we hit the
  // right OtpChallenge row when multiple users share the phone.
  // Throws otpInvalid / otpExpired / otpTooMany on the corresponding
  // failure modes. On success the OTP challenge is marked consumed.
  const primary = users[0]!;
  await verifyOtp(primary.id, phone, input.code);

  // Mint a single-use reset token. We store the SHA-256 of its jti on the
  // user; /auth/reset-password compares to detect reuse / forgery.
  //
  // For shared-phone reset we STAMP THE HASH ON EVERY USER bound to this
  // phone — that's how /auth/reset-password later finds all of them via
  // a single hash lookup. The reset token itself carries the primary
  // user's id in `sub` for backward compatibility, but the find at
  // reset-time is by hash, not by `sub`.
  const jti = new Types.ObjectId().toHexString();
  const resetToken = signResetToken({ sub: primary.id, jti });

  const tokenHash = sha256(jti);
  await UserModel.updateMany(
    { _id: { $in: users.map((u) => u._id) } },
    { $set: { passwordResetTokenHash: tokenHash } },
  );

  return { resetToken, expiresIn: '15m' };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  // verifyResetToken throws AUTH_RESET_TOKEN_INVALID / _EXPIRED for us.
  const payload = verifyResetToken(input.resetToken);

  // Look the user(s) up BY HASH, not by the token's `sub`. This lets the
  // same reset token apply to every user we stamped in verifyResetCode —
  // i.e. every account sharing the phone the OTP was sent to. Filtering
  // by isActive at the same time keeps deactivated accounts out of the
  // sweep.
  const expectedHash = sha256(payload.jti);
  const users = await UserModel.find({
    passwordResetTokenHash: expectedHash,
    isActive: true,
  }).select('+passwordHash +passwordResetTokenHash');

  if (users.length === 0) {
    // Either already consumed (we cleared every hash on a prior success)
    // or forged (signed jti doesn't match any record). Both are "invalid".
    throw errors.resetTokenInvalid();
  }

  // Same new password hash on every affected account — the user picked
  // ONE new password for "their account on Doondo", and that intent
  // applies equally to the seeker and employer halves.
  const newHash = await hashPassword(input.newPassword);

  await Promise.all(
    users.map(async (user) => {
      user.passwordHash = newHash;
      user.passwordResetTokenHash = null; // single-use: burn it now.
      await user.save();
    }),
  );

  // Belt-and-braces: revoke every outstanding refresh token for each
  // affected user. A successful reset implies "I've lost control of one
  // device" — log all sessions out so an attacker who slipped a refresh
  // token through can't continue. The user signs in fresh on the next
  // screen, and (for the multi-account case) gets to pick which one.
  await RefreshTokenModel.updateMany(
    { userId: { $in: users.map((u) => u._id) }, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  logger.info(
    { userIds: users.map((u) => u.id), count: users.length },
    'password reset succeeded',
  );
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
