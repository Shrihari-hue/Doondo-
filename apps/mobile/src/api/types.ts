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
    amount: number;
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
  schedule: {
    days?: number[];
    startTime?: string | null;
    endTime?: string | null;
    hoursPerDay?: number | null;
  } | null;
  status: JobStatus;
  /** True when the employer marked this posting as time-sensitive. */
  urgent: boolean;
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
}

export interface PublicApplication {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  /** True for one-tap "I'm interested" pings from Today mode. */
  expressedAsInterest: boolean;
  timeline: {
    appliedAt: string;
    viewedAt: string | null;
    shortlistedAt: string | null;
    rejectedAt: string | null;
    hiredAt: string | null;
    withdrawnAt: string | null;
  };
  /** Latest interview if scheduled, null otherwise. */
  interview: PublicInterview | null;
  /** Hydrated by listMine / detail. */
  job?: PublicJob;
  createdAt: string;
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
