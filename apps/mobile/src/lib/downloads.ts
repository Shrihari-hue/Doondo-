/**
 * downloads — offline job cache backed by SQLite.
 *
 * The seeker can mark any job as "downloaded" — we fetch the full detail
 * once and stash it in a local SQLite row. Later, even without internet,
 * the JobDetail screen can pull from this cache.
 *
 * Why SQLite (not AsyncStorage / FileSystem JSON):
 *   - We may grow to query by city / radius offline; SQLite gives us
 *     room without a schema migration headache later.
 *   - Per-row writes are atomic — no risk of corrupted single big blob.
 *
 * The row stores the entire PublicJob JSON. It's a denormalised cache;
 * mobile is allowed to read stale data and refresh in the background
 * when network comes back. Cache rows have a `cachedAt` so we can show
 * "Saved 2 hours ago" on each card.
 */

import { useEffect, useState } from 'react';
import type { PublicJob } from '@/api/types';

interface DBRow {
  jobId: string;
  json: string;
  cachedAt: number; // ms epoch
}

// Lazy-loaded SQLite module so the lib doesn't crash if the package
// isn't yet installed (gives a clean "Downloads not available" UX).
type DB = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...args: unknown[]) => Promise<unknown>;
  getAllAsync: <T>(sql: string, ...args: unknown[]) => Promise<T[]>;
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
        CREATE TABLE IF NOT EXISTS downloaded_jobs (
          jobId TEXT PRIMARY KEY NOT NULL,
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

export async function saveJobOffline(job: PublicJob): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Offline cache is not available on this device');
  await db.runAsync(
    `INSERT OR REPLACE INTO downloaded_jobs (jobId, json, cachedAt) VALUES (?, ?, ?)`,
    job.id,
    JSON.stringify(job),
    Date.now(),
  );
}

export async function removeJobOffline(jobId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(`DELETE FROM downloaded_jobs WHERE jobId = ?`, jobId);
}

export async function getJobOffline(jobId: string): Promise<{
  job: PublicJob;
  cachedAt: number;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const row = await db.getFirstAsync<DBRow>(
    `SELECT jobId, json, cachedAt FROM downloaded_jobs WHERE jobId = ?`,
    jobId,
  );
  if (!row) return null;
  try {
    return { job: JSON.parse(row.json) as PublicJob, cachedAt: row.cachedAt };
  } catch {
    return null;
  }
}

export async function listDownloaded(): Promise<{ job: PublicJob; cachedAt: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<DBRow>(
    `SELECT jobId, json, cachedAt FROM downloaded_jobs ORDER BY cachedAt DESC`,
  );
  const out: { job: PublicJob; cachedAt: number }[] = [];
  for (const r of rows) {
    try {
      out.push({ job: JSON.parse(r.json) as PublicJob, cachedAt: r.cachedAt });
    } catch {
      /* skip corrupted row */
    }
  }
  return out;
}

export async function isJobDownloaded(jobId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const row = await db.getFirstAsync<{ jobId: string }>(
    `SELECT jobId FROM downloaded_jobs WHERE jobId = ?`,
    jobId,
  );
  return Boolean(row);
}

/**
 * React hook for the downloads list — refreshes via a manual `reload()`.
 */
export function useDownloads() {
  const [items, setItems] = useState<{ job: PublicJob; cachedAt: number }[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const out = await listDownloaded();
      setItems(out);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return { items, loading, reload };
}
