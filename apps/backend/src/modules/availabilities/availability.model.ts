/**
 * Availability — a seeker's short-lived "I'm available right now" beacon.
 *
 * Reverses the search direction: instead of the worker browsing jobs,
 * they raise a flag that says *"I'm in BTM, free for the next 2 hours,
 * happy to do delivery or helper work"* — and employers nearby see
 * them in real time.
 *
 * Lifecycle:
 *   - Seeker publishes via POST /me/availability with a duration. We
 *     store `until = now + durationMs`.
 *   - TTL index on `until` makes Mongo auto-delete expired beacons.
 *     No cleanup cron, no stale rows.
 *   - One active beacon per seeker (unique index on seekerId). Re-posting
 *     while one's already live overwrites it (so picking a new duration
 *     or trade set is a simple replace).
 *
 * Geo strategy:
 *   - GeoJSON Point on `location.geo` with a 2dsphere index, identical
 *     in shape to the Job geo so the employer's nearby query reuses the
 *     same $geoNear muscle memory.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';
import { JOB_TYPES } from '@/modules/jobs/job.model';

/**
 * Recurring schedule — "every Mon/Wed/Fri 7am-10am". When set, the
 * employer-facing nearby query treats the seeker as live during any
 * pattern window even if they haven't manually raised the beacon today.
 * `until` still drives the doc's TTL — recurring beacons live for a
 * rolling window (currently 30 days) before they need to be re-raised.
 */
export interface RecurringPattern {
  /** Days of week: 0=Sunday..6=Saturday. */
  days: number[];
  /** Window start, "HH:MM" 24h. */
  startTime: string;
  /** Window end, "HH:MM" 24h. */
  endTime: string;
}

export interface Availability {
  seekerId: Schema.Types.ObjectId;
  /** Free-text trade slugs the seeker is up for (e.g. "delivery", "helper"). */
  tradesAvailable: string[];
  /** Job-type preferences — empty = any type. Same enum as Job.type. */
  jobTypes: string[];
  location: {
    /** Plain city/area string for display. */
    city?: string | null;
    area?: string | null;
    geo: {
      type: 'Point';
      coordinates: [number, number]; // [lng, lat]
    };
  };
  /** When the beacon expires. TTL-indexed so Mongo auto-cleans. */
  until: Date;
  /**
   * Optional weekly recurring window. When set, the seeker is also
   * considered "available now" whenever the current time falls inside
   * a pattern window — even past `until` for a one-shot beacon.
   * Null = beacon ends when `until` passes (the original v1 shape).
   */
  recurringPattern?: RecurringPattern | null;
  /** Optional free-text note ("Have my own bike", "Can lift heavy"). */
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicAvailability {
  id: string;
  seekerId: string;
  tradesAvailable: string[];
  jobTypes: string[];
  location: {
    city: string | null;
    area: string | null;
    coordinates: [number, number];
  };
  until: string;
  recurringPattern: RecurringPattern | null;
  note: string | null;
  createdAt: string;
}

interface AvailabilityMethods {
  toPublicJSON(): PublicAvailability;
}

export type AvailabilityDocument = HydratedDocument<Availability, AvailabilityMethods>;
type AvailabilityModelType = Model<Availability, Record<string, never>, AvailabilityMethods>;

const availabilitySchema = new Schema<Availability, AvailabilityModelType, AvailabilityMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Unique — one active beacon per seeker. Re-posting replaces it.
      unique: true,
    },
    tradesAvailable: { type: [String], default: [] },
    jobTypes: {
      type: [{ type: String, enum: JOB_TYPES }],
      default: [],
    },
    location: {
      city: { type: String, default: null, trim: true, maxlength: 80 },
      area: { type: String, default: null, trim: true, maxlength: 80 },
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
            message: 'coordinates must be [lng, lat]',
          },
        },
      },
    },
    until: { type: Date, required: true },
    recurringPattern: {
      type: new Schema<RecurringPattern>(
        {
          days: {
            type: [Number],
            default: [],
            validate: {
              validator: (v: number[]) =>
                Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
              message: 'days must be integers 0..6',
            },
          },
          startTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
          },
          endTime: {
            type: String,
            required: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
          },
        },
        { _id: false },
      ),
      default: null,
    },
    note: { type: String, default: null, trim: true, maxlength: 240 },
  },
  { timestamps: true },
);

// TTL — Mongo deletes the doc when now > until. expireAfterSeconds: 0 means
// "the value of the indexed field is the expiry date".
availabilitySchema.index({ until: 1 }, { expireAfterSeconds: 0 });
// 2dsphere — feeds the employer's "nearby available" $geoNear query.
availabilitySchema.index({ 'location.geo': '2dsphere' });

availabilitySchema.method('toPublicJSON', function (
  this: AvailabilityDocument,
): PublicAvailability {
  return {
    id: this._id.toString(),
    seekerId: (this.seekerId as unknown as { toString(): string }).toString(),
    tradesAvailable: this.tradesAvailable ?? [],
    jobTypes: this.jobTypes ?? [],
    location: {
      city: this.location.city ?? null,
      area: this.location.area ?? null,
      coordinates: this.location.geo.coordinates,
    },
    until: this.until.toISOString(),
    recurringPattern: this.recurringPattern
      ? {
          days: this.recurringPattern.days ?? [],
          startTime: this.recurringPattern.startTime,
          endTime: this.recurringPattern.endTime,
        }
      : null,
    note: this.note ?? null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const AvailabilityModel = model<Availability, AvailabilityModelType>(
  'Availability',
  availabilitySchema,
);
