/**
 * One-shot migration: align the `users` collection indexes with the
 * current Mongoose schema after the dual-account change.
 *
 * Why this exists
 * ---------------
 * The dual-account feature (one human, both a seeker and an employer
 * account on the same email + phone) replaced the old field-level
 * `unique: true` on `email` with a COMPOUND unique index on
 * { email: 1, role: 1 }. Mongoose's `autoIndex` builds the new index
 * fine, but it never DROPS the old one. So on any environment that ran
 * the previous code, the legacy `email_1` (or `email_-1`) unique index
 * sits there silently and keeps rejecting same-email-different-role
 * inserts with MongoServerError E11000.
 *
 * Symptom you'll see without this migration:
 *   - "create employer" returns "A record with that value already exists."
 *   - Subsequent login as the new employer says "Email or password is
 *     incorrect" — because the create never landed, no user record
 *     exists to authenticate.
 *
 * This script is idempotent: if the legacy index isn't there, it's a
 * no-op. If the new compound index already exists, it's a no-op. Safe
 * to run as many times as you like.
 *
 * Usage
 * -----
 *   pnpm --filter @doondo/backend migrate:user-indexes
 *
 * The script reads `MONGO_URI` from the backend's .env exactly like the
 * seed script does, so no extra config is needed.
 */

import './env-loader';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '@/config/db';
import { logger } from '@/lib/logger';
import { UserModel } from '@/modules/users/user.model';

/** Index names we know are obsolete and should be dropped if present. */
const STALE_INDEX_NAMES = [
  'email_1',
  'email_-1',
] as const;

/** The compound unique index the new code relies on. */
const COMPOUND_INDEX_KEY = { email: 1, role: 1 } as const;

async function main(): Promise<void> {
  logger.info('Connecting to Mongo…');
  await connectDb();
  const coll = mongoose.connection.collection('users');

  logger.info('Reading current indexes…');
  const indexes = await coll.indexes();
  logger.info({ count: indexes.length }, 'current indexes');
  for (const idx of indexes) {
    logger.info(
      { name: idx.name, key: idx.key, unique: Boolean(idx.unique) },
      '  — index',
    );
  }

  // 1. Drop legacy unique indexes on `email`.
  for (const name of STALE_INDEX_NAMES) {
    const found = indexes.find((i) => i.name === name);
    if (!found) continue;
    logger.warn(
      { name, key: found.key, unique: Boolean(found.unique) },
      'dropping stale email index',
    );
    try {
      await coll.dropIndex(name);
      logger.info({ name }, '  → dropped');
    } catch (err) {
      logger.error({ err, name }, 'failed to drop index (continuing)');
    }
  }

  // 2. Drop any OTHER user-collection index whose key is exactly
  // { email: 1 } AND whose unique flag is true — covers the case where
  // someone named the legacy index something custom.
  const legacyEmailIdx = (await coll.indexes()).find((i) => {
    const keys = Object.entries(i.key);
    return (
      keys.length === 1 &&
      keys[0]?.[0] === 'email' &&
      Boolean(i.unique) === true &&
      !STALE_INDEX_NAMES.includes(i.name as (typeof STALE_INDEX_NAMES)[number])
    );
  });
  if (legacyEmailIdx) {
    logger.warn(
      { name: legacyEmailIdx.name, key: legacyEmailIdx.key },
      'dropping custom-named unique email index',
    );
    await coll.dropIndex(legacyEmailIdx.name as string);
  }

  // 3. Make sure the new compound index exists. UserModel.syncIndexes()
  // is the Mongoose-blessed way: it builds anything in the schema that
  // isn't on the collection yet AND drops anything on the collection
  // that's no longer in the schema. We've already manually purged the
  // known stale names above, but this is the belt-and-braces step.
  logger.info('Syncing indexes from the User schema…');
  const synced = await UserModel.syncIndexes();
  logger.info({ synced }, 'syncIndexes result');

  // 4. Sanity-check: the compound (email, role) unique index must exist
  // after sync. Loud failure if not — better to scream now than to ship
  // a half-migrated cluster.
  const finalIndexes = await coll.indexes();
  const compound = finalIndexes.find(
    (i) =>
      i.key.email === COMPOUND_INDEX_KEY.email &&
      i.key.role === COMPOUND_INDEX_KEY.role &&
      Boolean(i.unique) === true,
  );
  if (!compound) {
    throw new Error(
      'POST-MIGRATION CHECK FAILED: compound { email: 1, role: 1 } unique index is missing after syncIndexes. Aborting.',
    );
  }
  logger.info({ name: compound.name }, '✓ compound (email, role) index present');

  // 5. Print the final index list so the operator has a clean audit
  // line in their terminal.
  logger.info('Final index state:');
  for (const idx of finalIndexes) {
    logger.info(
      { name: idx.name, key: idx.key, unique: Boolean(idx.unique) },
      '  — index',
    );
  }
}

main()
  .then(async () => {
    logger.info('✓ migration complete');
    await disconnectDb();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, '✗ migration failed');
    try {
      await disconnectDb();
    } catch {
      /* ignore — we're exiting anyway */
    }
    process.exit(1);
  });
