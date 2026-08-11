/**
 * Dev helper — give a worker account a craft skill + sample showcase
 * photos, so the Craft Showcase actually has something to render.
 *
 * Why this exists: the 3D showcase only appears for a worker who has a
 * gallery-type craft skill AND photos tagged to it. A fresh account has
 * neither, so the feature looks "missing" and the photo "+" button in the
 * Resume Builder stays hidden (it unlocks only once a craft skill exists).
 * This script seeds both directly on one user so you can see it populated
 * without clicking through the UI.
 *
 * Usage:
 *   pnpm --filter @doondo/backend exec tsx src/scripts/seed-craft-showcase.ts <email>
 *
 * <email> is the worker's Doondo login email. The script adds the `baker`
 * and `mehndi_artist` skills (merged with whatever they already have) and
 * replaces work photos with 5 sample photos — 3 baker, 2 mehndi — so you
 * see both a populated collection and the collection switcher. Safe to
 * re-run; it just re-applies the same data.
 *
 * After running, open the app's Profile tab on that account.
 */

import './env-loader';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { users, workPhotos } from '@/db/schema';
import { logger } from '@/lib/logger';
import type { CraftPhoto } from '@/modules/users/user.model';
import SAMPLE_PHOTOS from './craft-showcase-samples.json';

async function run(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    logger.error('Usage: tsx src/scripts/seed-craft-showcase.ts <email>');
    process.exit(1);
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    logger.error({ email }, 'No user found with that email');
    process.exit(1);
    return;
  }
  if (user.role !== 'seeker') {
    logger.warn(
      { email, role: user.role },
      'This account is not a seeker — the showcase renders on seeker profiles, ' +
        'and on the employer side only when viewing a seeker applicant.',
    );
  }

  // Merge in the two craft skills — dedupe, keep whatever they already have.
  const skills = [...new Set([...(user.skills ?? []), 'baker', 'mehndi_artist'])];
  await db.update(users).set({ skills }).where(eq(users.id, user.id));

  // Replace work photos with the sample set (capped at 6, same as before).
  const photos = (SAMPLE_PHOTOS as CraftPhoto[]).slice(0, 6);
  await db.delete(workPhotos).where(eq(workPhotos.userId, user.id));
  await db.insert(workPhotos).values(
    photos.map((p, i) => ({
      userId: user.id,
      url: p.url,
      skill: p.skill,
      caption: p.caption ?? null,
      isCover: Boolean(p.isCover),
      orderIndex: i,
    })),
  );

  logger.info(
    { email, skills, photos: photos.length },
    'Craft Showcase sample data seeded — open the Profile tab on that account',
  );
}

run().then(() => process.exit(0)).catch((err) => {
  logger.error({ err }, 'seed-craft-showcase failed');
  process.exit(1);
});
