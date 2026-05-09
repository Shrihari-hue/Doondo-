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

// ─── Enum ───────────────────────────────────────────────────────────────────

export const APPLICATION_STATUSES = [
  'pending',
  'viewed',
  'shortlisted',
  'rejected',
  'hired',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// ─── Document interface ─────────────────────────────────────────────────────

export interface Application {
  seekerId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  /** Reference to employer for fast inverse lookups in Phase 3. */
  employerId: Schema.Types.ObjectId;
  status: ApplicationStatus;
  coverNote?: string | null;
  /** Per-status timestamps. null until that status is reached. */
  appliedAt: Date;
  viewedAt?: Date | null;
  shortlistedAt?: Date | null;
  rejectedAt?: Date | null;
  hiredAt?: Date | null;
  withdrawnAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ApplicationDocument = HydratedDocument<Application>;

interface ApplicationMethods {
  toPublicJSON(): PublicApplication;
}

export interface PublicApplication {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  timeline: {
    appliedAt: string;
    viewedAt: string | null;
    shortlistedAt: string | null;
    rejectedAt: string | null;
    hiredAt: string | null;
    withdrawnAt: string | null;
  };
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
    appliedAt: { type: Date, default: Date.now },
    viewedAt: { type: Date, default: null },
    shortlistedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    hiredAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
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
    timeline: {
      appliedAt: this.appliedAt.toISOString(),
      viewedAt: this.viewedAt ? this.viewedAt.toISOString() : null,
      shortlistedAt: this.shortlistedAt ? this.shortlistedAt.toISOString() : null,
      rejectedAt: this.rejectedAt ? this.rejectedAt.toISOString() : null,
      hiredAt: this.hiredAt ? this.hiredAt.toISOString() : null,
      withdrawnAt: this.withdrawnAt ? this.withdrawnAt.toISOString() : null,
    },
    createdAt: this.createdAt.toISOString(),
  };
});

export const ApplicationModel = model<Application, ApplicationModel>(
  'Application',
  applicationSchema,
);
