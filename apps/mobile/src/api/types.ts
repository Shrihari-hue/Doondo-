/**
 * Shared API envelope types — match the backend's response shape exactly.
 * If you change the backend envelope, change this file too. Eventually we'll
 * move these to packages/shared so both ends import from one source.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details: unknown;
  };
  requestId: string;
}

export type ApiErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_TAKEN'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_REFRESH_REUSED'
  | 'AUTH_REFRESH_REVOKED'
  | 'AUTH_RESET_TOKEN_INVALID'
  | 'AUTH_RESET_TOKEN_EXPIRED'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'
  // Phase 2
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_OPEN'
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_ALREADY_EXISTS'
  | 'APPLICATION_INVALID_TRANSITION'
  // Phase 5 — verification
  | 'VERIFICATION_OTP_INVALID'
  | 'VERIFICATION_OTP_EXPIRED'
  | 'VERIFICATION_OTP_TOO_MANY'
  | 'VERIFICATION_OTP_NOT_FOUND'
  | 'VERIFICATION_PHONE_REQUIRED'
  | 'VERIFICATION_SELFIE_REQUIRED'
  | 'VERIFICATION_GSTIN_REQUIRED'
  | 'VERIFICATION_ALREADY_VERIFIED';

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

// Auth-specific shapes
export type UserRole = 'seeker' | 'employer' | 'admin';

export type Availability =
  | 'immediate'
  | 'within_1_week'
  | 'within_1_month'
  | 'flexible';

export type JobType = 'full_time' | 'part_time' | 'gig' | 'shift' | 'contract';

export type WorkType = 'solo' | 'team';

export type PayPeriod = 'hour' | 'day' | 'week' | 'month' | 'fixed';

export type JobStatus = 'active' | 'paused' | 'filled' | 'expired';

/** Where the role is performed. Defaults to onsite for legacy postings. */
export type WorkMode = 'onsite' | 'hybrid' | 'remote';

export type ApplicationStatus =
  | 'pending'
  | 'viewed'
  | 'shortlisted'
  | 'rejected'
  | 'hired'
  | 'withdrawn';

/**
 * A single past-job entry from the Resume Builder. `startDate` /
 * `endDate` are YYYY-MM strings; `endDate` is null when `current === true`.
 */
export interface WorkExperience {
  company: string;
  role: string;
  /** YYYY-MM */
  startDate: string;
  /** YYYY-MM, null when still working that job. */
  endDate: string | null;
  current: boolean;
  description: string | null;
}

/**
 * Education row — mandatory for white-collar candidates, optional for
 * blue-collar. Year-only (no month) because workers rarely remember
 * exact dates for school.
 */
export interface Education {
  degree: string;
  institution: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
  current: boolean;
}

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected';

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone: string | null;
  isVerified: boolean;
  /** Granular verification state — drives the ProfileScreen card. */
  verificationStatus: VerificationStatus;
  /** Whether the phone OTP step has been completed. */
  phoneVerified: boolean;
  /** ISO timestamp when verification fully passed; null otherwise. */
  verifiedAt: string | null;
  // Phase 2 seeker profile
  skills: string[];
  bio: string | null;
  experienceYears: number | null;
  availability: Availability | null;
  preferredJobTypes: JobType[];
  workType: WorkType | null;
  teamSize: number | null;
  /**
   * Seeker's desired pay. `amount` is in minor units (paise for INR).
   * Null until the seeker sets it on the profile.
   */
  expectedSalary: {
    /** Lower bound (paise). */
    amount: number;
    /** Optional upper bound (paise). Null for single-number expectations. */
    amountMax: number | null;
    period: 'hour' | 'day' | 'week' | 'month' | 'fixed';
    currency: string;
  } | null;
  location: {
    city: string | null;
    area: string | null;
    pincode: string | null;
    coordinates: [number, number] | null;
  } | null;
  /** Base64 data URL or external URL. Null if not set. */
  photoUrl: string | null;
  /**
   * Aggregated rating summary (server-computed). Null when this user has
   * zero ratings — so the UI can render "No ratings yet" instead of "0.0 ⭐".
   */
  rating: { avg: number; count: number } | null;
  // Resume (seeker) — base64 data URL of a PDF/DOCX, plus metadata
  resumeUrl: string | null;
  resumeFilename: string | null;
  resumeMimeType: string | null;
  resumeSizeBytes: number | null;
  resumeUploadedAt: string | null;
  /**
   * Resume-builder entries — the seeker's last 1-5 jobs, captured via the
   * guided wizard. Lives alongside `resumeUrl`: a seeker can have a
   * scanned/uploaded PDF AND a builder resume. Empty when never used.
   */
  workHistory: WorkExperience[];
  /**
   * Photos of the seeker's work — up to 6 base64 data URLs. Renders as a
   * carousel on the resume preview + the employer's applicant detail.
   */
  workPhotos: string[];
  /** Education entries — empty when the seeker hasn't added any. */
  education: Education[];
  // Employer (Phase 3)
  companyName: string | null;
  businessType:
    | 'individual'
    | 'shop'
    | 'restaurant'
    | 'salon'
    | 'agency'
    | 'startup'
    | 'enterprise'
    | 'other'
    | null;
  gstin: string | null;
  employerLocation: {
    city: string | null;
    area: string | null;
    pincode: string | null;
    coordinates: [number, number] | null;
  } | null;
  profileCompletion: number;
  createdAt: string;
}

export type BusinessType = NonNullable<PublicUser['businessType']>;

// ─── Jobs ────────────────────────────────────────────────────────────────────

