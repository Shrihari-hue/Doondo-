/**
 * offlineQueue — job applications queued while the phone is offline.
 *
 * Blue-collar work happens in basements, on sites, in dead zones. If a
 * worker taps Apply with no signal, the application must not be lost.
 * This queue persists it on the device; `flushPendingApplications`
 * sends everything the next time the network is reachable.
 *
 * Storage: the same SQLite database the offline job cache uses
 * (`doondo-cache.db`) — a separate `pending_applications` table. SQLite
 * over AsyncStorage for the same reasons as `downloads.ts`: atomic
 * per-row writes, no corrupt-single-blob risk.
 *
 * What this is NOT: a general "use the whole app offline" layer. A
 * hiring marketplace needs the network for fresh listings, chat and
 * auth. This queue covers exactly one offline-critical action — Apply —
 * so a dropped connection never costs the worker a job.
 */

import type { ApplyPayload } from '@/api/applications.api';

interface PendingRow {
  id: string;
  jobId: string;
  payload: string;
  queuedAt: number;
}

export interface PendingApplication {
  /** Local-only id for the queue row. */
  id: string;
  jobId: string;
  payload: ApplyPayload;
  /** ms epoch when it was queued. */
  queuedAt: number;
}

export interface FlushSummary {
  /** Applications successfully delivered this pass. */
  sent: number;
  /** Applications dropped — a permanent failure (already applied, job
   *  closed). They will never succeed on retry, so they're removed. */
  dropped: number;
  /** Applications still queued (network still down). */
  remaining: number;
}

// Lazy SQLite handle — mirrors downloads.ts so a missing native module
// degrades to a no-op queue rather than crashing.
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
        CREATE TABLE IF NOT EXISTS pending_applications (
          id TEXT PRIMARY KEY NOT NULL,
          jobId TEXT NOT NULL,
          payload TEXT NOT NULL,
          queuedAt INTEGER NOT NULL
        );
      `);
      return db;
    } catch {
      return null;
    }
  })();
  return dbPromise;
}

/** Collision-resistant local id for a queue row. */
function localId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Queue an application for later delivery. De-dupes by job — a second
 * offline tap on the same job replaces the first rather than stacking
 * two identical applications.
 */
export async function enqueueApplication(input: {
  jobId: string;
  payload: ApplyPayload;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(
    `DELETE FROM pending_applications WHERE jobId = ?`,
    input.jobId,
  );
  await db.runAsync(
    `INSERT INTO pending_applications (id, jobId, payload, queuedAt) VALUES (?, ?, ?, ?)`,
    localId(),
    input.jobId,
    JSON.stringify(input.payload),
    Date.now(),
  );
}

/** Every queued application, oldest first. */
export async function listPendingApplications(): Promise<PendingApplication[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.getAllAsync<PendingRow>(
    `SELECT id, jobId, payload, queuedAt FROM pending_applications ORDER BY queuedAt ASC`,
  );
  const out: PendingApplication[] = [];
  for (const r of rows) {
    try {
      out.push({
        id: r.id,
        jobId: r.jobId,
        payload: JSON.parse(r.payload) as ApplyPayload,
        queuedAt: r.queuedAt,
      });
    } catch {
      /* skip a corrupted row */
    }
  }
  return out;
}

/** How many applications are waiting to send. */
export async function countPendingApplications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pending_applications`,
  );
  return row?.n ?? 0;
}

/** Whether a specific job already has a queued application. */
export async function isApplicationQueued(jobId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const row = await db.getFirstAsync<{ jobId: string }>(
    `SELECT jobId FROM pending_applications WHERE jobId = ?`,
    jobId,
  );
  return Boolean(row);
}

async function removePendingApplication(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.runAsync(`DELETE FROM pending_applications WHERE id = ?`, id);
}

/**
 * Whether a failed delivery should stay queued for a later retry.
 *
 * Pure + exported for tests. True for transient failures (no network,
 * 5xx) — keep and try again. False for everything else (already
 * applied, job closed, bad request) — those never succeed on retry, so
 * the caller drops them.
 */
export function keepForRetry(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'isTransient' in err &&
      (err as { isTransient?: unknown }).isTransient === true,
  );
}

/**
 * Try to deliver every queued application.
 *
 * Stops at the first transient failure — if one apply fails on the
 * network, the rest will too, so there's no point hammering. Permanent
 * failures (already applied, job no longer open) are dropped so the
 * queue can't get stuck on a dead item.
 *
 * Safe to call repeatedly; a no-op when the queue is empty.
 */
export async function flushPendingApplications(): Promise<FlushSummary> {
  const db = await getDb();
  if (!db) return { sent: 0, dropped: 0, remaining: 0 };

  const pending = await listPendingApplications();
  if (pending.length === 0) return { sent: 0, dropped: 0, remaining: 0 };

  // Lazy import keeps this module free of an api → queue cycle.
  const { applicationsApi } = await import('@/api/applications.api');

  let sent = 0;
  let dropped = 0;
  for (const item of pending) {
    try {
      await applicationsApi.apply(item.jobId, item.payload);
      await removePendingApplication(item.id);
      sent += 1;
    } catch (err) {
      if (keepForRetry(err)) break; // still offline — stop, retry later
      await removePendingApplication(item.id); // permanent — drop it
      dropped += 1;
    }
  }

  const remaining = await countPendingApplications();
  return { sent, dropped, remaining };
}
