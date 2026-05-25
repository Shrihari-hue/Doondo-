/**
 * User — the core identity model.
 *
 * Phase 1 was minimal (just identity + auth). Phase 2 grows the model
 * with seeker profile fields: skills, bio, geo location, availability,
 * experience, preferred job types, and saved-jobs bookmarks. None of
 * the new fields are required, so existing accounts stay valid.
 *
 * Why we live on User and not a separate SeekerProfile collection:
 *   - 1:1 relationship between user and profile — no need for a join.
 *   - Single source of truth for "who is this person".
 *   - Mongoose `select: false` lets us hide fields where not needed.
 *
 * Phase 3 employer fields will land here too (companyName, gstin, etc.)
 * so we don't fragment the identity model.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';
import type { UserRole } from '@/lib/jwt';
import type { CraftPhoto } from '@/modules/skills/skill.catalogue';

export type { CraftPhoto } from '@/modules/skills/skill.catalogue';

// ─── Subdocuments ───────────────────────────────────────────────────────────

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
 *
 * Phone is required so the platform can route a push to that contact
 * if they're already on Doondo (matched by phoneHash) AND optionally
 * SMS them out-of-band later. Max 3 enforced at the schema level.
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

export interface User {
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  phone?: string | null;
  /**
   * SHA-256 hex of the normalised phone (digits only). Used by the
   * Find Friends contacts-match endpoint to match Doondo users by
   * hashed contacts without storing raw numbers.
   */
  phoneHash?: string | null;
  /**
   * Preferred app language (en / hi / ta / te / kn). Drives in-chat
   * auto-translation — an incoming message is translated into the
   * recipient's `locale`. The mobile app syncs this whenever the worker
   * changes the UI language. Defaults to 'en'.
   */
  locale: string;
  /**
   * Seeker's UPI VPA (e.g. "shree@okhdfcbank"). Used by the UPI
   * payment intent flow so employers can pay over UPI. Optional —
   * workers can still receive cash.
   */
  upiVpa?: string | null;
  /**
   * Per-type push notification toggles. Missing keys default to true
   * (notifications on). Used by the push fan-out service to filter
   * sends before they hit the device.
   */
  notificationPrefs?: {
    jobs?: boolean;
    applications?: boolean;
    messages?: boolean;
    ratings?: boolean;
    referrals?: boolean;
  };
  /**
   * High-level "is this account verified" flag. Flipped to `true` once the
   * Phase 5 verification flow completes (phone OTP + selfie + GSTIN format
   * for employers). Stays in lockstep with `verifiedAt` — both set together,
   * both cleared together.
   */
  isVerified: boolean;
  /**
   * Granular state machine for the verification flow.
   *   unverified — never started, or rejected and reset
   *   pending    — phone confirmed, waiting on selfie / final review
   *   verified   — full pass; isVerified === true
   *   rejected   — manually rejected by an admin (selfie didn't match etc.)
   */
  verificationStatus: VerificationStatus;
  /** When the phone OTP step was passed. Null until the user proves the number. */
  phoneVerifiedAt?: Date | null;
  /**
   * Selfie captured during verification, kept on the user record for
   * dispute review. Stored as a base64 data URL like `photoUrl` (cap ~350KB
   * after client-side compression). Hidden from peer profile responses.
   */
  selfiePhotoUrl?: string | null;
  /** Timestamp when verification fully passed. Null when not verified. */
  verifiedAt?: Date | null;
  isActive: boolean;
  lastLoginAt?: Date | null;
  /**
   * SHA-256 hash of the currently-active password-reset token's `jti`.
   * Set when /auth/verify-reset-code mints a reset JWT, cleared after the
   * matching /auth/reset-password call succeeds. Storing the hash (not the
   * jti itself) is consistent with how we treat refresh tokens — a leaked
   * DB dump can't be turned into a working reset link.
   */
  passwordResetTokenHash?: string | null;
  // ─── Seeker profile (Phase 2) ───────────────────────────────────────────
  skills: string[];
  bio?: string | null;
  experienceYears?: number | null;
  availability?: Availability | null;
  preferredJobTypes: PreferredJobType[];
  /** "solo" = one person looking, "team" = a small group looking together. */
  workType?: WorkType | null;
  /** Members in the team. Required when workType === 'team'. 2..50. */
  teamSize?: number | null;
  /**
   * Seeker's desired pay — surfaced on the Profile screen and used to
   * sort job suggestions later. Null until the seeker sets it.
   */
  expectedSalary?: ExpectedSalary | null;
  location?: UserLocation | null;
  /**
   * Profile photo, stored as a base64 data URL for now (max ~250KB after
   * client-side compression). Phase 5 swaps this for a CDN-hosted URL
   * once we add proper file storage. Both shapes work for clients —
   * `Image source={{ uri }}` accepts both `data:image/...` and `https://`.
   */
  photoUrl?: string | null;
  /**
   * Resume — stored as a base64 data URL alongside metadata. Replaceable
   * (POST /me/resume overwrites) and removable (DELETE /me/resume sets
   * everything to null). PDFs and DOCX only; capped at ~900KB raw, ~1.2MB
   * base64. Phase 5 swaps this for CDN storage when the file pipeline ships.
   */
  resumeUrl?: string | null;
  resumeFilename?: string | null;
  resumeMimeType?: string | null;
  resumeSizeBytes?: number | null;
  resumeUploadedAt?: Date | null;
  /**
   * Generated resume — last 1-5 jobs the seeker walked through in the
   * Resume Builder wizard. Lives alongside `resumeUrl`: a seeker can have
   * an uploaded PDF AND a built-from-experience resume. Empty by default.
   */
  workHistory: WorkExperience[];
  /**
   * Education entries — degree / institution / years. Optional for
   * blue-collar workers; mandatory in spirit for white-collar candidates.
   * Empty array by default.
   */
  education: Education[];
  /**
   * Photos of the seeker's work — a mason's wall, a cook's plates, an
   * electrician's panel. Up to 6 entries, each ~350KB after client-side
   * compression (so the user document stays under 2.5MB). Empty when the
   * seeker hasn't uploaded any.
   *
   * Each photo is a `CraftPhoto`: a base64/CDN URL plus the catalogue
   * `skill` slug it belongs to. The skill tag is what lets a multi-craft
   * worker's gallery split into per-craft collections — see
   * `modules/skills/skill.catalogue` and `buildCollections`.
   */
  workPhotos: CraftPhoto[];
  /**
   * Files the worker uploaded as proof of their skills — certificates,
   * licences, training docs, photos. Each is tagged to a skill slug.
   * The files live on cloud storage; this array holds URLs + metadata.
   */
  skillDocuments: SkillDocument[];
  /** Bookmarked Job IDs — small array, denormalised on the user. */
  savedJobs: Schema.Types.ObjectId[];
  /**
   * Expo push tokens. Multiple supported (one per device). Tokens are
   * registered on app launch + after every login; we de-dupe before
   * pushing. Cleared on logout via clearPushToken.
   */
  expoPushTokens: string[];
  /**
   * Last time the morning-digest job sent this user a push. Used to
   * keep the cron idempotent within a day (if the scheduler fires
   * twice for any reason we don't double-send) and as a dev signal
   * for tuning the digest content.
   */
  lastDigestSentAt?: Date | null;
  /**
   * Three rolling activity streaks. Bumped by:
   *   - apply  → `application.service.apply` on a new application
   *   - course → `courses.service.completeLesson` on a lesson done
   *   - shift  → `shiftCheckIn.service.createCheckIn` on a check_in
   * Each is mutated atomically by `streaks.service.bumpStreak`, which
   * also fires milestone pushes (3/7/14/30 days).
   */
  streaks: {
    apply: StreakCounter;
    course: StreakCounter;
    shift: StreakCounter;
  };
  /**
   * Up to 3 emergency contacts. Pinged in addition to the on-device
   * SMS contact when the seeker triggers SOS. Stored backend-side so
   * the alert still fires even if the seeker's phone is offline (the
   * mobile is the *primary* dispatcher, the server is the safety net).
   */
  trustCircle: TrustCircleContact[];
  /**
   * Whether this user has opted in to receive SOS pings from nearby
   * workers. The peer-responder pool is the second tier of an SOS
   * fan-out: 2 verified peers within ~5km get pushed when anyone in
   * the area triggers an alert. Default off — workers must explicitly
   * agree to be in the pool because being woken at 2am is a real cost.
   */
  isPeerResponder: boolean;
  /**
   * Whether this user wants their Trust Circle notified when they
   * start and end a shift (the accountability / safety-net use case).
   * Default off — shift pings are a real attention cost for the 3
   * contacts, so the worker opts in deliberately. Only contacts who
   * are themselves Doondo users get the push.
   */
  shareShiftsWithCircle: boolean;
  /**
   * Doondo Constitution — the seeker's personal work rules. Always
   * present (defaults to no-limit / all-false); an employer sees it on
   * the applicant view so a mismatch is caught before the interview.
   */
  constitution: SeekerConstitution;
  /**
   * Re-engagement sweep bookkeeping. `lastReengagedAt` is when the
   * dormant-user sweep last pushed this user; `reengagementAttempts`
   * counts pushes in the current dormancy spell. Together they gate the
   * sweep — it skips anyone pushed inside the cooldown window or past
   * the attempt cap. `reengagementAttempts` resets to 0 on login (see
   * auth.service) so a user who returns and lapses again is eligible
   * for a fresh round of nudges.
   */
  lastReengagedAt?: Date | null;
  reengagementAttempts: number;
  // ─── Employer profile (Phase 3) ─────────────────────────────────────────
  /** Trading / brand name shown on job posts. */
  companyName?: string | null;
  businessType?: BusinessType | null;
  /** GST identification number (India). 15 chars; format-validated lightly. */
  gstin?: string | null;
  /** Where the business operates from. Different from a seeker's home location. */
  employerLocation?: UserLocation | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserMethods {
  /**
   * Serialize to wire format. `opts.rating` lets the caller plug in a
   * pre-computed rating summary (from ratingService.summarizeForUser) so
   * the UI gets live numbers. Pass null (or omit) for "no ratings yet".
   */
  toPublicJSON(opts?: { rating?: { avg: number; count: number } | null }): PublicUser;
}

