/**
 * Reels service — Hire Reels business logic.
 *
 *   upsertReel       a worker records (or re-records) their intro reel
 *   getMyReel        the worker reads their own reel back
 *   deleteReel       the worker removes their reel
 *   getSeekerReel    anyone reads a given worker's reel (for their profile)
 *   listReelFeed     an employer browses the discovery feed of worker reels
 *
 * The video bytes never live in Mongo: `upsertReel` hands the clip to
 * the swappable storage provider and stores only the URL it returns.
 */

import { Types, type PipelineStage } from 'mongoose';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ReelModel, type PublicReel } from './reel.model';
import { storeReelVideo, validateReel, type ReelRejectReason } from './reelStorage.service';

function reelRejection(reason: ReelRejectReason): AppError {
  return new AppError({
    code: 'VALIDATION_FAILED',
    message:
      reason === 'too_short'
        ? 'That clip is too short — record a few seconds more.'
        : reason === 'too_long'
          ? 'That clip is too long — keep your reel short.'
          : reason === 'too_large'
            ? 'That video is too large — try a shorter, lower-quality clip.'
            : 'That video could not be read. Please try again.',
    status: 400,
  });
}

export interface UpsertReelInput {
  seekerId: string;
  /** Video as a base64 data URL. */
  dataUrl: string;
  mimeType: string;
  durationSeconds: number;
  caption?: string | null;
}

/**
 * Record or replace a worker's intro reel. Validates the clip, stores
 * the video via the storage provider, then upserts the one Reel row for
 * this worker (re-recording overwrites — never stacks).
 */
export async function upsertReel(input: UpsertReelInput): Promise<PublicReel> {
  const check = validateReel({
    durationSeconds: input.durationSeconds,
    base64Length: input.dataUrl.length,
    isDataUrl: /^data:video\//i.test(input.dataUrl),
  });
  if (!check.ok) throw reelRejection(check.reason);

  const stored = await storeReelVideo({
    seekerId: input.seekerId,
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
  });

  const reel = await ReelModel.findOneAndUpdate(
    { seekerId: new Types.ObjectId(input.seekerId) },
    {
      $set: {
        videoUrl: stored.videoUrl,
        thumbnailUrl: stored.thumbnailUrl,
        durationSeconds: Math.round(input.durationSeconds),
        caption: input.caption?.trim() || null,
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    { seekerId: input.seekerId, provider: stored.provider },
    'reel stored',
  );
  return reel.toPublicJSON();
}

/** The worker's own reel, or null when they haven't recorded one. */
export async function getMyReel(seekerId: string): Promise<PublicReel | null> {
  const reel = await ReelModel.findOne({ seekerId: new Types.ObjectId(seekerId) });
  return reel ? reel.toPublicJSON() : null;
}

/** Remove the worker's reel. A no-op when there is nothing to remove. */
export async function deleteReel(seekerId: string): Promise<void> {
  await ReelModel.deleteOne({ seekerId: new Types.ObjectId(seekerId) });
}

/** A given worker's active reel — for their public profile. */
export async function getSeekerReel(seekerId: string): Promise<PublicReel | null> {
  if (!Types.ObjectId.isValid(seekerId)) return null;
  const reel = await ReelModel.findOne({
    seekerId: new Types.ObjectId(seekerId),
    status: 'active',
  });
  return reel ? reel.toPublicJSON() : null;
}

/**
 * The employer discovery feed — recent worker reels, each hydrated with
 * a small worker summary (name, photo, skills) so the feed renders in
 * one round-trip. Recency-ranked; a geo cut can be layered on later.
 */
export async function listReelFeed(query: {
  limit: number;
}): Promise<PublicReel[]> {
  const pipeline: PipelineStage[] = [
    { $match: { status: 'active' } },
    { $sort: { createdAt: -1 } },
    { $limit: query.limit },
    {
      $lookup: {
        from: 'users',
        localField: 'seekerId',
        foreignField: '_id',
        as: 'seeker',
        pipeline: [{ $project: { name: 1, photoUrl: 1, skills: 1, role: 1 } }],
      },
    },
    { $unwind: { path: '$seeker', preserveNullAndEmptyArrays: true } },
  ];

  const rows = await ReelModel.aggregate(pipeline);
  return rows.map((r) => formatRawReel(r));
}

/** Format a raw aggregate row (no Mongoose hydration) into a PublicReel. */
function formatRawReel(r: Record<string, unknown>): PublicReel {
  const seeker = r.seeker as
    | { _id: Types.ObjectId; name?: string; photoUrl?: string | null; skills?: string[] }
    | undefined;
  return {
    id: (r._id as Types.ObjectId).toString(),
    seekerId: (r.seekerId as Types.ObjectId).toString(),
    videoUrl: r.videoUrl as string,
    thumbnailUrl: (r.thumbnailUrl as string | null | undefined) ?? null,
    durationSeconds: (r.durationSeconds as number) ?? 0,
    caption: (r.caption as string | null | undefined) ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
    seeker: seeker
      ? {
          id: seeker._id.toString(),
          name: seeker.name ?? '',
          photoUrl: seeker.photoUrl ?? null,
          skills: Array.isArray(seeker.skills) ? seeker.skills : [],
        }
      : undefined,
  };
}
