/**
 * Availability service — CRUD on a seeker's own beacon, plus the geo
 * lookup employers use to find workers near them.
 *
 * The model has a `unique` index on seekerId, so publish is a true
 * upsert: re-posting while a beacon is live overwrites it cleanly (pick
 * a longer duration, change trades, etc.). The TTL index on `until`
 * means we never have to write cleanup code.
 */

import { Types, type PipelineStage } from 'mongoose';
import { errors } from '@/lib/errors';
import {
  AvailabilityModel,
  type PublicAvailability,
  type RecurringPattern,
} from './availability.model';
import { UserModel } from '@/modules/users/user.model';

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
  jobTypes?: string[];
  note?: string | null;
  recurringPattern?: RecurringPattern | null;
}

export async function publish(input: PublishInput): Promise<PublicAvailability> {
  // Recurring beacons get a 30-day TTL so they don't fall off the index
  // mid-pattern. One-shot beacons end exactly after `durationMinutes`.
  const until = input.recurringPattern
    ? new Date(Date.now() + RECURRING_BEACON_TTL_DAYS * 24 * 60 * 60_000)
    : new Date(Date.now() + input.durationMinutes * 60_000);

  // Upsert by seekerId — model's unique index on seekerId guarantees one
  // active beacon per seeker. findOneAndUpdate is the cleanest way to
  // implement "replace if exists, otherwise create".
  const doc = await AvailabilityModel.findOneAndUpdate(
    { seekerId: new Types.ObjectId(input.seekerId) },
    {
      $set: {
        tradesAvailable: input.tradesAvailable ?? [],
        jobTypes: input.jobTypes ?? [],
        location: {
          city: input.city ?? null,
          area: input.area ?? null,
          geo: {
            type: 'Point',
            coordinates: [input.lng, input.lat],
          },
        },
        until,
        recurringPattern: input.recurringPattern ?? null,
        note: input.note?.trim() || null,
      },
      $setOnInsert: {
        seekerId: new Types.ObjectId(input.seekerId),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!doc) throw errors.internal();
  return doc.toPublicJSON();
}

export async function withdraw(seekerId: string): Promise<void> {
  await AvailabilityModel.deleteOne({
    seekerId: new Types.ObjectId(seekerId),
  });
}

export async function getMine(
  seekerId: string,
): Promise<PublicAvailability | null> {
  const doc = await AvailabilityModel.findOne({
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!doc) return null;
  // Defensive — for one-shot beacons that somehow outlived the TTL
  // between scan and read (clock drift), treat as gone. Recurring
  // beacons keep their `until` 30 days out so this branch doesn't
  // apply to them.
  if (!doc.recurringPattern && doc.until.getTime() <= Date.now()) {
    await AvailabilityModel.deleteOne({ _id: doc._id });
    return null;
  }
  return doc.toPublicJSON();
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
}

export async function findNearby(input: NearbyInput): Promise<NearbyAvailability[]> {
  // A row counts as "live now" if EITHER:
  //   - it's a one-shot beacon whose `until` is in the future, OR
  //   - it has a recurring pattern that includes today and now() falls
  //     inside the time window.
  // The TTL filter remains the cheap upper-bound; the recurring check
  // happens in-process after the geo pipeline returns candidate rows.
  const baseMatch: Record<string, unknown> = {
    until: { $gt: new Date() },
  };
  if (input.trade) baseMatch.tradesAvailable = input.trade;
  if (input.type) baseMatch.jobTypes = input.type;

  const pipeline: PipelineStage[] = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [input.lng, input.lat] },
        distanceField: 'distanceMeters',
        maxDistance: input.radius,
        spherical: true,
        query: baseMatch,
      },
    },
    { $limit: input.limit },
  ];

  let rows = await AvailabilityModel.aggregate(pipeline);
  if (rows.length === 0) return [];

  // Liveness filter:
  //   - one-shot beacon (no recurring): keep if until > now (Mongo
  //     already filtered, but recheck for clock drift)
  //   - recurring beacon: keep only if now falls inside today's window
  // Rows that fail both checks are silently dropped.
  const now = new Date();
  rows = rows.filter((r) => {
    const pattern = r.recurringPattern as RecurringPattern | null | undefined;
    const untilDate = r.until as Date;
    if (pattern) {
      return isRecurringActiveAt(pattern, now);
    }
    return untilDate.getTime() > now.getTime();
  });
  if (rows.length === 0) return [];

  // Bulk-hydrate seekers in a single query.
  const seekerIds = rows.map((r) => r.seekerId as Types.ObjectId);
  const seekers = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl skills isVerified phone')
    .lean();

  // Bulk rating lookup — reuse the existing ratings aggregation so the
  // employer card shows consistent "★ 4.6 · 32" badges everywhere.
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds.map((id) => id.toString()));

  const seekerMap = new Map(
    seekers.map((s) => [
      (s._id as Types.ObjectId).toString(),
      {
        id: (s._id as Types.ObjectId).toString(),
        name: s.name,
        photoUrl: s.photoUrl ?? null,
        skills: s.skills ?? [],
        isVerified: Boolean(s.isVerified),
        phone: s.phone ?? null,
      },
    ]),
  );

  return rows.map((r) => {
    const seekerIdStr = (r.seekerId as Types.ObjectId).toString();
    const seekerInfo = seekerMap.get(seekerIdStr);
    const rating = ratingMap.get(seekerIdStr);
    return {
      id: (r._id as Types.ObjectId).toString(),
      seekerId: seekerIdStr,
      tradesAvailable: r.tradesAvailable ?? [],
      jobTypes: r.jobTypes ?? [],
      location: {
        city: r.location?.city ?? null,
        area: r.location?.area ?? null,
        coordinates: r.location.geo.coordinates,
      },
      until: (r.until as Date).toISOString(),
      recurringPattern: r.recurringPattern ?? null,
      note: r.note ?? null,
      createdAt: (r.createdAt as Date).toISOString(),
      distanceMeters: Math.round(r.distanceMeters as number),
      seeker: seekerInfo
        ? {
            ...seekerInfo,
            rating:
              rating && rating.count > 0
                ? { avg: rating.avg, count: rating.count }
                : null,
          }
        : {
            id: seekerIdStr,
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