export type UserDocument = HydratedDocument<User, UserMethods>;

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
  // ─── Seeker profile (Phase 2) ───────────────────────────────────────────
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
   *
   * Populated on demand via ratingService.summarizeForUser(). Not stored
   * on the document; computed at serialize time. For high-volume reads
   * we can move to a denormalised counter, but for now O(1) aggregation
   * keeps the source of truth in the Rating collection.
   */
  rating: { avg: number; count: number } | null;
  createdAt: string;
}

type UserModel = Model<User, Record<string, never>, UserMethods>;

// ─── Sub-schemas ────────────────────────────────────────────────────────────
// Defined separately so Mongoose doesn't choke on inline nested-with-default
// patterns (Mongoose treats `type:` as a reserved key inside a path spec).

const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      validate: {
        validator: (v: number[]) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v[0]! >= -180 &&
          v[0]! <= 180 &&
          v[1]! >= -90 &&
          v[1]! <= 90,
        message: 'coordinates must be [lng, lat] with valid ranges',
      },
    },
  },
  { _id: false },
);

const educationSchema = new Schema<Education>(
  {
    degree: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    institution: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    fieldOfStudy: { type: String, default: null, trim: true, maxlength: 120 },
    startYear: { type: Number, required: true, min: 1950, max: 2100 },
    endYear: { type: Number, default: null, min: 1950, max: 2100 },
    current: { type: Boolean, default: false },
  },
  { _id: false },
);

