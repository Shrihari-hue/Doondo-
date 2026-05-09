/**
 * /me service — operations on the authenticated user's own record.
 *
 * Strict rule: never mutate role, email, isVerified, isActive, or any
 * passwordHash field through this service. Those go through dedicated
 * flows that have their own verification + audit story.
 */

import { errors } from '@/lib/errors';
import { UserModel, type PublicUser } from '@/modules/users/user.model';

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
  photoUrl?: string | null;
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
  if (input.workType !== undefined) {
    user.workType = input.workType;
    // If switching back to solo, clear teamSize so the docs stay tidy.
    if (input.workType !== 'team' && input.teamSize === undefined) {
      user.teamSize = null;
    }
  }
  if (input.teamSize !== undefined) user.teamSize = input.teamSize;
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
