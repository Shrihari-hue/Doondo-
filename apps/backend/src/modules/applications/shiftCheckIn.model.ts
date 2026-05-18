/**
 * ShiftCheckIn — durable record of a worker arriving at (or leaving)
 * a hired job site.
 *
 * Two reasons we persist these instead of just a boolean on the
 * application:
 *   1. Multi-shift jobs (catering, security, gigs) have many check-ins
 *      per application. A boolean would collapse the history.
 *   2. Disputes need evidence. The selfie + geo + timestamp together
 *      give both sides a record neither can fake unilaterally.
 *
 * Geo strategy:
 *   - We store the device's coordinates AND the great-circle distance
 *     from the job's `location.geo` at the moment of check-in.
 *   - The service rejects check-ins beyond `MAX_DISTANCE_METERS` from
 *     the job — a soft fence to prevent obvious cheating without
 *     making the worker walk a tightrope on a flexible site.
 *
 * Selfie storage:
 *   - Base64 data URL on the row, same pattern as the existing
 *     `photoUrl` and `selfiePhotoUrl` fields. Capped tightly so the
 *     document stays small.
 *   - `select: false` because the bytes shouldn't ship in every list
 *     read. Callers pull the data URL explicitly when they need it.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const SHIFT_CHECKIN_KINDS = ['check_in', 'check_out'] as const;
export type ShiftCheckInKind = (typeof SHIFT_CHECKIN_KINDS)[number];

export interface ShiftCheckInGeo {
  type: 'Point';
  coordinates: [number, number];
}

export interface ShiftCheckIn {
  applicationId: Schema.Types.ObjectId;
  /** Convenience denormalisations. */
  seekerId: Schema.Types.ObjectId;
  employerId: Schema.Types.ObjectId;
  jobId: Schema.Types.ObjectId;
  kind: ShiftCheckInKind;
  /** Base64 data URL of the selfie taken at check-in. select:false. */
  selfieUrl: string;
  geo: ShiftCheckInGeo;
  /**
   * Great-circle distance from the job's saved location, in meters,
   * computed at create time. Null when the job has no geo on file.
   */
  distanceFromJobMeters?: number | null;
  /** When the device captured the check-in. Defaults to server time. */
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicShiftCheckIn {
  id: string;
  applicationId: string;
  seekerId: string;
  employerId: string;
  jobId: string;
  kind: ShiftCheckInKind;
  /** Selfie URL — present only when the caller is the seeker or the employer on this application. */
  selfieUrl: string | null;
  location: { lat: number; lng: number };
  distanceFromJobMeters: number | null;
  timestamp: string;
  createdAt: string;
}

interface ShiftCheckInMethods {
  /** Caller-aware: omits `selfieUrl` when `includeSelfie` is false. */
  toPublicJSON(opts?: { includeSelfie?: boolean }): PublicShiftCheckIn;
}

export type ShiftCheckInDocument = HydratedDocument<ShiftCheckIn, ShiftCheckInMethods>;
type ShiftCheckInModelType = Model<ShiftCheckIn, Record<string, never>, ShiftCheckInMethods>;

const shiftCheckInSchema = new Schema<ShiftCheckIn, ShiftCheckInModelType, ShiftCheckInMethods>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employerId: {
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
    kind: { type: String, enum: SHIFT_CHECKIN_KINDS, required: true },
    selfieUrl: {
      type: String,
      required: true,
      // ~400KB of base64 after compression on the device. Larger than
      // photoUrl because faces need clarity to settle a dispute.
      maxlength: 550_000,
      select: false,
    },
    geo: {
      type: new Schema(
        {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: {
            type: [Number],
            validate: {
              validator: (v: number[]) =>
                Array.isArray(v) && v.length === 2 &&
                v[0]! >= -180 && v[0]! <= 180 &&
                v[1]! >= -90 && v[1]! <= 90,
              message: 'coordinates must be [lng, lat] with valid ranges',
            },
          },
        },
        { _id: false },
      ),
      required: true,
    },
    distanceFromJobMeters: { type: Number, default: null, min: 0 },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Common reads:
shiftCheckInSchema.index({ applicationId: 1, timestamp: -1 });
shiftCheckInSchema.index({ seekerId: 1, timestamp: -1 });
shiftCheckInSchema.index({ employerId: 1, timestamp: -1 });
shiftCheckInSchema.index({ 'geo.coordinates': '2dsphere' });

shiftCheckInSchema.method('toPublicJSON', function (
  this: ShiftCheckInDocument,
  opts?: { includeSelfie?: boolean },
): PublicShiftCheckIn {
  return {
    id: this._id.toString(),
    applicationId: this.applicationId.toString(),
    seekerId: this.seekerId.toString(),
    employerId: this.employerId.toString(),
    jobId: this.jobId.toString(),
    kind: this.kind,
    selfieUrl: opts?.includeSelfie ? this.selfieUrl ?? null : null,
    location: {
      lat: this.geo.coordinates[1]!,
      lng: this.geo.coordinates[0]!,
    },
    distanceFromJobMeters: this.distanceFromJobMeters ?? null,
    timestamp: this.timestamp.toISOString(),
    createdAt: this.createdAt.toISOString(),
  };
});

export const ShiftCheckInModel = model<ShiftCheckIn, ShiftCheckInModelType>(
  'ShiftCheckIn',
  shiftCheckInSchema,
);