const workExperienceSchema = new Schema<WorkExperience>(
  {
    company: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    role: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    startDate: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-\d{2}$/, 'startDate must be YYYY-MM'],
    },
    endDate: {
      type: String,
      default: null,
      trim: true,
      match: [/^\d{4}-\d{2}$/, 'endDate must be YYYY-MM'],
    },
    current: { type: Boolean, default: false },
    description: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const userLocationSchema = new Schema(
  {
    city: { type: String, default: null, trim: true, maxlength: 80 },
    area: { type: String, default: null, trim: true, maxlength: 80 },
    pincode: { type: String, default: null, trim: true, maxlength: 12 },
    geo: { type: geoPointSchema, default: null },
  },
  { _id: false },
);

/**
 * One photo in a worker's craft portfolio. `skill` is a catalogue slug
 * (see modules/skills/skill.catalogue) tagging which craft collection the
 * photo belongs to — this is what makes a multi-craft worker's gallery
 * split into per-craft collections instead of one undifferentiated pile.
 */
const craftPhotoSchema = new Schema<CraftPhoto>(
  {
    url: { type: String, required: true, maxlength: 500_000 },
    skill: { type: String, required: true, trim: true, maxlength: 40 },
    caption: { type: String, default: null, trim: true, maxlength: 120 },
    isCover: { type: Boolean, default: false },
  },
  { _id: false },
);

