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
 * replaces workPhotos with 5 sample photos — 3 baker, 2 mehndi — so you
 * see both a populated collection and the collection switcher. Safe to
 * re-run; it just re-applies the same data.
 *
 * After running, open the app's Profile tab on that account.
 */

import './env-loader';
import { connectDb, disconnectDb } from '@/config/db';
import { logger } from '@/lib/logger';
import { UserModel, type CraftPhoto } from '@/modules/users/user.model';
import SAMPLE_PHOTOS from './craft-showcase-samples.json';

async function run(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    logger.error('Usage: tsx src/scripts/seed-craft-showcase.ts <email>');
    process.exit(1);
  }

  await connectDb();

  const user = await UserModel.findOne({ email });
  if (!user) {
    logger.error({ email }, 'No user found with that email');
    await disconnectDb();
    process.exit(1);
  }
  if (user.role !== 'seeker') {
    logger.warn(
      { email, role: user.role },
      'This account is not a seeker — the showcase renders on seeker profiles, ' +
        'and on the employer side only when viewing a seeker applicant.',
    );
  }

  // Merge in the two craft skills — dedupe, keep whatever they already have.
  user.skills = [...new Set([...(user.skills ?? []), 'baker', 'mehndi_artist'])];

  // Replace workPhotos with the sample set (the model caps the array at 6).
  user.workPhotos = (SAMPLE_PHOTOS as CraftPhoto[]).map((p) => ({
    url: p.url,
    skill: p.skill,
    caption: p.caption ?? null,
    isCover: Boolean(p.isCover),
  }));

  await user.save();

  logger.info(
    { email, skills: user.skills, photos: user.workPhotos.length },
    'Craft Showcase sample data seeded — open the Profile tab on that account',
  );

  await disconnectDb();
}

run().catch((err) => {
  logger.error({ err }, 'seed-craft-showcase failed');
  process.exit(1);
});
