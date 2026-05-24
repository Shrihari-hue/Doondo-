/**
 * HiringRequest — an employer's outbound invitation to a specific worker
 * to apply for a specific job.
 *
 * This is the employer-initiated mirror of an Application. Where an
 * Application is the worker reaching out ("I want this job"), a
 * HiringRequest is the employer reaching out ("I want *you* for this
 * job") — the outbound half of two-way discovery, sent from the worker
 * map / Find-workers surface.
 *
 * Lifecycle:
 *   pending    → sent; the worker hasn't responded
 *   accepted   → worker said yes. An Application is created/linked and
 *                `applicationId` is stamped, so the worker drops straight
 *                into that job's applicant pipeline.
 *   declined   → worker said no
 *   withdrawn  → employer cancelled the request before a response
 *   expired    → no response within the expiry window. Computed lazily —
 *                we never run a cron; a pending row past `expiresAt`
 *                simply reads as expired (see hiringRequest.service).
 *
 * One *live* (pending) request per (employer, seeker, job) — enforced in
 * the service rather than by a DB unique index, so an employer can
 * re-invite a worker after an earlier decline or withdrawal.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const HIRING_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
] as const;
export type HiringRequestStatus = (typeof HIRING_REQUEST_STATUSES)[number];

/** Pending requests go stale after this many days with no response. */
export const HIRING_REQUEST_TTL_DAYS = 7;

// ─── Document interface ─────────────────────────────────────────────────────

export interface HiringRequest {
  employerId: Schema.Types.ObjectId;
  seekerId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  /** Optional short note from the employer ("Can you start Monday?"). */
  message?: string | null;
  status: HiringRequestStatus;
  /** Set when the worker accepts — links to the Application that was created. */
  applicationId?: Schema.Types.ObjectId | null;
  /** When the worker accepted/declined. Null while pending. */
  respondedAt?: Date | null;
  /** Pending requests past this instant read as `expired`. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight party summary embedded in the hydrated public shape. */
export interface HiringRequestParty {
  id: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
}

export interface HiringRequestJob {
  id: string;
  title: string;
  status: string;
}

export interface PublicHiringRequest {
  id: string;
  status: HiringRequestStatus;
  message: string | null;
  jobId: string;
  employerId: string;
  seekerId: string;
  applicationId: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Hydrated by the service for the worker's inbox view. */
  employer?: HiringRequestParty;
  /** Hydrated by the service for the employer's sent-list view. */
  seeker?: HiringRequestParty & {
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
  /** Hydrated by the service on both views. */
  job?: HiringRequestJob;
}

interface HiringRequestMethods {
  toPublicJSON(): PublicHiringRequest;
}

export type HiringRequestDocument = HydratedDocument<
  HiringRequest,
  HiringRequestMethods
>;
type HiringRequestModelType = Model<
  HiringRequest,
  Record<string, never>,
  HiringRequestMethods
>;

// ─── Schema ─────────────────────────────────────────────────────────────────

const hiringRequestSchema = new Schema<
  HiringRequest,
  HiringRequestModelType,
  HiringRequestMethods
>(
  {
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
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
    message: { type: String, default: null, trim: true, maxlength: 240 },
    status: {
      type: String,
      enum: HIRING_REQUEST_STATUSES,
      default: 'pending',
      index: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      default: null,
    },
    respondedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Worker inbox: "my hiring requests, newest first" (optionally by status).
hiringRequestSchema.index({ seekerId: 1, status: 1, createdAt: -1 });
// Employer sent-list: "requests I've sent, newest first".
hiringRequestSchema.index({ employerId: 1, createdAt: -1 });
// Duplicate-pending guard lookup — (employer, seeker, job, status).
hiringRequestSchema.index({ employerId: 1, seekerId: 1, jobId: 1, status: 1 });

hiringRequestSchema.method('toPublicJSON', function (
  this: HiringRequestDocument,
): PublicHiringRequest {
  return {
    id: this._id.toString(),
    status: this.status,
    message: this.message ?? null,
    jobId: this.jobId.toString(),
    employerId: this.employerId.toString(),
    seekerId: this.seekerId.toString(),
    applicationId: this.applicationId ? this.applicationId.toString() : null,
    respondedAt: this.respondedAt ? this.respondedAt.toISOString() : null,
    expiresAt: this.expiresAt.toISOString(),
    createdAt: this.createdAt.toISOString(),
  };
});

export const HiringRequestModel = model<HiringRequest, HiringRequestModelType>(
  'HiringRequest',
  hiringRequestSchema,
);
