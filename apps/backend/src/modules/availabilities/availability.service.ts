/**
 * Availability service — CRUD on a seeker's own beacon, plus the geo
 * lookup employers use to find workers near them.
 *
 * The table has a unique index on seekerId, so publish is a true upsert:
 * re-posting while a beacon is live overwrites it cleanly (pick a longer
 * duration, change trades, etc.). Mongo's TTL index (auto-delete once
 * `until` passes) has no Postgres equivalent — reads filter on
 * `until > now()` instead; expired rows just sit there until overwritten
 * by the next publish (harmless, never returned).
 */

import { sql } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { availabilities, users, type JobType, type RecurringPatternJson } from '@/db/schema';

export type RecurringPattern = RecurringPatternJson;

export interface PublicAvailability {
  id: string;
  seekerId: string;
  tradesAvailable: string[];
  jobTypes: string[];
  location: {
    city: string | null;
    area: string | null;
    coordinates: [number, number];
  };
  until: string;
  recurringPattern: RecurringPattern | null;
  note: string | null;
  createdAt: string;
}

type AvailabilityRow = typeof availabilities.$inferSelect;

function toPublicJSON(row: AvailabilityRow): PublicAvailability {
  return {
    id: row.id,
    seekerId: row.seekerId,
    tradesAvailable: row.tradesAvailable,
    jobTypes: row.jobTypes,
    location: {
      city: row.city ?? null,
      area: row.area ?? null,
      coordinates: [row.geo.x, row.geo.y],
    },
    until: row.until.toISOString(),
    recurringPattern: row.recurringPattern ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recurring beacons get a 30-day rolling TTL instead of just the
 * one-shot duration. The seeker re-confirms every 30 days that they
 * still mean it — keeps stale patterns from haunting the index forever.
 */
const RECURRING_BEACON_TTL_DAYS = 30;

/**
 * Is the given recurring pattern currently active (now() falls inside
 * a day+window) in the server's local time? Pure function so it's easy
 * to reason about and exercise from tests.
 */
export function isRecurringActiveAt(
  pattern: RecurringPattern | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!pattern) return false;
  const day = at.getDay();
  if (!pattern.days.includes(day)) return false;
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  const nowStr = `${hh}:${mm}`;
  return nowStr >= pattern.startTime && nowStr < pattern.endTime;
}

interface PublishInput {
  seekerId: string;
  durationMinutes: number;
  lat: number;
  lng: number;
  city?: string | null;
  area?: string | null;
  tradesAvailable?: string[];
  jobTypes?: JobType[];
  note?: string | null;
  recurringPattern?: RecurringPattern | null;
}

export async function publish(input: PublishInput): Promise<PublicAvailability> {
  // Recurring beacons get a 30-day TTL so they don't fall off the index
  // mid-pattern. One-shot beacons end exactly after `durationMinutes`.
  const until = input.recurringPattern
    ? new Date(Date.now() + RECURRING_BEACON_TTL_DAYS * 24 * 60 * 60_000)
    : new Date(Date.now() + input.durationMinutes * 60_000);

  const values = {
    tradesAvailable: input.tradesAvailable ?? [],
    jobTypes: input.jobTypes ?? [],
    city: input.city ?? null,
    area: input.area ?? null,
    geo: { x: input.lng, y: input.lat },
    until,
    recurringPattern: input.recurringPattern ?? null,
    note: input.note?.trim() || null,
  };

  // Unique index on seekerId makes this a true upsert: re-posting while a
  // beacon is live overwrites it cleanly.
  const [doc] = await getDb()
    .insert(availabilities)
    .values({ seekerId: input.seekerId, ...values })
    .onConflictDoUpdate({ target: availabilities.seekerId, set: values })
    .returning();

  if (!doc) throw errors.internal();
  return toPublicJSON(doc);
}

export async function withdraw(seekerId: string): Promise<void> {
  await getDb().delete(availabilities).where(sql`${availabilities.seekerId} = ${seekerId}`);
}

export async function getMine(seekerId: string): Promise<PublicAvailability | null> {
  const [doc] = await getDb()
    .select()
    .from(availabilities)
    .where(sql`${availabilities.seekerId} = ${seekerId}`)
    .limit(1);
  if (!doc) return null;
  // Defensive — for one-shot beacons whose `until` has already passed
  // (no cleanup cron, see module doc), treat as gone. Recurring beacons
  // keep their `until` 30 days out so this branch doesn't apply to them.
  if (!doc.recurringPattern && doc.until.getTime() <= Date.now()) {
    await getDb().delete(availabilities).where(sql`${availabilities.id} = ${doc.id}`);
    return null;
  }
  return toPublicJSON(doc);
}

// ─── Employer-side: nearby active workers ───────────────────────────────────

export interface NearbyAvailability extends PublicAvailability {
  distanceMeters: number;
  /** Hydrated seeker summary so the employer card has everything in hand. */
  seeker: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    /** Phone is included here — the whole point of the feature is one-tap call. */
    phone: string | null;
    rating: { avg: number; count: number } | null;
  };
}

