/**
 * Job — a posting from an employer that seekers can apply to.
 *
 * Designed for Phase 2's seeker loop: nearby search, detail view, apply.
 * Phase 3 (employer flow) will add edit/pause/close transitions; for now
 * jobs are mostly created via the seed script.
 *
 * Geo strategy:
 *   - location.geo is a GeoJSON Point: [lng, lat] (Mongo's required order).
 *   - 2dsphere index on location.geo enables $geoNear / $near queries.
 *   - location.address is a flat human-readable string for display.
 *   - location.city / area / pincode are searchable filters.
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
 *
 * Phase 2 only ever sees active jobs in nearby search; the others are
 * supported in the schema so we don't have to migrate later.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const JOB_TYPES = ['full_time', 'part_time', 'gig', 'shift', 'contract'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const PAY_PERIODS = ['hour', 'day', 'week', 'month', 'fixed'] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const JOB_STATUSES = ['active', 'paused', 'filled', 'expired'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ─── Subdocuments ───────────────────────────────────────────────────────────

interface Pay {
  amount: number; // smallest unit of currency (paise for INR)
  period: PayPeriod;
  currency: string; // ISO-4217 (e.g. "INR")
  /** Optional upper bound for ranges; if set, amount is the lower bound. */
  amountMax?: number | null;
}

interface JobLocation {
  address: string; // flat display string ("Indiranagar, Bengaluru")
  city: string;
  area?: string | null;
  pincode?: string | null;
  geo: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface Schedule {
  /** Days of the week the job runs (0=Sun..6=Sat). Empty = any day. */
  days?: number[];
  /** Start time HH:MM (24h), e.g. "09:30". Optional for flexible jobs. */
  startTime?: string | null;
  endTime?: string | null;
  /** Total hours per day, if applicable. */
  hoursPerDay?: number | null;
}

// ─── Document interface ─────────────────────────────────────────────────────

export interface Job {
  employerId: Schema.Types.ObjectId;
  title: string;
  description: string;
  type: JobType;
  pay: Pay;
  location: JobLocation;
  skills: string[];
  schedule?: Schedule | null;
  status: JobStatus;
  /**
   * Marks the job as time-sensitive. Effects:
   *   - Sorts ahead of non-urgent in nearby results (after distance bucket).
   *   - Renders an "Urgent" pill on cards and detail screens.
   *   - Triggers an opt-in push notification to nearby seekers when first set.
   * Toggleable by the employer at any time before the job is filled/expired.
   */
  urgent: boolean;
  /** Counts maintained denormalised for cheap list rendering. */
  applicantsCount: number;
  viewsCount: number;
  /** When the posting auto-expires. Null = no auto-expiry. */
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type JobDocument = HydratedDocument<Job>;

interface JobMethods {
  toPublicJSON(): PublicJob;
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
  schedule: Schedule | null;
  status: JobStatus;
  /** True if the employer has marked this posting as time-sensitive. */
  urgent: boolean;
  applicantsCount: number;
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

type JobModelType = Model<Job, Record<string, never>, JobMethods>;

// ─── Schema ─────────────────────────────────────────────────────────────────

const paySchema = new Schema<Pay>(
  {
    amount: { type: Number, required: true, min: 0 },
    amountMax: { type: Number, default: null, min: 0 },
    period: { type: String, required: true, enum: PAY_PERIODS },
    currency: { type: String, required: true, default: 'INR', uppercase: true, length: 3 },
  },
  { _id: false },
);

const locationSchema = new Schema<JobLocation>(
  {
    address: { type: String, required: true, trim: true, maxlength: 240 },
    city: { type: String, required: true, trim: true, maxlength: 80, index: true },
    area: { type: String, default: null, trim: true, maxlength: 80 },
    pincode: { type: String, default: null, trim: true, maxlength: 12 },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
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
  },
  { _id: false },
);

const scheduleSchema = new Schema<Schedule>(
  {
    days: { type: [Number], default: undefined },
    startTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    hoursPerDay: { type: Number, default: null, min: 0, max: 24 },
  },
  { _id: false },
);

const jobSchema = new Schema<Job, JobModelType, JobMethods>(
  {
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, required: true, enum: JOB_TYPES, index: true },
    pay: { type: paySchema, required: true },
    location: { type: locationSchema, required: true },
    skills: { type: [String], default: [], index: true },
    schedule: { type: scheduleSchema, default: null },
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: 'active',
      index: true,
    },
    urgent: { type: Boolean, default: false, index: true },
    applicantsCount: { type: Number, default: 0, min: 0 },
    viewsCount: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// 2dsphere index — the engine of nearby search.
jobSchema.index({ 'location.geo': '2dsphere' });

// Compound index for the most common "active jobs in city, sorted recent" query.
jobSchema.index({ status: 1, 'location.city': 1, createdAt: -1 });

jobSchema.method('toPublicJSON', function (this: JobDocument): PublicJob {
  return {
    id: this._id.toString(),
    title: this.title,
    description: this.description,
    type: this.type,
    pay: {
      amount: this.pay.amount,
      amountMax: this.pay.amountMax ?? null,
      period: this.pay.period,
      currency: this.pay.currency,
    },
    location: {
      address: this.location.address,
      city: this.location.city,
      area: this.location.area ?? null,
      pincode: this.location.pincode ?? null,
      coordinates: this.location.geo.coordinates,
    },
    skills: this.skills,
    schedule: this.schedule ?? null,
    status: this.status,
    urgent: Boolean(this.urgent),
    applicantsCount: this.applicantsCount,
    createdAt: this.createdAt.toISOString(),
  };
});

export const JobModel = model<Job, JobModelType>('Job', jobSchema);
