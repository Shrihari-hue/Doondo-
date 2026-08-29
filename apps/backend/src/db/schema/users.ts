/**
 * Postgres port of the Mongoose `User` model (src/modules/users/user.model.ts).
 *
 * Kept as ONE wide table (not split into users/seeker_profiles/employer_
 * profiles) — see the migration plan for the rationale: the Mongo model is
 * already "one row per identity-role" (a seeker and an employer account on
 * the same email are separate documents), so a wide table with a composite
 * unique (email, role) preserves that shape without forcing every one of
 * the ~120 call sites across the app to learn a multi-table split.
 *
 * Loosely-structured nested fields that aren't independently queried
 * (payoutBank, notificationPrefs, expectedSalary, location, streaks,
 * trustCircle, constitution, workHistory, education, skillDocuments) are
 * `jsonb` columns, same rationale.
 *
 * `location`/`employerLocation` stay `jsonb` for now (not a PostGIS
 * `geometry` column) — Phase 1 only covers auth, which never queries by
 * geo. Real geospatial columns + GiST indexes land in Phase 2 across
 * Job/User/Availability/ShiftCheckIn/SosAlert together, once the "jobs
 * near me" queries that actually need them are ported.
 *
 * `work_photos` is split into its own table (see below) — the Mongo
 * model's `PhotoVerification.photoIndex` fragilely references a position
 * in `User.workPhotos[]`; giving photos a real UUID PK now means that
 * reference can become a proper FK when Phase 2 ports PhotoVerification.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['seeker', 'employer', 'admin']);
export const userAvailabilityEnum = pgEnum('user_availability', [
  'immediate',
  'within_1_week',
  'within_1_month',
  'flexible',
]);
export const preferredJobTypeEnum = pgEnum('preferred_job_type', [
  'full_time',
  'part_time',
  'gig',
  'shift',
  'contract',
]);
export const salaryPeriodEnum = pgEnum('salary_period', ['hour', 'day', 'week', 'month', 'fixed']);
export const workTypeEnum = pgEnum('work_type', ['solo', 'team']);
export const businessTypeEnum = pgEnum('business_type', [
  'individual',
  'shop',
  'restaurant',
  'salon',
  'agency',
  'startup',
  'enterprise',
  'other',
]);
export const verificationStatusEnum = pgEnum('verification_status', [
  'unverified',
  'pending',
  'verified',
  'rejected',
]);
export const userLocaleEnum = pgEnum('user_locale', ['en', 'hi', 'ta', 'te', 'kn']);

// ─── JSONB payload shapes (mirror the Mongoose sub-schemas) ────────────────

export interface PayoutBankJson {
  holderName: string;
  accountNumber: string;
  ifsc: string;
  verified: boolean;
  addedAt: string; // ISO
}

export interface NotificationPrefsJson {
  jobs: boolean;
  applications: boolean;
  messages: boolean;
  ratings: boolean;
  referrals: boolean;
  /**
   * Local (IST) hour window during which only SOS pings should land —
   * every other push category is held back until `end`. `start`/`end`
   * are 0-23; `start === end` or the whole field being null both mean
   * "disabled". Wraps past midnight the same way the employer-side
   * response-quiet-hours setting does (see
   * employerResponse.service.ts's isWithinQuietHours).
   */
  quietHours: { start: number; end: number } | null;
}

export interface ExpectedSalaryJson {
  amount: number;
  amountMax: number | null;
  period: (typeof salaryPeriodEnum.enumValues)[number];
  currency: string;
}

export interface UserLocationJson {
  city: string | null;
  area: string | null;
  pincode: string | null;
  /** [lng, lat] — kept as a plain tuple until Phase 2 introduces `geometry`. */
  coordinates: [number, number] | null;
}

export interface WorkExperienceJson {
  company: string;
  role: string;
  startDate: string; // YYYY-MM
  endDate: string | null;
  current: boolean;
  description: string | null;
}

export interface EducationJson {
  degree: string;
  institution: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
  current: boolean;
}

export interface SkillDocumentJson {
  id: string;
  skill: string;
  url: string;
  fileName: string;
  mimeType: string;
  kind: 'document' | 'photo';
  sizeBytes: number;
  uploadedAt: string; // ISO
  extracted: { title: string | null; issuer: string | null; issuedOn: string | null } | null;
}

export interface StreakCounterJson {
  current: number;
  longest: number;
  totalDays: number;
  lastDate: string | null; // YYYY-MM-DD
}

export interface StreaksJson {
  apply: StreakCounterJson;
  course: StreakCounterJson;
  shift: StreakCounterJson;
}

export interface TrustCircleContactJson {
  name: string;
  phone: string;
  relationship: string | null;
}

export interface SeekerConstitutionJson {
  maxDistanceKm: number | null;
  noNightShifts: boolean;
  noSundays: boolean;
  requiresPpe: boolean;
  requiresContract: boolean;
}

export const ZERO_STREAK: StreakCounterJson = {
  current: 0,
  longest: 0,
  totalDays: 0,
  lastDate: null,
};