// Skill-proof files — only the CDN URL + metadata live on the document
// (the file itself is on cloud storage), so each entry is tiny.
const skillDocumentSchema = new Schema<SkillDocument>(
  {
    id: { type: String, required: true },
    skill: { type: String, required: true, trim: true, maxlength: 60 },
    url: { type: String, required: true, maxlength: 1000 },
    fileName: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: SKILL_DOC_KINDS, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<User, UserModel, UserMethods>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
      match: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Invalid email'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never return the hash unless explicitly selected
    },
    role: {
      type: String,
      required: true,
      enum: ['seeker', 'employer', 'admin'],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    /**
     * SHA-256 hex of the normalised phone (digits only). Used by the
     * Find Friends contacts-match endpoint so we can match on hashes
     * without storing raw numbers in the index. Populated lazily — see
     * findFriends.service hashPhone() for the canonical formula.
     */
    phoneHash: { type: String, default: null, index: true },
    /**
     * Preferred app language — drives in-chat auto-translation. Synced by
     * the mobile app whenever the worker changes the UI language.
     */
    locale: { type: String, enum: ['en', 'hi', 'ta', 'te', 'kn'], default: 'en' },
    /**
     * Seeker's UPI VPA (Virtual Payment Address) — e.g. "shree@okhdfcbank".
     * Used by the UPI payment intent flow so employers can pay directly
     * over UPI. Optional — the worker can also receive cash.
     */
    upiVpa: { type: String, default: null, lowercase: true, trim: true, maxlength: 80 },
    notificationPrefs: {
      type: new Schema(
        {
          jobs: { type: Boolean, default: true },
          applications: { type: Boolean, default: true },
          messages: { type: Boolean, default: true },
          ratings: { type: Boolean, default: true },
          referrals: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    isVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'unverified',
      index: true,
    },
    phoneVerifiedAt: { type: Date, default: null },
    // Selfies need more bytes than the avatar photoUrl (face detail matters
    // for verification review). select:false so peer-profile reads never
    // accidentally leak the selfie outside the verification flow.
    selfiePhotoUrl: {
      type: String,
      default: null,
      maxlength: 900_000,
      select: false,
    },
    verifiedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    // Hash of the active reset-token jti. select:false so it never leaks
    // through accidental .toObject() calls; we read it explicitly when
    // consuming the reset.
    passwordResetTokenHash: { type: String, default: null, select: false },
    // ─── Seeker profile (Phase 2) ─────────────────────────────────────────
    skills: { type: [String], default: [] },
    bio: { type: String, default: null, trim: true, maxlength: 500 },
    experienceYears: { type: Number, default: null, min: 0, max: 60 },
    availability: { type: String, enum: AVAILABILITIES, default: null },
    preferredJobTypes: {
      type: [{ type: String, enum: PREFERRED_JOB_TYPES }],
      default: [],
    },
    workType: { type: String, enum: WORK_TYPES, default: null },
    teamSize: { type: Number, default: null, min: 2, max: 50 },
    expectedSalary: {
      type: new Schema<ExpectedSalary>(
        {
          amount: { type: Number, required: true, min: 0 },
          amountMax: { type: Number, default: null, min: 0 },
          period: { type: String, enum: SALARY_PERIODS, required: true },
          currency: { type: String, default: 'INR', maxlength: 3 },
        },
        { _id: false },
      ),
      default: null,
    },
    location: { type: userLocationSchema, default: null },
    // Stored as a base64 data URL (data:image/jpeg;base64,...). Cap at
    // ~350KB after the trailing prefix — clients should compress before send.
    photoUrl: { type: String, default: null, maxlength: 360_000 },
    // Resume — base64 data URL of a PDF/DOCX. ~1.2MB cap leaves room for
    // the typical 200-500KB resume after base64 encoding overhead.
    resumeUrl: { type: String, default: null, maxlength: 1_300_000, select: false },
    resumeFilename: { type: String, default: null, trim: true, maxlength: 200 },
    resumeMimeType: { type: String, default: null, trim: true, maxlength: 80 },
    resumeSizeBytes: { type: Number, default: null, min: 0, max: 5_000_000 },
    resumeUploadedAt: { type: Date, default: null },
    // Resume Builder — seeker-generated work history. Bounded to 10 entries
    // to keep the document small (UI caps at 5 but we leave headroom).
    workHistory: {
      type: [workExperienceSchema],
      default: [],
      validate: {
        validator: (v: WorkExperience[]) => Array.isArray(v) && v.length <= 10,
        message: 'workHistory may not exceed 10 entries',
      },
    },
    education: {
      type: [educationSchema],
      default: [],
      validate: {
        validator: (v: Education[]) => Array.isArray(v) && v.length <= 6,
        message: 'education may not exceed 6 entries',
      },
    },
    // Photos of the seeker's work, each tagged to the craft skill it
    // belongs to. Up to 6 entries; the array max is enforced both here
    // and in the mobile picker. See modules/skills/skill.catalogue.
    workPhotos: {
      type: [craftPhotoSchema],
      default: [],
      validate: {
        validator: (v: CraftPhoto[]) => Array.isArray(v) && v.length <= 6,
        message: 'workPhotos may not exceed 6 entries',
      },
    },
    // Skill-proof files. URLs only (files live on cloud storage), so the
    // 40-entry cap keeps the document small without crowding base64.
    skillDocuments: {
      type: [skillDocumentSchema],
      default: [],
      validate: {
        validator: (v: SkillDocument[]) => Array.isArray(v) && v.length <= 40,
        message: 'skillDocuments may not exceed 40 entries',
      },
    },
    // Employer-only (Phase 3) — left null on seeker accounts.
    companyName: { type: String, default: null, trim: true, maxlength: 120 },
    businessType: { type: String, enum: BUSINESS_TYPES, default: null },
    // 15-char GSTIN (lenient — full Luhn-style validation is admin's job).
    gstin: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN'],
    },
    employerLocation: { type: userLocationSchema, default: null },
    savedJobs: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
      default: [],
    },
    expoPushTokens: { type: [String], default: [] },
    lastDigestSentAt: { type: Date, default: null },
    lastReengagedAt: { type: Date, default: null },
    reengagementAttempts: { type: Number, default: 0, min: 0 },
    streaks: {
      type: new Schema(
        {
          apply: {
            current: { type: Number, default: 0, min: 0 },
            longest: { type: Number, default: 0, min: 0 },
            totalDays: { type: Number, default: 0, min: 0 },
            lastDate: { type: String, default: null },
          },
          course: {
            current: { type: Number, default: 0, min: 0 },
            longest: { type: Number, default: 0, min: 0 },
            totalDays: { type: Number, default: 0, min: 0 },
            lastDate: { type: String, default: null },
          },
          shift: {
            current: { type: Number, default: 0, min: 0 },
            longest: { type: Number, default: 0, min: 0 },
            totalDays: { type: Number, default: 0, min: 0 },
            lastDate: { type: String, default: null },
          },
        },
        { _id: false },
      ),
      default: () => ({
        apply: { current: 0, longest: 0, totalDays: 0, lastDate: null },
        course: { current: 0, longest: 0, totalDays: 0, lastDate: null },
        shift: { current: 0, longest: 0, totalDays: 0, lastDate: null },
      }),
    },
    trustCircle: {
      type: [
        new Schema<TrustCircleContact>(
          {
            name: { type: String, required: true, trim: true, maxlength: 120 },
            phone: { type: String, required: true, trim: true, maxlength: 30 },
            relationship: { type: String, default: null, trim: true, maxlength: 40 },
          },
          { _id: false },
        ),
      ],
      default: [],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length <= 3,
        message: 'trustCircle may not exceed 3 entries',
      },
    },
    isPeerResponder: { type: Boolean, default: false, index: true },
    shareShiftsWithCircle: { type: Boolean, default: false },
    constitution: {
      type: new Schema<SeekerConstitution>(
        {
          maxDistanceKm: { type: Number, default: null, min: 0, max: 500 },
          noNightShifts: { type: Boolean, default: false },
          noSundays: { type: Boolean, default: false },
          requiresPpe: { type: Boolean, default: false },
          requiresContract: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({
        maxDistanceKm: null,
        noNightShifts: false,
        noSundays: false,
        requiresPpe: false,
        requiresContract: false,
      }),
    },
  },
  { timestamps: true },
);

// 2dsphere on the seeker's saved location lets Phase 4 do "jobs near YOUR
// home" recommendations without re-asking permission every session.
userSchema.index({ 'location.geo': '2dsphere' });

// Supports the dormant-user re-engagement sweep: it filters on isActive +
// role and ranges over lastLoginAt to find users who haven't returned.
userSchema.index({ isActive: 1, role: 1, lastLoginAt: 1 });

userSchema.method('toPublicJSON', function (
  this: UserDocument,
  opts?: { rating?: { avg: number; count: number } | null },
): PublicUser {
  const flatLoc = (loc: UserLocation | null | undefined) =>
    loc && (loc.city || loc.area || loc.pincode || loc.geo)
      ? {
          city: loc.city ?? null,
          area: loc.area ?? null,
          pincode: loc.pincode ?? null,
          coordinates: loc.geo?.coordinates ?? null,
        }
      : null;

  const locOut = flatLoc(this.location);
  const empLocOut = flatLoc(this.employerLocation);

  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    name: this.name,
    phone: this.phone ?? null,
    locale: this.locale ?? 'en',
    isVerified: this.isVerified,
    verificationStatus: this.verificationStatus ?? 'unverified',
    phoneVerified: Boolean(this.phoneVerifiedAt),
    verifiedAt: this.verifiedAt ? this.verifiedAt.toISOString() : null,
    skills: this.skills ?? [],
    bio: this.bio ?? null,
    experienceYears: this.experienceYears ?? null,
    availability: this.availability ?? null,
    preferredJobTypes: this.preferredJobTypes ?? [],
    workType: this.workType ?? null,
    teamSize: this.teamSize ?? null,
    expectedSalary: this.expectedSalary
      ? {
          amount: this.expectedSalary.amount,
          amountMax: this.expectedSalary.amountMax ?? null,
          period: this.expectedSalary.period,
          currency: this.expectedSalary.currency ?? 'INR',
        }
      : null,
    location: locOut,
    photoUrl: this.photoUrl ?? null,
    // Resume metadata is included for self-reads (/auth/me) and for
    // employers viewing an applicant. The resumeUrl itself is select:false
    // by default so it's only ever returned when explicitly requested.
    resumeUrl: this.resumeUrl ?? null,
    resumeFilename: this.resumeFilename ?? null,
    resumeMimeType: this.resumeMimeType ?? null,
    resumeSizeBytes: this.resumeSizeBytes ?? null,
    resumeUploadedAt: this.resumeUploadedAt ? this.resumeUploadedAt.toISOString() : null,
    workHistory: (this.workHistory ?? []).map((w) => ({
      company: w.company,
      role: w.role,
      startDate: w.startDate,
      endDate: w.endDate ?? null,
      current: Boolean(w.current),
      description: w.description ?? null,
    })),
    education: (this.education ?? []).map((e) => ({
      degree: e.degree,
      institution: e.institution,
      fieldOfStudy: e.fieldOfStudy ?? null,
      startYear: e.startYear,
      endYear: e.endYear ?? null,
      current: Boolean(e.current),
    })),
    workPhotos: (this.workPhotos ?? []).map((p) => ({
      url: p.url,
      skill: p.skill,
      caption: p.caption ?? null,
      isCover: Boolean(p.isCover),
    })),
    skillDocuments: (this.skillDocuments ?? []).map((d) => ({
      id: d.id,
      skill: d.skill,
      url: d.url,
      fileName: d.fileName,
      mimeType: d.mimeType,
      kind: d.kind,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    companyName: this.companyName ?? null,
    businessType: this.businessType ?? null,
    gstin: this.gstin ?? null,
    employerLocation: empLocOut,
    profileCompletion: computeProfileCompletion(this),
    rating: opts?.rating && opts.rating.count > 0 ? opts.rating : null,
    trustCircle: Array.isArray(this.trustCircle)
      ? this.trustCircle.map((c) => ({
          name: c.name,
          phone: c.phone,
          relationship: c.relationship ?? null,
        }))
      : [],
    isPeerResponder: Boolean(this.isPeerResponder),
    shareShiftsWithCircle: Boolean(this.shareShiftsWithCircle),
    streaks: {
      apply: serializeStreak(this.streaks?.apply),
      course: serializeStreak(this.streaks?.course),
      shift: serializeStreak(this.streaks?.shift),
    },
    createdAt: this.createdAt.toISOString(),
  };
});

/**
 * Defensive serializer for a single StreakCounter slot. Handles the
 * case where a freshly-created user document has no streaks subdoc
 * yet (older accounts, mocked test docs) by returning the zero shape.
 */
function serializeStreak(s: StreakCounter | null | undefined): StreakCounter {
  return {
    current: s?.current ?? 0,
    longest: s?.longest ?? 0,
    totalDays: s?.totalDays ?? 0,
    lastDate: s?.lastDate ?? null,
  };
}

/**
 * Lightweight scoring of "how complete is this profile". 7 fields each
 * worth ~14%, summing to 100. Used in the mobile profile screen to show
 * a "Profile 60% complete" progress orb that motivates filling more in.
 *
 * Each missing field gives the seeker a concrete next step rather than
 * an abstract "do more". The 3D progress orb on Profile reads this number.
 */
function computeProfileCompletion(u: UserDocument): number {
  // Different signals matter for seekers vs employers. Each role's checks
  // tally to ~14% per field so the percent maxes near 100.
  const seekerChecks = [
    Boolean(u.name && u.name.trim()),
    Boolean(u.phone && u.phone.trim()),
    Boolean(u.bio && u.bio.trim()),
    (u.skills?.length ?? 0) > 0,
    u.experienceYears != null,
    Boolean(u.availability),
    Boolean(u.location?.city),
    // Counts if either: PDF resume uploaded OR Resume Builder has ≥1 entry.
    Boolean(u.resumeUploadedAt) || (u.workHistory?.length ?? 0) > 0,
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

export const UserModel = model<User, UserModel>('User', userSchema);
