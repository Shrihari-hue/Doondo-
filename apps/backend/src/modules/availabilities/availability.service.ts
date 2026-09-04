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

import { and, eq, inArray, sql } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDb } from '@/db/client';
import { availabilities, users, type JobType, type PayPeriod, type RecurringPatternJson } from '@/db/schema';
import { sendOpenShiftPush } from '@/lib/push';

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
  /**
   * Open shift (#40) — set when the seeker named a wage, turning a plain
   * "I'm free" beacon into a full posted open shift. Null on a beacon.
   */
  wage: { amount: number; period: PayPeriod } | null;
  /** seeker-plan.md §7.1 — paused without withdrawing the beacon. */
  paused: boolean;
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
    wage: row.wageAmount != null && row.wagePeriod ? { amount: row.wageAmount, period: row.wagePeriod } : null,
    paused: row.paused,
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
  wageAmount?: number | null;
  wagePeriod?: PayPeriod | null;
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
    wageAmount: input.wageAmount ?? null,
    wagePeriod: input.wagePeriod ?? null,
  };

  // Unique index on seekerId makes this a true upsert: re-posting while a
  // beacon is live overwrites it cleanly.
  const [doc] = await getDb()
    .insert(availabilities)
    .values({ seekerId: input.seekerId, ...values })
    .onConflictDoUpdate({ target: availabilities.seekerId, set: values })
    .returning();

  if (!doc) throw errors.internal();
  const published = toPublicJSON(doc);

  // A named wage turns this into a full posted open shift — fan out to
  // nearby employers, same pattern as job.service's notifySeekersOfNewJob
  // but reversed (employers, not seekers). Fire-and-forget: never block
  // the publish response on push delivery.
  if (published.wage) {
    void notifyEmployersOfOpenShift(published).catch((err) =>
      logger.warn({ err, seekerId: input.seekerId }, 'open-shift employer fan-out failed'),
    );
  }

  return published;
}

// ─── Open shift (#40) — nearby-employer push fan-out ────────────────────────

/** Same distance math job.service.ts's fan-out already uses (jsonb location, no PostGIS on users yet). */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Notify employers within this radius of a freshly-posted open shift. */
const OPEN_SHIFT_NOTIFY_RADIUS_M = 25_000;
/** Hard cap so a single publish can't blast every employer on the platform. */
const OPEN_SHIFT_NOTIFY_MAX_RECIPIENTS = 500;
/** Safety cap on the candidate pool pulled before the in-app distance filter. */
const OPEN_SHIFT_NOTIFY_CANDIDATE_POOL = 5000;

async function notifyEmployersOfOpenShift(shift: PublicAvailability): Promise<void> {
  const [lng, lat] = shift.location.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') return;

  const db = getDb();
  const candidates = await db.query.users.findMany({
    where: and(eq(users.role, 'employer'), eq(users.isActive, true), sql`array_length(${users.expoPushTokens}, 1) > 0`),
    columns: { id: true, employerLocation: true },
    limit: OPEN_SHIFT_NOTIFY_CANDIDATE_POOL,
  });

  const recipients = candidates
    .filter((e) => {
      const coords = e.employerLocation?.coordinates;
      if (!coords) return false;
      return haversineMeters(lat, lng, coords[1], coords[0]) <= OPEN_SHIFT_NOTIFY_RADIUS_M;
    })
    .slice(0, OPEN_SHIFT_NOTIFY_MAX_RECIPIENTS)
    .map((e) => e.id);

  if (recipients.length === 0 || !shift.wage) return;

  const [seeker] = await db.select({ name: users.name, skills: users.skills }).from(users).where(eq(users.id, shift.seekerId)).limit(1);

  await sendOpenShiftPush({
    recipientIds: recipients,
    seekerId: shift.seekerId,
    seekerFirstName: (seeker?.name ?? 'A worker').split(' ')[0] ?? 'A worker',
    trade: shift.tradesAvailable[0] ?? seeker?.skills?.[0] ?? null,
    wageAmount: shift.wage.amount,
    wagePeriod: shift.wage.period,
    city: shift.location.city,
  });
}

