/**
 * JobAlert — a seeker's saved job-search criteria.
 *
 * When an employer posts a new job, we run that job through every active
 * alert and fan out a push + in-app notification to seekers whose criteria
 * match. Cheaper and timelier than a periodic poll.
 *
 * One seeker can have several alerts (e.g. "Delivery in Indiranagar" and
 * "Helper in BTM") so they get separate, targeted pings rather than one
 * generic firehose.
 *
 * Matching rules — ALL of the following must be true:
 *   - alert.enabled
 *   - alert.jobTypes is empty OR contains the job's type
 *   - alert.city is null OR matches the job's city (case-insensitive)
 *   - alert.query is empty OR appears in the job's title/description/skills
 *   - alert.urgentOnly is false OR the job is urgent
 *
 * `radiusKm` + `coordinates` are accepted for forward-compat with a
 * proper geo match but the v1 matcher uses city as the geo filter.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';
import { JOB_TYPES, type JobType } from '@/modules/jobs/job.model';

export interface JobAlertCriteria {
  /** Substring searched against job title + description + skills. */
  query?: string | null;
  city?: string | null;
  jobTypes: JobType[];
  urgentOnly: boolean;
  /** Stored for future geo-based matching. v1 ignores. */
  radiusKm?: number | null;
  coordinates?: [number, number] | null;
}

export interface JobAlert extends JobAlertCriteria {
  seekerId: Schema.Types.ObjectId;
  /** Short label shown in the list view (e.g. "Delivery in Indiranagar"). */
  name: string;
  enabled: boolean;
  /** Most recent matched job + when, for dedupe + UI ("Last match: 2h ago"). */
  lastMatchedJobId?: Schema.Types.ObjectId | null;
  lastMatchedAt?: Date | null;
  /** Total jobs matched lifetime. Surfaced in the list row as a counter. */
  matchCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicJobAlert {
  id: string;
  name: string;
  query: string | null;
  city: string | null;
  jobTypes: JobType[];
  urgentOnly: boolean;
  radiusKm: number | null;
  coordinates: [number, number] | null;
  enabled: boolean;
  lastMatchedJobId: string | null;
  lastMatchedAt: string | null;
  matchCount: number;
  createdAt: string;
}

interface JobAlertMethods {
  toPublicJSON(): PublicJobAlert;
}

export type JobAlertDocument = HydratedDocument<JobAlert, JobAlertMethods>;
type JobAlertModel = Model<JobAlert, Record<string, never>, JobAlertMethods>;

const jobAlertSchema = new Schema<JobAlert, JobAlertModel, JobAlertMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    query: { type: String, default: null, trim: true, maxlength: 120 },
    city: { type: String, default: null, trim: true, maxlength: 80, index: true },
    jobTypes: {
      type: [{ type: String, enum: JOB_TYPES }],
      default: [],
    },
    urgentOnly: { type: Boolean, default: false },
    radiusKm: { type: Number, default: null, min: 0, max: 200 },
    coordinates: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (v: number[] | undefined) =>
          v === undefined ||
          (Array.isArray(v) &&
            v.length === 2 &&
            v[0]! >= -180 &&
            v[0]! <= 180 &&
            v[1]! >= -90 &&
            v[1]! <= 90),
        message: 'coordinates must be [lng, lat]',
      },
    },
    enabled: { type: Boolean, default: true, index: true },
    lastMatchedJobId: { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    lastMatchedAt: { type: Date, default: null },
    matchCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Most useful index: "all enabled alerts in this city, for fan-out matching".
// city + enabled is the hot path during job creation.
jobAlertSchema.index({ enabled: 1, city: 1 });

jobAlertSchema.method('toPublicJSON', function (
  this: JobAlertDocument,
): PublicJobAlert {
  return {
    id: this._id.toString(),
    name: this.name,
    query: this.query ?? null,
    city: this.city ?? null,
    jobTypes: this.jobTypes ?? [],
    urgentOnly: Boolean(this.urgentOnly),
    radiusKm: this.radiusKm ?? null,
    coordinates: this.coordinates ?? null,
    enabled: Boolean(this.enabled),
    lastMatchedJobId: this.lastMatchedJobId
      ? this.lastMatchedJobId.toString()
      : null,
    lastMatchedAt: this.lastMatchedAt ? this.lastMatchedAt.toISOString() : null,
    matchCount: this.matchCount,
    createdAt: this.createdAt.toISOString(),
  };
});

export const JobAlertModel = model<JobAlert, JobAlertModel>('JobAlert', jobAlertSchema);
