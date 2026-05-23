/**
 * Migration — legacy `workPhotos: string[]` → tagged `CraftPhoto[]`.
 *
 * The Craft Showcase (Phase 2) changes `User.workPhotos` from a flat list
 * of base64 data URLs to a list of `CraftPhoto` objects, each tagged with
 * the catalogue `skill` slug it belongs to. This script converts existing
 * accounts so old photos aren't lost.
 *
 * Tagging rule: every legacy photo on a user is tagged with that user's
 * FIRST gallery-type craft skill. A user with no gallery skill keeps the
 * photos but tags them with an empty slug — they surface in the showcase's
 * "Portfolio" fallback collection, and the worker can re-tag them in the
 * Resume Builder. (This mirrors the spec's §5 migration note.)
 *
 * Idempotent: a photo that is already an object is left untouched, so the
 * script is safe to run more than once.
 *
 * Usage:
 *   pnpm --filter @doondo/backend exec tsx src/scripts/migrate-craft-photos.ts
 */

import './env-loader';
import { connectDb, disconnectDb } from '@/config/db';
import { logger } from '@/lib/logger';
import { UserModel } from '@/modules/users/user.model';
import { isGallerySkill } from '@/modules/skills/skill.catalogue';

async function run(): Promise<void> {
  await connectDb();

  // `.lean()` returns raw BSON, so legacy string[] documents come through
  // un-cast — exactly what we need to detect and convert them.
  const users = await UserModel.find({ 'workPhotos.0': { $exists: true } })
    .select('skills workPhotos')
    .lean();

  let migrated = 0;
  let skipped = 0;

  for (const u of users) {
    const photos = (u as { workPhotos?: unknown[] }).workPhotos ?? [];

    // Already in the new shape — first entry is an object, not a string.
    if (typeof photos[0] !== 'string') {
      skipped += 1;
      continue;
    }

    const galleryTag = (u.skills ?? []).filter(isGallerySkill)[0] ?? '';
    const converted = (photos as string[]).map((url) => ({
      url,
      skill: galleryTag,
      caption: null,
      isCover: false,
    }));

    await UserModel.updateOne({ _id: u._id }, { $set: { workPhotos: converted } });
    migrated += 1;
  }

  logger.info(
    { migrated, skipped, scanned: users.length },
    'workPhotos → CraftPhoto[] migration complete',
  );

  await disconnectDb();
}

run().catch((err) => {
  logger.error({ err }, 'workPhotos migration failed');
  process.exit(1);
});
