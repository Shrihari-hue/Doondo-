/**
 * Application — a seeker's interest in a specific job.
 *
 * One row per (seekerId, jobId). Compound unique index prevents duplicates.
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
 *
 * Each status change is timestamped on the document so we can show
 * "Shortlisted 2 hours ago" without joining audit tables.
 *
 * Real-time strategy:
 *   On every status change the service emits a socket event to the
 *   seeker's user-room: `application:status_changed` { applicationId,
 *   status, timestamp }. Mobile listens and updates the React Query
 *   cache without a full refetch.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

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

export interface Interview {
  scheduledFor: Date;
  mode: InterviewMode;
  /** Physical address for in_person, optional otherwise. */
  location?: string | null;
  /** Video meeting URL for video, optional otherwise. */
  meetingLink?: string | null;
  /** Free-form note from the employer (what to bring, who to ask for, etc). */
  notes?: string | null;
  status: InterviewStatus;
  scheduledAt: Date;
  cancelledAt?: Date | null;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface Application {
  seekerId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  /** Reference to employer for fast inverse lookups in Phase 3. */
  employerId: Schema.Types.ObjectId;
  status: ApplicationStatus;
  coverNote?: string | null;
  /**
   * True when the application came from a one-tap "I'm interested" press
   * (Today mode), false when it came from the full Apply flow with a
   * cover note. Lets employers prioritise/queue the interest pings
   * differently from formal applications. Defaults to false so existing
   * rows preserve their meaning.
   */
  expressedAsInterest?: boolean;
  /**
   * Snapshot of how many people are coming. Captured at apply time from
   * the seeker's `workType === 'team'` and `teamSize` so the employer
   * sees the actual headcount even if the seeker flips back to solo
   * later. Null = solo applicant (the default).
   */
  teamSizeSnapshot?: number | null;
  /** Per-status timestamps. null until that status is reached. */
  appliedAt: Date;
  viewedAt?: Date | null;
  shortlistedAt?: Date | null;
  rejectedAt?: Date | null;
  hiredAt?: Date | null;
  withdrawnAt?: Date | null;
  /** Latest interview attached to this application, if any. */
  interview?: Interview | null;
  createdAt: Date;
  updatedAt: Date;
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
}

interface ApplicationMethods {
  toPublicJSON(): PublicApplication;
}

export type ApplicationDocument = HydratedDocument<Application, ApplicationMethods>;

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
  timeline: {
    appliedAt: string;
    viewedAt: string | null;
    shortlistedAt: string | null;
    rejectedAt: string | null;
    hiredAt: string | null;
    withdrawnAt: string | null;
  };
  /** Latest interview, if scheduled. Surfaces in both employer + seeker views. */
  interview: PublicInterview | null;
  /** Hydrated by the service when listing for the seeker. */
  job?: import('@/modules/jobs/job.model').PublicJob;
  createdAt: string;
}

type ApplicationModel = Model<Application, Record<string, never>, ApplicationMethods>;

// ─── Schema ─────────────────────────────────────────────────────────────────

const applicationSchema = new Schema<Application, ApplicationModel, ApplicationMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: 'pending',
      index: true,
    },
    coverNote: { type: String, default: null, trim: true, maxlength: 500 },
    expressedAsInterest: { type: Boolean, default: false },
    teamSizeSnapshot: { type: Number, default: null, min: 2, max: 50 },
    appliedAt: { type: Date, default: Date.now },
    viewedAt: { type: Date, default: null },
    shortlistedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    hiredAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    interview: {
      type: new Schema<Interview>(
        {
          scheduledFor: { type: Date, required: true },
          mode: { type: String, enum: INTERVIEW_MODES, required: true },
          location: { type: String, default: null, trim: true, maxlength: 240 },
          meetingLink: { type: String, default: null, trim: true, maxlength: 500 },
          notes: { type: String, default: null, trim: true, maxlength: 1000 },
          status: { type: String, enum: INTERVIEW_STATUSES, default: 'scheduled' },
          scheduledAt: { type: Date, default: Date.now },
          cancelledAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

// One application per (seeker, job).
applicationSchema.index({ seekerId: 1, jobId: 1 }, { unique: true });
// Common query: "all my applications, newest first".
applicationSchema.index({ seekerId: 1, createdAt: -1 });
// Phase 3 query: "all applicants for an employer's jobs".
applicationSchema.index({ employerId: 1, status: 1, createdAt: -1 });

applicationSchema.method('toPublicJSON', function (
  this: ApplicationDocument,
): PublicApplication {
  return {
    id: this._id.toString(),
    jobId: this.jobId.toString(),
    status: this.status,
    coverNote: this.coverNote ?? null,
    expressedAsInterest: Boolean(this.expressedAsInterest),
    teamSizeSnapshot: this.teamSizeSnapshot ?? null,
    timeline: {
      appliedAt: this.appliedAt.toISOString(),
      viewedAt: this.viewedAt ? this.viewedAt.toISOString() : null,
      shortlistedAt: this.shortlistedAt ? this.shortlistedAt.toISOString() : null,
      rejectedAt: this.rejectedAt ? this.rejectedAt.toISOString() : null,
      hiredAt: this.hiredAt ? this.hiredAt.toISOString() : null,
      withdrawnAt: this.withdrawnAt ? this.withdrawnAt.toISOString() : null,
    },
    interview: this.interview
      ? {
          scheduledFor: this.interview.scheduledFor.toISOString(),
          mode: this.interview.mode,
          location: this.interview.location ?? null,
          meetingLink: this.interview.meetingLink ?? null,
          notes: this.interview.notes ?? null,
          status: this.interview.status,
          scheduledAt: this.interview.scheduledAt.toISOString(),
          cancelledAt: this.interview.cancelledAt
            ? this.interview.cancelledAt.toISOString()
            : null,
        }
      : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const ApplicationModel = model<Application, ApplicationModel>(
  'Application',
  applicationSchema,
);
