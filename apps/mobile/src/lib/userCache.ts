/**
 * userCache — the signed-in worker's profile, cached for offline restore.
 *
 * On a normal launch the app refreshes the session against the server
 * (`bootstrap`). When the phone is offline that call fails — and without
 * a cached profile the app has nothing to render but a dead login
 * screen. This cache is the fix: every successful online session writes
 * the full `PublicUser` here, so an offline launch can restore the
 * worker straight into the app.
 *
 * Storage: the shared SQLite cache DB (`doondo-cache.db`) — the same
 * file the offline job cache and the apply queue use. SQLite (not
 * SecureStore) because a `PublicUser` can carry a base64 profile photo,
 * which blows past the keychain's small per-item size limit.
 *
 * Keyed by userId so the multi-account switcher's accounts each keep
 * their own cached profile.
 */

import type { PublicUser } from '@/api/types';

type DB = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...args: unknown[]) => Promise<unknown>;
  getFirstAsync: <T>(sql: string, ...args: unknown[]) => Promise<T | null>;
};

let dbPromise: Promise<DB | null> | null = null;

async function getDb(): Promise<DB | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const SQLite = require('expo-sqlite') as {
        openDatabaseAsync: (name: string) => Promise<DB>;
      };
      const db = await SQLite.openDatabaseAsync('doondo-cache.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS cached_users (
          userId TEXT PRIMARY KEY NOT NULL,
          json TEXT NOT NULL,
          cachedAt INTEGER NOT NULL
        );
      `);
      return db;
    } catch {
      return null;
    }
  })();
  return dbPromise;
}

/** Persist a user profile for offline restore. Best-effort; never throws. */
export async function cacheUser(user: PublicUser): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_users (userId, json, cachedAt) VALUES (?, ?, ?)`,
      user.id,
      JSON.stringify(user),
      Date.now(),
    );
  } catch {
    /* a failed cache write just means no offline restore — not fatal */
  }
}

/** Read the cached profile for an account, or null if none is stored. */
export async function getCachedUser(userId: string): Promise<PublicUser | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const row = await db.getFirstAsync<{ json: string }>(
      `SELECT json FROM cached_users WHERE userId = ?`,
      userId,
    );
    if (!row) return null;
    return JSON.parse(row.json) as PublicUser;
  } catch {
    return null;
  }
}

/** Drop a cached profile — called on logout so a signed-out account
 *  can't be offline-restored. Best-effort. */
export async function clearCachedUser(userId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM cached_users WHERE userId = ?`, userId);
  } catch {
    /* best-effort */
  }
}
