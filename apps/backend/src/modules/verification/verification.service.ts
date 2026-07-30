/**
 * Verification service — owns the state machine that flips a user from
 * "unverified" to "verified" once all checks pass.
 *
 * Flow (badge-only, v1):
 *   unverified ─[startPhone]→ unverified  (challenge issued, no state change yet)
 *   unverified ─[verifyPhone]→ pending    (phone proven, store on user)
 *   pending ─[uploadSelfie]→ verified     (selfie stored, isVerified=true,
 *                                          for employers also requires a
 *                                          format-valid GSTIN to be present)
 *
 * `verified` is sticky. Re-running the flow would be admin-driven (rejected
 * → unverified) which we'll add when we add the admin console.
 *
 * Ported from Mongoose to Postgres/Drizzle (Phase 1 of the Mongo→Postgres
 * migration) — behavior is unchanged; only the storage layer moved.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { users, userLinks } from '@/db/schema/users';
import type { PublicUser } from '@/modules/users/user.model';
import { toPublicUser } from '@/modules/users/user.serializers';
import { canonicalisePhone, issueOtp, verifyOtp } from './otp.service';

export interface StartPhoneResult {
  phone: string;
  expiresAt: string;
}

async function getLinkedUserIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.query.userLinks.findMany({
    where: eq(userLinks.userId, userId),
    columns: { linkedUserId: true },
  });
  return rows.map((r) => r.linkedUserId);
}

/**
 * Step 1 — issue an OTP for the given phone.
 * The user must already be authenticated (req.user.id).
 */
export async function startPhoneVerification(
  userId: string,
  phone: string,
): Promise<StartPhoneResult> {
  const db = getDb();
  // Reject if already fully verified — no need to redo the flow.
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isVerified: true, verificationStatus: true },
  });
  if (!existing) throw errors.notFound('User not found');
  if (existing.isVerified) throw errors.verificationAlreadyVerified();

  const { phone: canonical, expiresAt } = await issueOtp(userId, phone);
  return { phone: canonical, expiresAt: expiresAt.toISOString() };
}

/**
 * Step 2 — confirm the OTP and persist phone + phoneVerifiedAt.
 * Moves verificationStatus from 'unverified' → 'pending'.
 */
export async function confirmPhoneVerification(
  userId: string,
  phone: string,
  code: string,
): Promise<PublicUser> {
  await verifyOtp(userId, phone, code);

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw errors.notFound('User not found');
  if (user.isVerified) throw errors.verificationAlreadyVerified();

  // Persist the phone the user just proved. We canonicalise here too so it
  // always lands in the same E.164-ish form regardless of input shape.
  const canonicalPhone = canonicalisePhone(phone);
  const verifiedAt = new Date();

  const [updated] = await db
    .update(users)
    .set({
      phone: canonicalPhone,
      phoneVerifiedAt: verifiedAt,
      verificationStatus:
        user.verificationStatus === 'unverified' ? 'pending' : user.verificationStatus,
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new Error('user update returned no row');

  // Propagate to linked sibling accounts that share THIS phone — same
  // human, same phone, the OTP they would otherwise re-do is redundant.
  // We don't touch sibling verificationStatus because the full flow
  // (selfie/GSTIN) is still role-specific; only the phone step is safely
  // transferable. Scope is narrow: only siblings that are linked AND
  // share the phone AND haven't already been proven.
  const linkedUserIds = await getLinkedUserIds(userId);
  if (linkedUserIds.length > 0) {
    await db
      .update(users)
      .set({ phoneVerifiedAt: verifiedAt })
      .where(
        and(
          inArray(users.id, linkedUserIds),
          eq(users.phone, canonicalPhone),
          isNull(users.phoneVerifiedAt),
        ),
      );
  }

  return toPublicUser(updated, { linkedUserIds });
}

/**
 * Step 3 — store the selfie and finalise verification.
 * Requires phoneVerifiedAt to be set; for employers also requires a
 * format-valid GSTIN already on the profile.
 */
export async function submitSelfieAndFinalise(
  userId: string,
  selfieUrl: string,
): Promise<PublicUser> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw errors.notFound('User not found');
  if (user.isVerified) throw errors.verificationAlreadyVerified();
  if (!user.phoneVerifiedAt) throw errors.verificationPhoneRequired();

  // Employer-side: require a present GSTIN (format is validated at write
  // time by auth.schemas/me.schemas, not enforced by the DB — same as the
  // original Mongoose match validator, which only checked format on save).
  if (user.role === 'employer' && (!user.gstin || !user.gstin.trim())) {
    throw errors.verificationGstinRequired();
  }

  const [updated] = await db
    .update(users)
    .set({
      selfiePhotoUrl: selfieUrl,
      verifiedAt: new Date(),
      verificationStatus: 'verified',
      isVerified: true,
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw new Error('user update returned no row');

  const linkedUserIds = await getLinkedUserIds(userId);
  return toPublicUser(updated, { linkedUserIds });
}
