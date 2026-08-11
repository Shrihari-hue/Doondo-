/**
 * Plain-function replacement for the Mongoose `User.toPublicJSON()`
 * instance method (src/modules/users/user.model.ts) now that rows come
 * back from Drizzle as plain objects, not hydrated documents.
 *
 * Same output shape as before (`PublicUser`) — this is a mechanical port,
 * not a contract change. `linkedUserIds` and `workPhotos` aren't columns on
 * the wide `users` row (see src/db/schema/users.ts), so callers fetch them
 * separately (user_links / work_photos tables) and pass them in; Phase 1's
 * auth flows never populate either, so both default to empty.
 */

import type { users } from '@/db/schema/users';
import type { PublicUser, CraftPhoto } from '@/modules/users/user.model';
import type { StreakCounterJson, StreaksJson, UserLocationJson } from '@/db/schema/users';

export type UserRow = typeof users.$inferSelect;

export interface ToPublicUserOpts {
  rating?: { avg: number; count: number } | null;
  linkedUserIds?: string[];
  workPhotos?: CraftPhoto[];
}

function flatLocation(loc: UserLocationJson | null | undefined) {
  if (!loc || (!loc.city && !loc.area && !loc.pincode && !loc.coordinates)) return null;
  return {
    city: loc.city ?? null,
    area: loc.area ?? null,
    pincode: loc.pincode ?? null,
    coordinates: loc.coordinates ?? null,
  };
}

function serializeStreak(s: StreakCounterJson | undefined): StreakCounterJson {
  return {
    current: s?.current ?? 0,
    longest: s?.longest ?? 0,
    totalDays: s?.totalDays ?? 0,
    lastDate: s?.lastDate ?? null,
  };
}

function serializeStreaks(s: StreaksJson): PublicUser['streaks'] {
  return {
    apply: serializeStreak(s.apply),
    course: serializeStreak(s.course),
    shift: serializeStreak(s.shift),
  };
}

/**
 * Profile-completion percent (0..100) — ported 1:1 from the Mongoose
 * model's computeProfileCompletion(). Different signals for seekers vs
 * employers, ~14% per field.
 */
export function computeProfileCompletion(u: UserRow): number {
  const seekerChecks = [
    Boolean(u.name && u.name.trim()),
    Boolean(u.phone && u.phone.trim()),
    Boolean(u.bio && u.bio.trim()),
    u.skills.length > 0,
    u.experienceYears != null,
    Boolean(u.availability),
    Boolean(u.location?.city),
    Boolean(u.resumeUploadedAt) || u.workHistory.length > 0,
  ];
  const employerChecks = [
    Boolean(u.name && u.name.trim()),
    Boolean(u.phone && u.phone.trim()),
    Boolean(u.companyName && u.companyName.trim()),
    Boolean(u.businessType),
    Boolean(u.bio && u.bio.trim()),
    Boolean(u.gstin && u.gstin.trim()),
    Boolean(u.employerLocation?.city),
  ];
  const checks = u.role === 'employer' ? employerChecks : seekerChecks;
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
}

export function toPublicUser(user: UserRow, opts: ToPublicUserOpts = {}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone ?? null,
    locale: user.locale ?? 'en',
    isVerified: user.isVerified,
    verificationStatus: user.verificationStatus ?? 'unverified',
    phoneVerified: Boolean(user.phoneVerifiedAt),
    verifiedAt: user.verifiedAt ? user.verifiedAt.toISOString() : null,
    linkedAccountIds: opts.linkedUserIds ?? [],
    skills: user.skills ?? [],
    bio: user.bio ?? null,
    experienceYears: user.experienceYears ?? null,
    availability: user.availability ?? null,
    preferredJobTypes: user.preferredJobTypes ?? [],
    workType: user.workType ?? null,
    teamSize: user.teamSize ?? null,
    expectedSalary: user.expectedSalary
      ? {
          amount: user.expectedSalary.amount,
          amountMax: user.expectedSalary.amountMax ?? null,
          period: user.expectedSalary.period,
          currency: user.expectedSalary.currency ?? 'INR',
        }
      : null,
    location: flatLocation(user.location),
    photoUrl: user.photoUrl ?? null,
    resumeUrl: user.resumeUrl ?? null,
    resumeFilename: user.resumeFilename ?? null,
    resumeMimeType: user.resumeMimeType ?? null,
    resumeSizeBytes: user.resumeSizeBytes ?? null,
    resumeUploadedAt: user.resumeUploadedAt ? user.resumeUploadedAt.toISOString() : null,
    workHistory: (user.workHistory ?? []).map((w) => ({
      company: w.company,
      role: w.role,
      startDate: w.startDate,
      endDate: w.endDate ?? null,
      current: Boolean(w.current),
      description: w.description ?? null,
    })),
    education: (user.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
      fieldOfStudy: e.fieldOfStudy ?? null,
      startYear: e.startYear,
      endYear: e.endYear ?? null,
      current: Boolean(e.current),
    })),
    workPhotos: opts.workPhotos ?? [],
    skillDocuments: (user.skillDocuments ?? []).map((d) => ({
      id: d.id,
      skill: d.skill,
      url: d.url,
      fileName: d.fileName,
      mimeType: d.mimeType,
      kind: d.kind,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt,
      extracted: d.extracted
        ? {
            title: d.extracted.title ?? null,
            issuer: d.extracted.issuer ?? null,
            issuedOn: d.extracted.issuedOn ?? null,
          }
        : null,
    })),
    companyName: user.companyName ?? null,
    businessType: user.businessType ?? null,
    gstin: user.gstin ?? null,
    employerLocation: flatLocation(user.employerLocation),
    profileCompletion: computeProfileCompletion(user),
    rating: opts.rating && opts.rating.count > 0 ? opts.rating : null,
    trustCircle: (user.trustCircle ?? []).map((c) => ({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship ?? null,
    })),
    isPeerResponder: Boolean(user.isPeerResponder),
    shareShiftsWithCircle: Boolean(user.shareShiftsWithCircle),
    streaks: serializeStreaks(user.streaks),
    createdAt: user.createdAt.toISOString(),
  };
}