interface NearbyInput {
  lat: number;
  lng: number;
  radius: number;
  trade?: string;
  type?: string;
  limit: number;
  /**
   * Optional allow-list of seeker ids. When present, only beacons from
   * these seekers are considered — used by "Re-tap past applicants" to
   * intersect live beacons with the employer's prior applicant pool.
   */
  seekerIds?: string[];
}

interface NearbyRow extends Record<string, unknown> {
  id: string;
  seeker_id: string;
  trades_available: string[];
  job_types: string[];
  city: string | null;
  area: string | null;
  lng: number;
  lat: number;
  until: Date;
  recurring_pattern: RecurringPattern | null;
  note: string | null;
  created_at: Date;
  distance_meters: number;
}

export async function findNearby(input: NearbyInput): Promise<NearbyAvailability[]> {
  // An empty allow-list means "no candidates" — short-circuit rather than
  // running a geo query that can only return nothing.
  if (input.seekerIds && input.seekerIds.length === 0) return [];

  const db = getDb();
  const rowsRaw = await db.execute<NearbyRow>(sql`
    SELECT id, seeker_id, trades_available, job_types, city, area,
      ST_X(geo) AS lng, ST_Y(geo) AS lat, until, recurring_pattern, note, created_at,
      ST_Distance(
        geo::geography,
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography
      ) AS distance_meters
    FROM availabilities
    WHERE until > now()
      AND ST_DWithin(
        geo::geography,
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
        ${input.radius}
      )
      ${input.trade ? sql`AND ${input.trade} = ANY(trades_available)` : sql``}
      ${input.type ? sql`AND ${input.type} = ANY(job_types)` : sql``}
      ${input.seekerIds ? sql`AND seeker_id = ANY(${input.seekerIds})` : sql``}
    ORDER BY distance_meters ASC
    LIMIT ${input.limit}
  `);
  const rows = [...rowsRaw];
  if (rows.length === 0) return [];

  // Liveness filter — recurring beacons stay valid past `until` (a
  // rolling 30-day TTL), but only during today's window; keep only if
  // that window is currently active.
  const now = new Date();
  const live = rows.filter((r) => {
    if (r.recurring_pattern) return isRecurringActiveAt(r.recurring_pattern, now);
    return true; // already filtered by `until > now()` in the query
  });
  if (live.length === 0) return [];

  // Bulk-hydrate seekers in a single query.
  const seekerIds = live.map((r) => r.seeker_id);
  const seekers = await db
    .select({
      id: users.id,
      name: users.name,
      photoUrl: users.photoUrl,
      skills: users.skills,
      isVerified: users.isVerified,
      phone: users.phone,
    })
    .from(users)
    .where(sql`${users.id} = ANY(${seekerIds})`);

  // Bulk rating lookup — reuse the existing ratings aggregation so the
  // employer card shows consistent "★ 4.6 · 32" badges everywhere.
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds);

  const seekerMap = new Map(seekers.map((s) => [s.id, s]));

  return live.map((r) => {
    const seekerInfo = seekerMap.get(r.seeker_id);
    const rating = ratingMap.get(r.seeker_id);
    return {
      id: r.id,
      seekerId: r.seeker_id,
      tradesAvailable: r.trades_available ?? [],
      jobTypes: r.job_types ?? [],
      location: {
        city: r.city ?? null,
        area: r.area ?? null,
        coordinates: [r.lng, r.lat],
      },
      until: r.until.toISOString(),
      recurringPattern: r.recurring_pattern ?? null,
      note: r.note ?? null,
      createdAt: r.created_at.toISOString(),
      distanceMeters: Math.round(r.distance_meters),
      seeker: seekerInfo
        ? {
            id: seekerInfo.id,
            name: seekerInfo.name,
            photoUrl: seekerInfo.photoUrl ?? null,
            skills: seekerInfo.skills ?? [],
            isVerified: Boolean(seekerInfo.isVerified),
            phone: seekerInfo.phone ?? null,
            rating: rating && rating.count > 0 ? { avg: rating.avg, count: rating.count } : null,
          }
        : {
            id: r.seeker_id,
            name: 'Doondo worker',
            photoUrl: null,
            skills: [],
            isVerified: false,
            phone: null,
            rating: null,
          },
    };
  });
}
