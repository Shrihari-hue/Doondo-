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
 */

import { errors } from '@/lib/errors';
import { UserModel, type PublicUser } from '@/modules/users/user.model';
import { canonicalisePhone, issueOtp, verifyOtp } from './otp.service';

export interface StartPhoneResult {
  phone: string;
  expiresAt: string;
}

/**
 * Step 1 — issue an OTP for the given phone.
 * The user must already be authenticated (req.user.id).
 */
export async function startPhoneVerification(
  userId: string,
  phone: string,
): Promise<StartPhoneResult> {
  // Reject if already fully verified — no need to redo the flow.
  const existing = await UserModel.findById(userId).select(
    'isVerified verificationStatus',
  );
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

  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found');
  if (user.isVerified) throw errors.verificationAlreadyVerified();

  // Persist the phone the user just proved. We canonicalise here too so
  // it always lands in the same E.164-ish form regardless of input shape.
  user.phone = canonicalisePhone(phone);
  user.phoneVerifiedAt = new Date();
  if (user.verificationStatus === 'unverified') {
    user.verificationStatus = 'pending';
  }
  await user.save();
  return user.toPublicJSON();
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
  // We need +selfiePhotoUrl explicitly because the field is select:false.
  const user = await UserModel.findById(userId).select('+selfiePhotoUrl');
  if (!user) throw errors.notFound('User not found');
  if (user.isVerified) throw errors.verificationAlreadyVerified();
  if (!user.phoneVerifiedAt) throw errors.verificationPhoneRequired();

  // Employer-side: require a present (and format-valid by schema) GSTIN.
  // The Mongoose match validator already enforces format on save, so we
  // only need to check presence here.
  if (user.role === 'employer' && (!user.gstin || !user.gstin.trim())) {
    throw errors.verificationGstinRequired();
  }

  user.selfiePhotoUrl = selfieUrl;
  user.verifiedAt = new Date();
  user.verificationStatus = 'verified';
  user.isVerified = true;
  await user.save();
  return user.toPublicJSON();
}
