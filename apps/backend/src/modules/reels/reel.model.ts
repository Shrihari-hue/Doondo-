/**
 * Reel — a worker's short video intro for Hire Reels.
 *
 * One reel per worker (a unique index on `seekerId` enforces it): the
 * reel is the worker's "this is me" pitch, like a profile photo with a
 * voice. Re-recording replaces the existing reel rather than stacking.
 *
 * The document stores only a `videoUrl` — the bytes live on the media
 * host the reel-storage provider returns (see reelStorage.service). So
 * a Reel row is small and safe to project freely into the employer feed.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const REEL_STATUSES = ['active', 'hidden'] as const;
export type ReelStatus = (typeof REEL_STATUSES)[number];

export interface Reel {
  seekerId: Schema.Types.ObjectId;
  /** Where the stored video plays from (a CDN URL, or a mock placeholder). */
  videoUrl: string;
  /** Poster image URL, when the storage provider produced one. */
  thumbnailUrl: string | null;
  /** Clip length in seconds. */
  durationSeconds: number;
  /** Optional one-line caption the worker adds. */
  caption: string | null;
  status: ReelStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ReelMethods {
  toPublicJSON(): PublicReel;
}

export type ReelDocument = HydratedDocument<Reel, ReelMethods>;

/** Shape sent to the mobile client. */
export interface PublicReel {
  id: string;
  seekerId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  caption: string | null;
  createdAt: string;
  /** Hydrated worker summary — set by the feed route that joins users. */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
  };
}

type ReelModelType = Model<Reel, Record<string, never>, ReelMethods>;

const reelSchema = new Schema<Reel, ReelModelType, ReelMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // One reel per worker — the upload path upserts on this key.
      unique: true,
      index: true,
    },
    videoUrl: { type: String, required: true, maxlength: 2000 },
    thumbnailUrl: { type: String, default: null, maxlength: 2000 },
    durationSeconds: { type: Number, required: true, min: 0, max: 120 },
    caption: { type: String, default: null, trim: true, maxlength: 140 },
    status: {
      type: String,
      enum: REEL_STATUSES,
      default: 'active',
      index: true,
    },
  },
  { timestamps: true },
);

// Feed query — newest active reels first.
reelSchema.index({ status: 1, createdAt: -1 });

reelSchema.method('toPublicJSON', function (this: ReelDocument): PublicReel {
  return {
    id: this._id.toString(),
    seekerId: this.seekerId.toString(),
    videoUrl: this.videoUrl,
    thumbnailUrl: this.thumbnailUrl ?? null,
    durationSeconds: this.durationSeconds,
    caption: this.caption ?? null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const ReelModel = model<Reel, ReelModelType>('Reel', reelSchema);