export interface PublicJob {
  id: string;
  title: string;
  description: string;
  type: JobType;
  pay: {
    amount: number;
    amountMax: number | null;
    period: PayPeriod;
    currency: string;
  };
  location: {
    address: string;
    city: string;
    area: string | null;
    pincode: string | null;
    coordinates: [number, number]; // [lng, lat]
  };
  skills: string[];
  /** Where the role is performed — defaults to onsite. */
  workMode: WorkMode;
  schedule: {
    days?: number[];
    startTime?: string | null;
    endTime?: string | null;
    hoursPerDay?: number | null;
  } | null;
  status: JobStatus;
  /** True when the employer marked this posting as time-sensitive. */
  urgent: boolean;
  /**
   * Employer-asserted "safe for women" claim. When true, seekers see a
   * green shield pill on the card; the Jobs filter has a chip that
   * narrows the feed to only these posts.
   */
  safeForWomen: boolean;
  applicantsCount: number;
  /** Optional voice description data URL — present only on job-detail reads. */
  audioDescriptionUrl: string | null;
  /** Duration of the voice description in seconds. */
  audioDescriptionDurationSeconds: number | null;
  /** Filled by /jobs/nearby. */
  distanceMeters?: number;
  employer?: {
    id: string;
    name: string;
    isVerified: boolean;
    photoUrl?: string | null;
    companyName?: string | null;
  };
  createdAt: string;
}

// ─── Applications ────────────────────────────────────────────────────────────

// ─── Chat ────────────────────────────────────────────────────────────────────

export type MessageKind = 'text' | 'image' | 'voice' | 'video' | 'system';

/**
 * Attachment payload for non-text messages. For v1 the bytes ride along
 * as a base64 data URL — the mobile bubble can render it directly via
 * `Image source={{ uri }}`. Swap to a CDN URL later by keeping `dataUrl`
 * optional and adding a `url` field.
 */
export interface MessageAttachment {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export interface PublicConversation {
  id: string;
  employerId: string;
  seekerId: string;
  jobId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  unread: number;
  createdAt: string;
  /** Hydrated by listMine / detail. */
  counterpart?: {
    id: string;
    name: string;
    photoUrl: string | null;
    isVerified: boolean;
    /** Role of the counterpart — used by the chat list to filter "Employers" vs system threads. */
    role?: UserRole;
    companyName?: string | null;
  };
  job?: { id: string; title: string };
}

export interface PublicMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  /** Text body or caption. Empty string for plain media messages. */
  body: string;
  /** Present for image / voice / video messages. Null for text + system. */
  attachment: MessageAttachment | null;
  readAt: string | null;
  createdAt: string;
}

export type InterviewMode = 'in_person' | 'video' | 'phone';
export type InterviewStatus = 'scheduled' | 'cancelled' | 'completed';

export interface PublicInterview {
  scheduledFor: string;
  mode: InterviewMode;
  location: string | null;
  meetingLink: string | null;
  notes: string | null;
  status: InterviewStatus;
  scheduledAt: string;
  cancelledAt: string | null;
  /**
   * ISO timestamp of the pre-interview reminder push, or null if the
   * reminder hasn't fired yet. The mobile UI uses this to mute the
   * "Starting in X" pill on already-reminded interviews — the worker
   * has already seen the heads-up so the card can stay calm.
   */
  reminderSentAt: string | null;
}

export interface PublicApplication {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  /** True for one-tap "I'm interested" pings from Today mode. */
  expressedAsInterest: boolean;
  /** How many people are applying together. Null = solo applicant. */
  teamSizeSnapshot: number | null;
  /** Self-declared list of teammates — name + phone per member. */
  teamMembers: Array<{ name: string; phone: string }>;
  /** Cash payment confirmation — null until either side has acted. */
  paymentConfirmation: {
    seekerConfirmedAt: string | null;
    employerConfirmedAt: string | null;
    disputedAt: string | null;
    disputeNote: string | null;
  } | null;
  timeline: {
    appliedAt: string;
    viewedAt: string | null;
    shortlistedAt: string | null;
    rejectedAt: string | null;
    hiredAt: string | null;
    withdrawnAt: string | null;
  };
  /**
   * Skills the seeker was missing relative to the job at the moment of
   * rejection. Null until rejected; even then null if the seeker had
   * every skill the post required. Drives the "What can I learn?" CTA
   * on MyApplications and the skill-gap push.
   */
  rejectionReasons: string[] | null;
  /**
   * ISO timestamp when the anti-ghost sweep flagged this row. Null when
   * the employer responded in time. Drives the "Ghosted" pill in the
   * seeker UI and lets the worker move on without doubting themselves.
   */
  flaggedAsGhostedAt: string | null;
  /** Latest interview if scheduled, null otherwise. */
  interview: PublicInterview | null;
  /** Hydrated by listMine / detail. */
  job?: PublicJob;
  createdAt: string;
}

/**
 * Response shape of GET /applications/:id/skill-gap. Returned by the
 * Doondo backend for the seeker after a rejection so the UI can surface
 * "you were missing X — try this course".
 */
export interface SkillGapResponse {
  missingSkills: string[];
  recommendedCourse: {
    id: string;
    title: string;
    tagline: string;
    durationMinutes: number;
    addressesSkills: string[];
  } | null;
  alternatives: Array<{
    id: string;
    title: string;
    tagline: string;
    durationMinutes: number;
    addressesSkills: string[];
  }>;
}

/**
 * Doondo Score response shape (GET /me/doondo-score, /users/:id/doondo-score).
 * Score is 0-100; the breakdown is what makes the score explainable.
 */
export interface DoondoScoreResponse {
  score: number;
  breakdown: {
    ratings: { points: number; max: number; avg: number | null; count: number };
    hires: { points: number; max: number; count: number };
    endorsements: { points: number; max: number; uniqueTrades: number };
    verification: { points: number; max: number; isVerified: boolean };
    profile: { points: number; max: number; completion: number };
  };
  version: number;
}

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
