/**
 * Reels service — Hire Reels business logic.
 *
 *   upsertReel       a worker records (or re-records) their intro reel
 *   getMyReel        the worker reads their own reel back
 *   deleteReel       the worker removes their reel
 *   getSeekerReel    anyone reads a given worker's reel (for their profile)
 *   listReelFeed     an employer browses the discovery feed of worker reels
 *
 * The video bytes never live in the DB: `upsertReel` hands the clip to
 * the swappable storage provider and stores only the URL it returns.
 */

import { and, desc, eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDb } from '@/db/client';
import { reels, users } from '@/db/schema';
import {
  removeReelVideo,
  storeReelVideo,
  validateReel,
  type ReelRejectReason,
} from './reelStorage.service';

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

function toPublicReel(r: typeof reels.$inferSelect): PublicReel {
  return {
    id: r.id,
    seekerId: r.seekerId,
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl ?? null,
    durationSeconds: r.durationSeconds,
    caption: r.caption ?? null,
    createdAt: r.createdAt.toISOString(),
  };
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

  const [reel] = await getDb()
    .insert(reels)
    .values({
      seekerId: input.seekerId,
      videoUrl: stored.videoUrl,
      thumbnailUrl: stored.thumbnailUrl,
      durationSeconds: Math.round(input.durationSeconds),
      caption: input.caption?.trim() || null,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: reels.seekerId,
      set: {
        videoUrl: stored.videoUrl,
        thumbnailUrl: stored.thumbnailUrl,
        durationSeconds: Math.round(input.durationSeconds),
        caption: input.caption?.trim() || null,
        status: 'active',
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info(
    { seekerId: input.seekerId, provider: stored.provider },
    'reel stored',
  );
  return toPublicReel(reel!);
}

/** The worker's own reel, or null when they haven't recorded one. */
export async function getMyReel(seekerId: string): Promise<PublicReel | null> {
  const [reel] = await getDb().select().from(reels).where(eq(reels.seekerId, seekerId)).limit(1);
  return reel ? toPublicReel(reel) : null;
}

/** Remove the worker's reel. A no-op when there is nothing to remove. */
export async function deleteReel(seekerId: string): Promise<void> {
  await getDb().delete(reels).where(eq(reels.seekerId, seekerId));
  // Best-effort — the disk-backed mock provider reaps the file. External
  // CDN providers no-op and own retention themselves.
  await removeReelVideo(seekerId);
}

/** A given worker's active reel — for their public profile. */
export async function getSeekerReel(seekerId: string): Promise<PublicReel | null> {
  const [reel] = await getDb()
    .select()
    .from(reels)
    .where(and(eq(reels.seekerId, seekerId), eq(reels.status, 'active')))
    .limit(1);
  return reel ? toPublicReel(reel) : null;
}

/**
 * The employer discovery feed — recent worker reels, each hydrated with
 * a small worker summary (name, photo, skills) so the feed renders in
 * one round-trip. Recency-ranked; a geo cut can be layered on later.
 */
export async function listReelFeed(query: {
  limit: number;
}): Promise<PublicReel[]> {
  const rows = await getDb()
    .select({ reel: reels, seeker: users })
    .from(reels)
    .leftJoin(users, eq(users.id, reels.seekerId))
    .where(eq(reels.status, 'active'))
    .orderBy(desc(reels.createdAt))
    .limit(query.limit);

  return rows.map(({ reel, seeker }) => ({
    ...toPublicReel(reel),
    seeker: seeker
      ? {
          id: seeker.id,
          name: seeker.name ?? '',
          photoUrl: seeker.photoUrl ?? null,
          skills: Array.isArray(seeker.skills) ? seeker.skills : [],
        }
      : undefined,
  }));
}