export const DEFAULT_STREAKS: StreaksJson = {
  apply: { ...ZERO_STREAK },
  course: { ...ZERO_STREAK },
  shift: { ...ZERO_STREAK },
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsJson = {
  jobs: true,
  applications: true,
  messages: true,
  ratings: true,
  referrals: true,
  quietHours: null,
};

export const DEFAULT_CONSTITUTION: SeekerConstitutionJson = {
  maxDistanceKm: null,
  noNightShifts: false,
  noSundays: false,
  requiresPpe: false,
  requiresContract: false,
};

// ─── Tables ─────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    phoneHash: varchar('phone_hash', { length: 64 }),
    locale: userLocaleEnum('locale').notNull().default('en'),

    upiVpa: varchar('upi_vpa', { length: 80 }),
    payoutBank: jsonb('payout_bank').$type<PayoutBankJson | null>(),
    notificationPrefs: jsonb('notification_prefs')
      .$type<NotificationPrefsJson>()
      .notNull()
      .default(DEFAULT_NOTIFICATION_PREFS),

    isVerified: boolean('is_verified').notNull().default(false),
    verificationStatus: verificationStatusEnum('verification_status').notNull().default('unverified'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    selfiePhotoUrl: text('selfie_photo_url'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordResetTokenHash: varchar('password_reset_token_hash', { length: 64 }),

    // ─── Seeker profile ────────────────────────────────────────────────────
    skills: text('skills').array().notNull().default([]),
    bio: varchar('bio', { length: 500 }),
    experienceYears: integer('experience_years'),
    availability: userAvailabilityEnum('availability'),
    preferredJobTypes: preferredJobTypeEnum('preferred_job_types').array().notNull().default([]),
    workType: workTypeEnum('work_type'),
    teamSize: integer('team_size'),
    expectedSalary: jsonb('expected_salary').$type<ExpectedSalaryJson | null>(),
    location: jsonb('location').$type<UserLocationJson | null>(),
    photoUrl: text('photo_url'),
    resumeUrl: text('resume_url'),
    resumeFilename: varchar('resume_filename', { length: 200 }),
    resumeMimeType: varchar('resume_mime_type', { length: 80 }),
    resumeSizeBytes: integer('resume_size_bytes'),
    resumeUploadedAt: timestamp('resume_uploaded_at', { withTimezone: true }),
    workHistory: jsonb('work_history').$type<WorkExperienceJson[]>().notNull().default([]),
    education: jsonb('education').$type<EducationJson[]>().notNull().default([]),
    skillDocuments: jsonb('skill_documents').$type<SkillDocumentJson[]>().notNull().default([]),
    // No FK yet — the `jobs` table doesn't exist until Phase 2.
    savedJobIds: uuid('saved_job_ids').array().notNull().default([]),
    expoPushTokens: text('expo_push_tokens').array().notNull().default([]),

    lastDigestSentAt: timestamp('last_digest_sent_at', { withTimezone: true }),
    lastReengagedAt: timestamp('last_reengaged_at', { withTimezone: true }),
    reengagementAttempts: integer('reengagement_attempts').notNull().default(0),

    streaks: jsonb('streaks').$type<StreaksJson>().notNull().default(DEFAULT_STREAKS),
    trustCircle: jsonb('trust_circle').$type<TrustCircleContactJson[]>().notNull().default([]),
    isPeerResponder: boolean('is_peer_responder').notNull().default(false),
    shareShiftsWithCircle: boolean('share_shifts_with_circle').notNull().default(false),
    constitution: jsonb('constitution')
      .$type<SeekerConstitutionJson>()
      .notNull()
      .default(DEFAULT_CONSTITUTION),

    // ─── Employer profile ──────────────────────────────────────────────────
    companyName: varchar('company_name', { length: 120 }),
    businessType: businessTypeEnum('business_type'),
    gstin: varchar('gstin', { length: 15 }),
    employerLocation: jsonb('employer_location').$type<UserLocationJson | null>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Email is unique PER ROLE, not globally — see user.model.ts's original
    // comment. One human can hold both a seeker and an employer account on
    // the same email.
    uniqueIndex('users_email_role_idx').on(t.email, t.role),
    index('users_phone_hash_idx').on(t.phoneHash),
    index('users_active_role_last_login_idx').on(t.isActive, t.role, t.lastLoginAt),
    index('users_is_peer_responder_idx').on(t.isPeerResponder),
  ],
);

/**
 * Bidirectional link between two User rows that represent the same
 * physical person (a worker who also holds an employer account, or vice
 * versa). Replaces Mongo's `linkedAccountIds: ObjectId[]` with a real,
 * FK-enforced join table — app code writes both directions (mirroring the
 * old bidirectional array-push logic) so a lookup from either side is a
 * single indexed query.
 */
export const userLinks = pgTable(
  'user_links',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    linkedUserId: uuid('linked_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.linkedUserId] })],
);

/**
 * Normalizes `User.workPhotos[]` out of the wide table. Mongo's
 * `PhotoVerification.photoIndex` fragilely references a position in that
 * array; a real UUID PK here is what lets Phase 2 turn that into a proper
 * FK. Not wired to any service yet in Phase 1 (auth never touches photos) —
 * `orderIndex` preserves the original array order for serialization once
 * the `me` module's photo endpoints are ported.
 */
export const workPhotos = pgTable(
  'work_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    skill: varchar('skill', { length: 40 }).notNull(),
    caption: varchar('caption', { length: 120 }),
    isCover: boolean('is_cover').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('work_photos_user_id_idx').on(t.userId)],
);
