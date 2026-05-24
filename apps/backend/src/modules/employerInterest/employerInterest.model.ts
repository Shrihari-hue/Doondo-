/**
 * EmployerInterest — a worker's inbound "I'd like to work for you" signal
 * raised against an employer.
 *
 * This is the inbound half of two-way discovery. A worker browsing the
 * seeker-side employer profile can express interest even when that
 * employer has no live job posted — the employer then sees a standing
 * list of workers who want in, in their Find-workers surface.
 *
 * One standing interest per (seeker, employer) — enforced by a compound
 * unique index. Re-expressing simply refreshes the existing row (resets
 * it to `pending` and updates the message) rather than piling up
 * duplicates, which also rate-limits a worker to one ping per employer.
 *
 * Status:
 *   pending   → raised, the employer hasn't looked
 *   viewed    → the employer opened it
 *   archived  → the employer cleared it from their active list
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const EMPLOYER_INTEREST_STATUSES = [
  'pending',
  'viewed',
  'archived',
] as const;
export type EmployerInterestStatus =
  (typeof EMPLOYER_INTEREST_STATUSES)[number];

export interface EmployerInterest {
  seekerId: Schema.Types.ObjectId;
  employerId: Schema.Types.ObjectId;
  /** Optional short note from the worker. */
  message?: string | null;
  status: EmployerInterestStatus;
  /** When the employer first opened it. Null while pending. */
  viewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicEmployerInterest {
  id: string;
  status: EmployerInterestStatus;
  message: string | null;
  seekerId: string;
  employerId: string;
  viewedAt: string | null;
  createdAt: string;
  /** Hydrated by the service for the employer's inbound-list view. */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    isVerified: boolean;
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
}

interface EmployerInterestMethods {
  toPublicJSON(): PublicEmployerInterest;
}

export type EmployerInterestDocument = HydratedDocument<
  EmployerInterest,
  EmployerInterestMethods
>;
type EmployerInterestModelType = Model<
  EmployerInterest,
  Record<string, never>,
  EmployerInterestMethods
>;

const employerInterestSchema = new Schema<
  EmployerInterest,
  EmployerInterestModelType,
  EmployerInterestMethods
>(
  {
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
    message: { type: String, default: null, trim: true, maxlength: 240 },
    status: {
      type: String,
      enum: EMPLOYER_INTEREST_STATUSES,
      default: 'pending',
      index: true,
    },
    viewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One standing interest per (seeker, employer). Re-expressing upserts it.
employerInterestSchema.index({ seekerId: 1, employerId: 1 }, { unique: true });
// Employer inbound list: "workers interested in me, newest first".
employerInterestSchema.index({ employerId: 1, status: 1, createdAt: -1 });

employerInterestSchema.method('toPublicJSON', function (
  this: EmployerInterestDocument,
): PublicEmployerInterest {
  return {
    id: this._id.toString(),
    status: this.status,
    message: this.message ?? null,
    seekerId: this.seekerId.toString(),
    employerId: this.employerId.toString(),
    viewedAt: this.viewedAt ? this.viewedAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const EmployerInterestModel = model<
  EmployerInterest,
  EmployerInterestModelType
>('EmployerInterest', employerInterestSchema);
