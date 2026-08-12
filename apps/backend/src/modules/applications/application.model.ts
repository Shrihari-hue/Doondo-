/**
 * Application types — shared shapes for a seeker's interest in a specific
 * job. The actual row lives in Postgres (see src/db/schema/applications.ts);
 * this file holds the pure TS types/consts still shared across routes,
 * schemas, and serializers.
 *
 * Status lifecycle (employer drives transitions, seeker is the actor only
 * for cover-note edits and withdrawal):
 *
 *   pending      → just submitted, employer hasn't seen it
 *   viewed       → employer opened the application
 *   shortlisted  → employer flagged it as a candidate
 *   rejected     → employer declined
 *   hired        → terminal positive — match made
 *   withdrawn    → seeker pulled the application themselves
 */

// ─── Enums ──────────────────────────────────────────────────────────────────

export const APPLICATION_STATUSES = [
  'pending',
  'viewed',
  'shortlisted',
  'rejected',
  'hired',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INTERVIEW_MODES = ['in_person', 'video', 'phone'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_STATUSES = ['scheduled', 'cancelled', 'completed'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/**
 * Snapshot of a worker's job-tuned Smart Resume, copied onto the
 * Application at apply time so the employer sees the tailored version.
 */
export interface ApplicationTailoredResume {
  summary: string;
  pitch: string;
  highlightedSkills: string[];
  matchedSkills: string[];
  workBlurbs: Array<{ company: string; role: string; blurb: string }>;
}

export interface PublicInterview {
  scheduledFor: string;
  mode: InterviewMode;
  location: string | null;
  meetingLink: string | null;
  notes: string | null;
  status: InterviewStatus;
  scheduledAt: string;
  cancelledAt: string | null;
  /** ISO timestamp of the pre-interview reminder push (null until sent). */
  reminderSentAt: string | null;
}

export interface PublicApplication {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  /** True for one-tap "I'm interested" pings from Today mode. */
  expressedAsInterest: boolean;
  /**
   * Snapshot of how many people are applying as a team. Null = solo.
   * Captured from the seeker's workType/teamSize at apply time so the
   * employer's card stays accurate even if the seeker later flips back.
   */
  teamSizeSnapshot: number | null;
  /** Self-declared list of teammates — name + phone per member. */
  teamMembers: Array<{ name: string; phone: string }>;
  /** Cash payment confirmation state — null until either side acts. */
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
  /** Computed missing-skill slugs at rejection time. Null until rejected. */
  rejectionReasons: string[] | null;
  /** ISO timestamp when the anti-ghost sweep flagged this. Null otherwise. */
  flaggedAsGhostedAt: string | null;
  /** Latest interview, if scheduled. Surfaces in both employer + seeker views. */
  interview: PublicInterview | null;
  /** Concrete start time of the next shift (ISO), or null if none set. */
  nextShiftAt: string | null;
  /** ISO time the worker acknowledged the pre-shift checklist, or null. */
  prepAcknowledgedAt: string | null;
  /**
   * Night-before confirmation state, collapsed for the UI:
   *   'none'      — no shift scheduled, or too early to have prompted
   *   'awaiting'  — prompted, worker hasn't replied (employer: line up backfill)
   *   'confirmed' — worker confirmed they're coming
   *   'declined'  — worker said they can't make it
   */
  shiftConfirmation: 'none' | 'awaiting' | 'confirmed' | 'declined';
  /** Time-boxed offer state for the UI. */
  offer: {
    status: 'none' | 'pending' | 'accepted' | 'declined' | 'expired' | 'countered';
    /** ISO expiry of a pending offer, else null. */
    expiresAt: string | null;
    /** Wage the offer is at (paise), or null. */
    wageAmount: number | null;
    /** Worker's counter wage (paise) when countered, else null. */
    counterWageAmount: number | null;
  };
  /** "On my way" status, or null when not en route. */
  onTheWay: {
    active: boolean;
    etaMinutes: number | null;
    startedAt: string | null;
  };
  /** Job-tuned Smart Resume snapshot — shown on the employer's applicant view. */
  tailoredResume: ApplicationTailoredResume | null;
  /** Hydrated by the service when listing for the seeker. */
  job?: import('@/modules/jobs/job.model').PublicJob;
  createdAt: string;
}
