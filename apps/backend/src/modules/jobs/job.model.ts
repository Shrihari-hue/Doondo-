/**
 * Job types — shared shapes for a posting from an employer that seekers
 * can apply to. The actual row lives in Postgres (see src/db/schema/jobs.ts);
 * this file holds the pure TS types/consts/helpers still shared across
 * routes, schemas, and serializers.
 *
 * Pay strategy:
 *   - amount is stored as a NUMBER in the smallest unit of the currency
 *     (paise for INR, cents for USD). This avoids float drift in totals.
 *   - period describes the cadence ("hour", "day", "month", "fixed").
 *   - currency is ISO-4217. Default INR for the Indian market.
 *
 * Status lifecycle:
 *   active   → visible in nearby search
 *   paused   → invisible to seekers, employer can resume
 *   filled   → invisible, employer marked it hired
 *   expired  → visible only in employer history
 */

import type { WomenSafety, WomenSafetyTier } from './womenSafety';

export type { WomenSafety, WomenSafetyTier } from './womenSafety';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const JOB_TYPES = ['full_time', 'part_time', 'gig', 'shift', 'contract'] as const;
export type JobType = (typeof JOB_TYPES)[number];

/**
 * Work mode — where the role is actually performed. Defaults to onsite
 * since most Doondo postings are physical (delivery, construction, etc.).
 * Surfaced for white-collar / hybrid-office roles where it matters
 * a lot to the candidate. Filterable on /jobs/nearby.
 */
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const PAY_PERIODS = ['hour', 'day', 'week', 'month', 'fixed'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const JOB_STATUSES = ['active', 'paused', 'filled', 'expired'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build the PublicJob `project` block from a stored start/end date pair.
 * Returns null unless both are set; totalDays is the inclusive span.
 */
export function buildProject(
  start: Date | string | null,
  end: Date | string | null,
): { startDate: string; endDate: string; totalDays: number } | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const totalDays = Math.max(1, Math.floor((e.getTime() - s.getTime()) / DAY_MS) + 1);
  return {
    startDate: s.toISOString().slice(0, 10),
    endDate: e.toISOString().slice(0, 10),
    totalDays,
  };
}

// ─── Subdocuments ───────────────────────────────────────────────────────────

interface Schedule {
  /** Days of the week the job runs (0=Sun..6=Sat). Empty = any day. */
  days?: number[];
  /** Start time HH:MM (24h), e.g. "09:30". Optional for flexible jobs. */
  startTime?: string | null;
  endTime?: string | null;
  /** Total hours per day, if applicable. */
  hoursPerDay?: number | null;
}

/**
 * Reverse Interview — the employer's public, on-the-record answers to
 * the questions workers actually care about but rarely get to ask. Set
 * at post time, shown to seekers on the job detail *before* they apply.
 * Each field is a tri-state: true (yes), false (no), or null/absent
 * (the employer didn't answer — which is itself visible to the seeker).
 */
export interface WorkplaceAnswers {
  /** Wages paid on time. */
  paysOnTime?: boolean | null;
  /** Overtime is paid extra. */
  overtimePaid?: boolean | null;
  /** Safety equipment (PPE) provided. */
  providesPpe?: boolean | null;
  /** A written contract is given. */
  writtenContract?: boolean | null;
  /** Separate facilities for women on site. */
  womensFacilities?: boolean | null;
}

/** Shape sent to the seeker mobile client. */
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
    /** [lng, lat] — clients render with this. */
    coordinates: [number, number];
  };
  skills: string[];
  /** Onsite (default), hybrid, or remote. */
  workMode: WorkMode;
  /** Slug of an attached self-qualifying skill check, or null. */
  requiredSkillTestId: string | null;
  /** How many people to hire. 1 unless the post is bulk. */
  headcount: number;
  /** ISO time until which the post is crew-only, or null if public. */
  crewHeadStartUntil: string | null;
  /** True when this is a standing weekly shift (repeats on schedule.days). */
  recurring: boolean;
  /** Pre-shift checklist items the worker acknowledges. Empty = none. */
  prepChecklist: string[];
  /**
   * Multi-day project span when the post is a project, else null.
   * Dates are YYYY-MM-DD; totalDays is the inclusive day count.
   */
  project: { startDate: string; endDate: string; totalDays: number } | null;
  /**
   * Auto-escalation state, surfaced so the employer sees a "Boosted" /
   * "Needs attention" badge on a stalling post. stage 0 = none.
   */
  escalationStage: number;
  /** ISO time the feed-boost is active until, or null. */
  boostedUntil: string | null;
  schedule: Schedule | null;
  status: JobStatus;
  /** True if the employer has marked this posting as time-sensitive. */
  urgent: boolean;
  /** Employer-asserted safe-for-women claim. Surfaced as a green pill. */
  safeForWomen: boolean;
  applicantsCount: number;
  /** Voice description data URL — present only when the employer recorded one. */
  audioDescriptionUrl: string | null;
  /** Duration of the voice description in seconds. */
  audioDescriptionDurationSeconds: number | null;
  /** Reverse Interview answers, or null when the employer skipped them. */
  workplaceAnswers: WorkplaceAnswers | null;
  /** Employer-declared women-safety signals, or null when not filled. */
  womenSafety: WomenSafety | null;
  /** Women-safety tier derived from the signals — drives the badge. */
  womenSafetyTier: WomenSafetyTier;
  /** Distance from query point in meters. Set by the nearby query, undefined elsewhere. */
  distanceMeters?: number;
  /** Hydrated employer summary — set by routes that join. */
  employer?: {
    id: string;
    name: string;
    isVerified: boolean;
    photoUrl?: string | null;
    companyName?: string | null;
  };
  createdAt: string;
}
