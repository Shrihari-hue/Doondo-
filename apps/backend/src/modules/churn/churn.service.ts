/**
 * Crew churn early-warning — spot a regular worker drifting away while you
 * can still win them back.
 *
 * A "regular" is someone this employer has hired several times. If they
 * haven't been hired again in a while, they're a churn risk worth a nudge
 * ("Ravi has worked with you 14 times but hasn't in 3 weeks — reach out?").
 * Computed purely from the hires already in the DB; no new tracking.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, users } from '@/db/schema';

export interface ChurnRisk {
  workerId: string;
  name: string;
  photoUrl: string | null;
  /** Times this employer has hired them. */
  hireCount: number;
  /** ISO of their most recent hire with this employer. */
  lastHiredAt: string | null;
  /** Whole days since that last hire. */
  daysSince: number;
}

/** A worker counts as a "regular" at this many hires. */
const MIN_HIRES = 3;
/** Days of silence before a regular is flagged as drifting. */
const INACTIVE_DAYS = 21;

interface ChurnRow extends Record<string, unknown> {
  seeker_id: string;
  name: string;
  photo_url: string | null;
  hire_count: number;
  last_hired_at: Date;
}

export async function getChurnRisks(employerId: string): Promise<ChurnRisk[]> {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  const rows = await getDb().execute<ChurnRow>(sql`
    SELECT a.seeker_id, u.name, u.photo_url,
      count(*)::int AS hire_count,
      max(coalesce(a.hired_at, a.applied_at)) AS last_hired_at
    FROM ${applications} a
    JOIN ${users} u ON u.id = a.seeker_id
    WHERE a.employer_id = ${employerId} AND a.status = 'hired'
    GROUP BY a.seeker_id, u.name, u.photo_url
    HAVING count(*) >= ${MIN_HIRES} AND max(coalesce(a.hired_at, a.applied_at)) <= ${cutoff}
    ORDER BY last_hired_at ASC
    LIMIT 20
  `);

  const now = Date.now();
  return [...rows].map((r) => ({
    workerId: r.seeker_id,
    name: r.name ?? 'Worker',
    photoUrl: r.photo_url ?? null,
    hireCount: r.hire_count,
    lastHiredAt: r.last_hired_at ? new Date(r.last_hired_at).toISOString() : null,
    daysSince: r.last_hired_at ? Math.floor((now - new Date(r.last_hired_at).getTime()) / 86_400_000) : 0,
  }));
}
