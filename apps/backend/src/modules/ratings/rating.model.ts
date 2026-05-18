/**
 * Rating — one user's review of another, scoped to a completed job.
 *
 * Both directions exist:
 *   - Employer rates the seeker after hiring.
 *   - Seeker rates the employer after the work is done.
 *
 * Constraints:
 *   - Only ratings against a `hired` application are allowed.
 *   - At most ONE rating per (reviewerId, applicationId) pair — i.e. each
 *     party rates the other side once per job, no double-dipping.
 *   - Score is 1..5 integer. Comment is optional, capped at 500 chars.
 *
 * Aggregation:
 *   - `summarizeForUser(userId)` returns `{avg, count}` — used by
 *     `user.toPublicJSON()` to show "4.6 ⭐ 32 employers rated" style
 *     copy. We compute on read; can swap for a denormalised counter
 *     on the user document if read volume justifies later.
 */

import { Schema, model, type Model, type HydratedDocument, type Types } from 'mongoose';

export const RATING_ROLES = ['employer', 'seeker'] as const;
export type RatingRole = (typeof RATING_ROLES)[number];

export interface Rating {
  /** Who left the rating. */
  reviewerId: Schema.Types.ObjectId;
  /** Who's being rated. */
  revieweeId: Schema.Types.ObjectId;
  /** The application this rating is for — must be in `hired` status. */
  applicationId: Schema.Types.ObjectId;
  /** Job this rating belongs to — convenience for queries. */
  jobId: Schema.Types.ObjectId;
  /** Role of the REVIEWEE — 'seeker' means a seeker received the rating. */
  role: RatingRole;
  /** 1..5 integer. */
  score: number;
  /** Optional comment, max 500 chars. */
  comment?: string | null;
  /**
   * Structured tags — slugs from tagCatalog.ts. Defaults to empty for
   * back-compat with rows created before tags shipped. Validated
   * server-side against the role's allowed-tag list.
   */
  tags: string[];
  /**
   * When true, the public listing hides the reviewer's name + photo.
   * The Rating row itself still references the real reviewerId so
   * admins can investigate abuse and per-(reviewer,application)
   * uniqueness is preserved. Defaults to false so existing reviews
   * are unaffected.
   */
  anonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicRating {
  id: string;
  /** Null when the review was posted anonymously. The DB row still has the id. */
  reviewerId: string | null;
  /** "Anonymous worker" / "Anonymous employer" when the review is anonymous. */
  reviewerName: string;
  /** Null when anonymous. */
  reviewerPhotoUrl: string | null;
  revieweeId: string;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  role: RatingRole;
  score: number;
  comment: string | null;
  tags: string[];
  /** Whether this review was posted anonymously. UI uses it to show a small chip. */
  anonymous: boolean;
  createdAt: string;
}

export interface RatingSummary {
  avg: number;
  count: number;
}

interface RatingMethods {
  toPublicJSON(populated: {
    reviewerName: string;
    reviewerPhotoUrl: string | null;
    jobTitle: string;
  }): PublicRating;
}

export type RatingDocument = HydratedDocument<Rating, RatingMethods>;

type RatingModelType = Model<Rating, Record<string, never>, RatingMethods>;

const ratingSchema = new Schema<Rating, RatingModelType, RatingMethods>(
  {
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    revieweeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: RATING_ROLES,
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Score must be an integer between 1 and 5',
      },
    },
    comment: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length <= 6,
        message: 'A review may carry at most 6 tags',
      },
    },
    anonymous: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// One rating per (reviewer, application). Prevents double-rating and
// makes "did I already rate this?" a single indexed lookup.
ratingSchema.index({ reviewerId: 1, applicationId: 1 }, { unique: true });

// "Show me all ratings of this user, newest first" — main profile query.
ratingSchema.index({ revieweeId: 1, createdAt: -1 });

ratingSchema.method('toPublicJSON', function (
  this: RatingDocument,
  populated: { reviewerName: string; reviewerPhotoUrl: string | null; jobTitle: string },
): PublicRating {
  // Anonymous review: never leak the reviewer's id, name or photo.
  // The "anonymous" label depends on the rating direction so the UI
  // can still differentiate "Anonymous worker" from "Anonymous employer".
  const isAnon = Boolean(this.anonymous);
  // role === 'employer' means a SEEKER wrote this review (about an employer).
  const anonLabel = this.role === 'employer' ? 'Anonymous worker' : 'Anonymous employer';

  return {
    id: this._id.toString(),
    reviewerId: isAnon
      ? null
      : (this.reviewerId as unknown as Types.ObjectId).toString(),
    reviewerName: isAnon ? anonLabel : populated.reviewerName,
    reviewerPhotoUrl: isAnon ? null : populated.reviewerPhotoUrl,
    revieweeId: (this.revieweeId as unknown as Types.ObjectId).toString(),
    applicationId: (this.applicationId as unknown as Types.ObjectId).toString(),
    jobId: (this.jobId as unknown as Types.ObjectId).toString(),
    jobTitle: populated.jobTitle,
    role: this.role,
    score: this.score,
    comment: this.comment ?? null,
    tags: Array.isArray(this.tags) ? [...this.tags] : [],
    anonymous: isAnon,
    createdAt: this.createdAt.toISOString(),
  };
});

export const RatingModel = model<Rating, RatingModelType>('Rating', ratingSchema);
