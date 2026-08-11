/**
 * User types — shared shapes for the core identity + profile record.
 * The actual row lives in Postgres (see src/db/schema/users.ts); this
 * file holds the pure TS types/consts still shared across routes,
 * schemas, and serializers.
 */

import type { UserRole } from '@/lib/jwt';
import type { CraftPhoto } from '@/modules/skills/skill.catalogue';

export type { CraftPhoto } from '@/modules/skills/skill.catalogue';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const AVAILABILITIES = ['immediate', 'within_1_week', 'within_1_month', 'flexible'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const PREFERRED_JOB_TYPES = [
  'full_time',
  'part_time',
  'gig',
  'shift',
  'contract',
] as const;
export type PreferredJobType = (typeof PREFERRED_JOB_TYPES)[number];

export const SALARY_PERIODS = ['hour', 'day', 'week', 'month', 'fixed'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/**
 * Seeker's desired pay. Mirrors the same shape as a Job's `pay` so the
 * frontend can format both with one helper. Amount is in minor units
 * (paise for INR) — keeps everything integer + scale-safe.
 */
export interface ExpectedSalary {
  /** Lower bound (paise). The "I'd at least take this" number. */
  amount: number;
  /**
   * Upper bound (paise). Null for seekers who picked a single number
   * (most blue-collar daily-wage cases). White-collar candidates tend
   * to set both to negotiate in a range.
   */
  amountMax?: number | null;
  period: SalaryPeriod;
  currency: string;
}

/**
 * A single past-job entry from the seeker's resume builder.
 *
 * Dates are stored as YYYY-MM strings (not Date) because most blue-collar
 * workers can't remember the exact day they started a job, only the
 * month. Storing as a string also dodges timezone weirdness.
 *
 * `current === true` means the seeker is still working that job; in
 * that case `endDate` is ignored.
 */
export interface WorkExperience {
  /** Employer / business name. */
  company: string;
  /** Role / job title (e.g. "Delivery rider", "Cook helper"). */
  role: string;
  /** YYYY-MM, e.g. "2023-04". */
  startDate: string;
  /** YYYY-MM. Null when `current === true`. */
  endDate?: string | null;
  /** Still working this job. When true we render "Present" in the UI. */
  current: boolean;
  /** Free-form 1-3 line description. Optional — many workers skip it. */
  description?: string | null;
}

/**
 * Education row on the resume — mandatory for white-collar candidates,
 * optional for blue-collar. Years only (not full dates) because workers
 * rarely remember exact months for school. `current === true` means
 * still studying.
 */
export interface Education {
  /** Degree / diploma / certificate name ("B.Com", "ITI Electrician"). */
  degree: string;
  /** School, college, polytechnic, or training centre. */
  institution: string;
  /** Field of study — optional, useful for white-collar. */
  fieldOfStudy?: string | null;
  /** Four-digit year. Required. */
  startYear: number;
  /** Four-digit year. Null when `current === true`. */
  endYear?: number | null;
  current: boolean;
}

export const WORK_TYPES = ['solo', 'team'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/**
 * Streak counter for a single kind of activity (apply / course / shift).
 *
 * Tracked client-side as YYYY-MM-DD strings in India Standard Time so a
 * worker who applies at 11pm and again at 1am the next day gets a
 * streak bump, not a reset. `current` is the rolling consecutive count;
 * `longest` is the personal best (never decreases); `totalDays` is the
 * lifetime count of distinct active days (drives "X total apply days"
 * lines on Profile).
 *
 * `lastDate` null = the user has never done this activity. `current` is
 * always >= 0 and reflects how many consecutive days up to and
 * including `lastDate` they were active.
 */
export interface StreakCounter {
  current: number;
  longest: number;
  totalDays: number;
  /** YYYY-MM-DD in IST. Null until first activity. */
  lastDate?: string | null;
}

/**
 * One person in the seeker's safety Trust Circle.
 *
 * Each entry is a contact who will be pinged on SOS in addition to the
 * on-device emergency contact. We store name + phone + an optional
 * relationship label so the recipient's notification reads naturally
 * ("Priya's brother sent an SOS" vs "Priya from Doondo").
 */
export interface TrustCircleContact {
  name: string;
  phone: string;
  /** Short relationship label: 'family' | 'friend' | 'employer' | other. */
  relationship?: string | null;
}

/**
 * Doondo Constitution — a seeker's personal, public work rules. The
 * worker sets their own boundaries; an employer sees them on the
 * applicant view, so a bad fit is filtered out *before* anyone wastes
 * an interview. A dignifying inversion: the worker sets the terms.
 *
 * The pay floor lives in `expectedSalary` already, so the Constitution
 * captures only the non-wage boundaries.
 */
export interface SeekerConstitution {
  /** Max distance the worker will travel for a job, km. Null = no limit. */
  maxDistanceKm?: number | null;
  /** Won't take night shifts. */
  noNightShifts: boolean;
  /** Won't work on Sundays. */
  noSundays: boolean;
  /** Requires the employer to provide safety equipment (PPE). */
  requiresPpe: boolean;
  /** Requires a written contract. */
  requiresContract: boolean;
}

/** Kind of a skill-proof file — inferred from the MIME type on upload. */
export const SKILL_DOC_KINDS = ['document', 'photo'] as const;
export type SkillDocumentKind = (typeof SKILL_DOC_KINDS)[number];

/**
 * What OCR read out of a skill-proof document on upload — drives a
 * human-meaningful display ("ITI Electrician Certificate · Govt ITI ·
 * 2019") instead of a raw filename. All fields are nullable: a blurry
 * photo or a non-document yields nulls.
 */
export interface SkillDocumentExtraction {
  /** What the document is. */
  title: string | null;
  /** Who issued it. */
  issuer: string | null;
  /** Issue date as printed. */
  issuedOn: string | null;
}

/**
 * A file the worker uploaded as proof of one skill — a certificate, a
 * licence, a training document, or a photo. The file itself lives on
 * cloud storage (see fileStorage.service); only the URL + metadata are
 * kept here. Employers see these grouped by skill on the applicant view.
 */
export interface SkillDocument {
  /** Stable id (generated on upload) — used for deletes. */
  id: string;
  /** Skill slug this document is proof for. */
  skill: string;
  /** CDN URL of the stored file. */
  url: string;
  /** Original file name, shown in the UI. */
  fileName: string;
  mimeType: string;
  kind: SkillDocumentKind;
  sizeBytes: number;
  uploadedAt: Date;
  /** OCR read of the document — null when extraction found nothing. */
  extracted?: SkillDocumentExtraction | null;
}

/** Wire shape of a SkillDocument — `uploadedAt` serialised to ISO. */
export interface PublicSkillDocument {
  id: string;
  skill: string;
  url: string;
  fileName: string;
  mimeType: string;
  kind: SkillDocumentKind;
  sizeBytes: number;
  uploadedAt: string;
  /** OCR read of the document — null when extraction found nothing. */
  extracted: SkillDocumentExtraction | null;
}

export const BUSINESS_TYPES = [
  'individual',
  'shop',
  'restaurant',
  'salon',
  'agency',
  'startup',
  'enterprise',
  'other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface UserLocation {
  city?: string | null;
  area?: string | null;
  pincode?: string | null;
  geo?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  } | null;
}

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone: string | null;
  /** Preferred app language (en/hi/ta/te/kn) — drives chat auto-translate. */
  locale: string;
  isVerified: boolean;
  /** Granular verification state — drives the ProfileScreen verification card. */
  verificationStatus: VerificationStatus;
  /** Whether the phone OTP step has been completed. */
  phoneVerified: boolean;
  /** ISO timestamp when verification fully passed; null otherwise. */
  verifiedAt: string | null;
  /**
   * Ids of other User records that represent the same physical person —
   * populated when the user holds a seeker AND an employer account on
   * the same email/phone. Mobile uses this to (a) decorate the account
   * switcher pill so the user sees "this is your linked account", and
   * (b) suppress duplicate notifications across linked sessions.
   */
  linkedAccountIds: string[];
  // ─── Seeker profile ───────────────────────────────────────────────────────
  skills: string[];
  bio: string | null;
  experienceYears: number | null;
  availability: Availability | null;
  preferredJobTypes: PreferredJobType[];
  workType: WorkType | null;
  teamSize: number | null;
  /** Seeker's desired pay, or null if unset. */
  expectedSalary: ExpectedSalary | null;
  location: {
    city: string | null;
    area: string | null;
    pincode: string | null;
    coordinates: [number, number] | null;
  } | null;
  photoUrl: string | null;
  // Resume (seeker)
  resumeUrl: string | null;
  resumeFilename: string | null;
  resumeMimeType: string | null;
  resumeSizeBytes: number | null;
  resumeUploadedAt: string | null;
  /** Work history entries from the Resume Builder. Empty when never used. */
  workHistory: WorkExperience[];
  /** Education entries. Empty when the seeker hasn't added any. */
  education: Education[];
  /** Photos of the seeker's work — up to 6 entries, each tagged to a craft skill. */
  workPhotos: CraftPhoto[];
  /** Worker-uploaded proof files (certificates, licences, photos) per skill. */
  skillDocuments: PublicSkillDocument[];
  // Employer-only (null for seekers)
  companyName: string | null;
  businessType: BusinessType | null;
  gstin: string | null;
  employerLocation: {
    city: string | null;
    area: string | null;
    pincode: string | null;
    coordinates: [number, number] | null;
  } | null;
  /** Profile-completion percent (0..100). Computed, not stored. */
  profileCompletion: number;
  /** Safety Trust Circle — up to 3 emergency contacts the user has saved. */
  trustCircle: TrustCircleContact[];
  /** Whether this user has opted in to receive SOS pings from nearby workers. */
  isPeerResponder: boolean;
  /** Whether the user's Trust Circle is notified on shift start/end. */
  shareShiftsWithCircle: boolean;
  /** Rolling activity streaks — drives the Profile streak strip. */
  streaks: {
    apply: StreakCounter;
    course: StreakCounter;
    shift: StreakCounter;
  };
  /**
   * Aggregated rating summary. Null when this user has zero ratings —
   * lets the UI render "No ratings yet" rather than "0.0 ⭐". The avg
   * is rounded to one decimal (e.g. 4.6).
   */
  rating: { avg: number; count: number } | null;
  createdAt: string;
}
