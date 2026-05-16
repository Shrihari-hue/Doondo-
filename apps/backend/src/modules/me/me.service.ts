/**
 * /me service — operations on the authenticated user's own record.
 *
 * Strict rule: never mutate role, email, isVerified, isActive, or any
 * passwordHash field through this service. Those go through dedicated
 * flows that have their own verification + audit story.
 */

import { errors } from '@/lib/errors';
import {
  UserModel,
  type ExpectedSalary,
  type PublicUser,
  type WorkExperience,
} from '@/modules/users/user.model';

interface UpdateProfileInput {
  name?: string;
  phone?: string | null;
  bio?: string | null;
  experienceYears?: number | null;
  availability?: 'immediate' | 'within_1_week' | 'within_1_month' | 'flexible' | null;
  preferredJobTypes?: ('full_time' | 'part_time' | 'gig' | 'shift' | 'contract')[];
  skills?: string[];
  workType?: 'solo' | 'team' | null;
  teamSize?: number | null;
  expectedSalary?: ExpectedSalary | null;
  photoUrl?: string | null;
  /** Replace the whole list. Empty array clears all work-sample photos. */
  workPhotos?: string[];
  // Employer (Phase 3)
  companyName?: string | null;
  businessType?:
    | 'individual'
    | 'shop'
    | 'restaurant'
    | 'salon'
    | 'agency'
    | 'startup'
    | 'enterprise'
    | 'other'
    | null;
  gstin?: string | null;
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found');

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.bio !== undefined) user.bio = input.bio;
  if (input.experienceYears !== undefined) user.experienceYears = input.experienceYears;
  if (input.availability !== undefined) user.availability = input.availability;
  if (input.preferredJobTypes !== undefined) user.preferredJobTypes = input.preferredJobTypes;
  if (input.skills !== undefined) {
    // Dedupe + lowercase normalise — keeps "Driving" and "driving" from
    // splitting the same skill into two on the user.
    user.skills = [
      ...new Set(input.skills.map((s) => s.trim().toLowerCase()).filter(Boolean)),
    ];
  }
  if (input.photoUrl !== undefined) user.photoUrl = input.photoUrl;
  if (input.workPhotos !== undefined) {
    // PUT semantics — the array on the wire is the array stored. The
    // model cap (6) is mirrored in the zod schema so anything that
    // reaches this point is already bounded.
    user.workPhotos = input.workPhotos;
  }
  if (input.workType !== undefined) {
    user.workType = input.workType;
    // If switching back to solo, clear teamSize so the docs stay tidy.
    if (input.workType !== 'team' && input.teamSize === undefined) {
      user.teamSize = null;
    }
  }
  if (input.teamSize !== undefined) user.teamSize = input.teamSize;
  if (input.expectedSalary !== undefined) {
    user.expectedSalary = input.expectedSalary
      ? {
          amount: input.expectedSalary.amount,
          period: input.expectedSalary.period,
          currency: input.expectedSalary.currency || 'INR',
        }
      : null;
  }
  if (input.companyName !== undefined) user.companyName = input.companyName;
  if (input.businessType !== undefined) user.businessType = input.businessType;
  if (input.gstin !== undefined) user.gstin = input.gstin;

  await user.save();
  return user.toPublicJSON();
}

export async function registerPushToken(
  userId: string,
  token: string,
): Promise<void> {
  // Idempotent — addToSet de-dupes per (user, token).
  await UserModel.updateOne(
    { _id: userId },
    { $addToSet: { expoPushTokens: token } },
  );
}

export async function clearPushToken(userId: string, token: string): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $pull: { expoPushTokens: token } },
  );
}

export async function updateEmployerLocation(
  userId: string,
  input: { city: string; area?: string | null; pincode?: string | null; lat: number; lng: number },
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found');

  user.employerLocation = {
    city: input.city,
    area: input.area ?? null,
    pincode: input.pincode ?? null,
    geo: { type: 'Point', coordinates: [input.lng, input.lat] },
  };
  await user.save();
  return user.toPublicJSON();
}

interface UpdateLocationInput {
  city: string;
  area?: string | null;
  pincode?: string | null;
  lat: number;
  lng: number;
}

export async function updateLocation(
  userId: string,
  input: UpdateLocationInput,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found');

  user.location = {
    city: input.city,
    area: input.area ?? null,
    pincode: input.pincode ?? null,
    geo: {
      type: 'Point',
      coordinates: [input.lng, input.lat],
    },
  };
  await user.save();
  return user.toPublicJSON();
}

// ─── Resume ─────────────────────────────────────────────────────────────────

interface UploadResumeInput {
  dataUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload (or replace) the user's resume. Single active resume per user;
 * any existing one is overwritten. Idempotent at the DB level — same
 * payload uploaded twice yields the same end state.
 */
export async function uploadResume(
  userId: string,
  input: UploadResumeInput,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId).select('+resumeUrl');
  if (!user) throw errors.notFound('User not found');

  user.resumeUrl = input.dataUrl;
  user.resumeFilename = input.filename;
  user.resumeMimeType = input.mimeType;
  user.resumeSizeBytes = input.sizeBytes;
  user.resumeUploadedAt = new Date();
  await user.save();
  return user.toPublicJSON();
}

// ─── Resume Builder ────────────────────────────────────────────────────────

interface UpdateWorkHistoryInput {
  entries: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string | null;
    current?: boolean;
    description?: string | null;
  }>;
}

/**
 * Replace the user's work history with the supplied list. PUT-style:
 * the array on the wire is the array stored. Sorting is left to the
 * client — but we defensively re-sort newest-first on read in the UI.
 *
 * Normalises `current === true` so endDate is always null in that case,
 * and trims strings so user-pasted whitespace doesn't accumulate.
 */
export async function updateWorkHistory(
  userId: string,
  input: UpdateWorkHistoryInput,
): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User not found');

  const cleaned: WorkExperience[] = input.entries.map((e) => ({
    company: e.company.trim(),
    role: e.role.trim(),
    startDate: e.startDate,
    endDate: e.current ? null : e.endDate ?? null,
    current: Boolean(e.current),
    description: e.description?.trim() || null,
  }));

  user.workHistory = cleaned;
  await user.save();
  return user.toPublicJSON();
}

/**
 * Remove the user's resume entirely. Clears all five fields so the
 * "has resume" badge / profileCompletion drops back accordingly.
 */
export async function removeResume(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId).select('+resumeUrl');
  if (!user) throw errors.notFound('User not found');

  user.resumeUrl = null;
  user.resumeFilename = null;
  user.resumeMimeType = null;
  user.resumeSizeBytes = null;
  user.resumeUploadedAt = null;
  await user.save();
  return user.toPublicJSON();
}
