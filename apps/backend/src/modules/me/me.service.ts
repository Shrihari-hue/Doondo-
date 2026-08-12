/**
 * /me service — operations on the authenticated user's own record.
 *
 * Strict rule: never mutate role, email, isVerified, isActive, or any
 * passwordHash field through this service. Those go through dedicated
 * flows that have their own verification + audit story.
 */

import { asc, eq } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { users, workPhotos as workPhotosTable, type EducationJson, type WorkExperienceJson } from '@/db/schema';
import { toPublicUser } from '@/modules/users/user.serializers';
import type {
  CraftPhoto,
  ExpectedSalary,
  PublicUser,
} from '@/modules/users/user.model';
import { isGallerySkill } from '@/modules/skills/skill.catalogue';

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
  workPhotos?: CraftPhoto[];
  /** Replace the education list. Empty array clears the section. */
  education?: Array<{
    degree: string;
    institution: string;
    fieldOfStudy?: string | null;
    startYear: number;
    endYear?: number | null;
    current?: boolean;
  }>;
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

/** Current work-photo rows for a user, in display order. */
async function getWorkPhotos(userId: string): Promise<CraftPhoto[]> {
  const rows = await getDb()
    .select()
    .from(workPhotosTable)
    .where(eq(workPhotosTable.userId, userId))
    .orderBy(asc(workPhotosTable.orderIndex));
  return rows.map((r) => ({ url: r.url, skill: r.skill, caption: r.caption ?? null, isCover: r.isCover }));
}

/** Replace all of a user's work photos with the supplied ordered list. */
async function replaceWorkPhotos(userId: string, photos: CraftPhoto[]): Promise<void> {
  const db = getDb();
  await db.delete(workPhotosTable).where(eq(workPhotosTable.userId, userId));
  if (photos.length === 0) return;
  await db.insert(workPhotosTable).values(
    photos.map((p, i) => ({
      userId,
      url: p.url,
      skill: p.skill,
      caption: p.caption ?? null,
      isCover: Boolean(p.isCover),
      orderIndex: i,
    })),
  );
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw errors.notFound('User not found');

  const patch: Partial<typeof users.$inferInsert> = {};

  if (input.name !== undefined) patch.name = input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.experienceYears !== undefined) patch.experienceYears = input.experienceYears;
  if (input.availability !== undefined) patch.availability = input.availability;
  if (input.preferredJobTypes !== undefined) patch.preferredJobTypes = input.preferredJobTypes;

  let nextSkills = user.skills;
  if (input.skills !== undefined) {
    // Dedupe + lowercase normalise — keeps "Driving" and "driving" from
    // splitting the same skill into two on the user.
    nextSkills = [
      ...new Set(input.skills.map((s) => s.trim().toLowerCase()).filter(Boolean)),
    ];
    patch.skills = nextSkills;
  }
  if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;

  let nextWorkPhotos: CraftPhoto[] | undefined;
  if (input.workPhotos !== undefined) {
    // PUT semantics — the array on the wire replaces what's stored (the
    // 6-photo cap is mirrored in the zod schema). Every photo must be
    // tagged to one of the worker's own *gallery*-type craft skills: a
    // photo tagged to a non-craft skill — or to a craft the worker
    // doesn't claim — would never render in a collection, so reject it
    // loudly rather than store an orphan. `nextSkills` is already the
    // updated list here (the skills block above runs first).
    const gallerySkills = new Set(nextSkills.filter(isGallerySkill));
    for (const photo of input.workPhotos) {
      if (!gallerySkills.has(photo.skill)) {
        throw errors.validation(
          { skill: photo.skill },
          `Photo skill "${photo.skill}" must be one of your craft skills.`,
        );
      }
    }
    nextWorkPhotos = input.workPhotos.map((p) => ({
      url: p.url,
      skill: p.skill,
      caption: p.caption ?? null,
      isCover: Boolean(p.isCover),
    }));
  }

  if (input.education !== undefined) {
    const cleaned: EducationJson[] = input.education.map((e) => ({
      degree: e.degree.trim(),
      institution: e.institution.trim(),
      fieldOfStudy: e.fieldOfStudy?.trim() || null,
      startYear: e.startYear,
      endYear: e.current ? null : e.endYear ?? null,
      current: Boolean(e.current),
    }));
    patch.education = cleaned;
  }
  if (input.workType !== undefined) {
    patch.workType = input.workType;
    // If switching back to solo, clear teamSize so the docs stay tidy.
    if (input.workType !== 'team' && input.teamSize === undefined) {
      patch.teamSize = null;
    }
  }
  if (input.teamSize !== undefined) patch.teamSize = input.teamSize;
  if (input.expectedSalary !== undefined) {
    patch.expectedSalary = input.expectedSalary
      ? {
          amount: input.expectedSalary.amount,
          amountMax:
            input.expectedSalary.amountMax != null
              ? input.expectedSalary.amountMax
              : null,
          period: input.expectedSalary.period,
          currency: input.expectedSalary.currency || 'INR',
        }
      : null;
  }
  if (input.companyName !== undefined) patch.companyName = input.companyName;
  if (input.businessType !== undefined) patch.businessType = input.businessType;
  if (input.gstin !== undefined) patch.gstin = input.gstin;

  const [updated] = Object.keys(patch).length > 0
    ? await db.update(users).set(patch).where(eq(users.id, userId)).returning()
    : [user];

  if (nextWorkPhotos !== undefined) {
    await replaceWorkPhotos(userId, nextWorkPhotos);
  } else {
    nextWorkPhotos = await getWorkPhotos(userId);
  }

  return toPublicUser(updated!, { workPhotos: nextWorkPhotos });
}