export async function withdraw(seekerId: string): Promise<void> {
  await getDb().delete(availabilities).where(sql`${availabilities.seekerId} = ${seekerId}`);
}

/**
 * PATCH /me/availability/pause — a dedicated toggle, not folded into
 * `publish()`'s upsert. seeker-plan.md §7.1's `paused` is meant to be a
 * quick "stop sending me Quick Work offers for a bit" flip independent of
 * the beacon's duration/trades/note — putting it in the full-replace
 * publish payload would silently un-pause a worker every time they
 * re-published for an unrelated reason (e.g. extending duration).
 *
 * seeker-plan.md §7.3's guard: a worker cannot resume (paused=false)
 * while genuinely BUSY (an active Quick Work request in
 * accepted..in_progress) — checked here via a late import to avoid a
 * hard module-load cycle between availabilities and quickWork.
 */
export async function setPaused(seekerId: string, paused: boolean): Promise<PublicAvailability> {
  const [existing] = await getDb().select().from(availabilities).where(eq(availabilities.seekerId, seekerId)).limit(1);
  if (!existing) throw errors.notFound('No active availability beacon to pause.');

  if (!paused) {
    const { isWorkerBusy } = await import('@/modules/quickWork/quickWork.service');
    if (await isWorkerBusy(seekerId)) {
      throw errors.conflict('You have an active Quick Work job in progress — finish it before resuming.');
    }
  }

  const [updated] = await getDb()
    .update(availabilities)
    .set({ paused })
    .where(eq(availabilities.seekerId, seekerId))
    .returning();
  if (!updated) throw errors.internal();
  return toPublicJSON(updated);
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
  /** Exact catalog service id — Quick Work candidate selection (employer-plan.md §11.1.1). */
  serviceId?: string;
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
  wage_amount: number | null;
  wage_period: PayPeriod | null;
  paused: boolean;
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
      ST_X(geo) AS lng, ST_Y(geo) AS lat, until, recurring_pattern, note,
      wage_amount, wage_period, paused, created_at,
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
      ${
        // `paused` only gates Quick Work's own automatic matching (a
        // worker can pause new Quick Work offers while staying manually
        // discoverable in the general "Available Workers" browse) —
        // only exclude paused rows / require service eligibility when
        // this call is specifically a service-id-scoped Quick Work
        // candidate query. Eligibility itself lives on the persistent
        // `worker_service_profiles` table, not this ephemeral beacon row.
        input.serviceId
          ? sql`AND paused = false AND seeker_id IN (
              SELECT worker_id FROM worker_service_profiles WHERE service_id = ${input.serviceId}::uuid
            )`
          : sql``
      }
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
    // Pre-existing bug fixed here: a raw `sql\`ANY(${arr})\`` parameter is
    // ambiguous to postgres.js when the array has exactly one element
    // ("malformed array literal") — drizzle's `inArray()` binds it
    // correctly regardless of length. Found live while smoke-testing
    // Quick Work matching (the first real exercise of this path with a
    // single-candidate result set).
    .where(inArray(users.id, seekerIds));

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
      // Pre-existing bug fixed here, found alongside the inArray() one
      // above: `db.execute()` (raw SQL, used for this geo query) doesn't
      // run postgres.js's driver-level date parsing the way drizzle's
      // `.select()` does, so timestamptz columns can come back as strings
      // here — `new Date(...)` normalizes either shape before formatting.
      until: new Date(r.until).toISOString(),
      recurringPattern: r.recurring_pattern ?? null,
      note: r.note ?? null,
      wage: r.wage_amount != null && r.wage_period ? { amount: r.wage_amount, period: r.wage_period } : null,
      paused: r.paused,
      createdAt: new Date(r.created_at).toISOString(),
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