export async function registerPushToken(
  userId: string,
  token: string,
): Promise<void> {
  // Idempotent — array_append with a prior dedupe read avoids double-adding.
  const db = getDb();
  const [user] = await db.select({ expoPushTokens: users.expoPushTokens }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.expoPushTokens.includes(token)) return;
  await db.update(users).set({ expoPushTokens: [...user.expoPushTokens, token] }).where(eq(users.id, userId));
}

export async function clearPushToken(userId: string, token: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select({ expoPushTokens: users.expoPushTokens }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;
  await db.update(users).set({ expoPushTokens: user.expoPushTokens.filter((t) => t !== token) }).where(eq(users.id, userId));
}

export async function updateEmployerLocation(
  userId: string,
  input: { city: string; area?: string | null; pincode?: string | null; lat: number; lng: number },
): Promise<PublicUser> {
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      employerLocation: {
        city: input.city,
        area: input.area ?? null,
        pincode: input.pincode ?? null,
        coordinates: [input.lng, input.lat],
      },
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw errors.notFound('User not found');

  const workPhotosList = await getWorkPhotos(userId);
  return toPublicUser(updated, { workPhotos: workPhotosList });
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
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      location: {
        city: input.city,
        area: input.area ?? null,
        pincode: input.pincode ?? null,
        coordinates: [input.lng, input.lat],
      },
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw errors.notFound('User not found');

  const workPhotosList = await getWorkPhotos(userId);
  return toPublicUser(updated, { workPhotos: workPhotosList });
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
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      resumeUrl: input.dataUrl,
      resumeFilename: input.filename,
      resumeMimeType: input.mimeType,
      resumeSizeBytes: input.sizeBytes,
      resumeUploadedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw errors.notFound('User not found');

  const workPhotosList = await getWorkPhotos(userId);
  return toPublicUser(updated, { workPhotos: workPhotosList });
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
  const cleaned: WorkExperienceJson[] = input.entries.map((e) => ({
    company: e.company.trim(),
    role: e.role.trim(),
    startDate: e.startDate,
    endDate: e.current ? null : e.endDate ?? null,
    current: Boolean(e.current),
    description: e.description?.trim() || null,
  }));

  const db = getDb();
  const [updated] = await db.update(users).set({ workHistory: cleaned }).where(eq(users.id, userId)).returning();
  if (!updated) throw errors.notFound('User not found');

  const workPhotosList = await getWorkPhotos(userId);
  return toPublicUser(updated, { workPhotos: workPhotosList });
}

/**
 * Remove the user's resume entirely. Clears all five fields so the
 * "has resume" badge / profileCompletion drops back accordingly.
 */
export async function removeResume(userId: string): Promise<PublicUser> {
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      resumeUrl: null,
      resumeFilename: null,
      resumeMimeType: null,
      resumeSizeBytes: null,
      resumeUploadedAt: null,
    })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) throw errors.notFound('User not found');

  const workPhotosList = await getWorkPhotos(userId);
  return toPublicUser(updated, { workPhotos: workPhotosList });
}
