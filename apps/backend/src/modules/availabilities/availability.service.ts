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
import { AvailabilityModel, type PublicAvailability } from './availability.model';
import { UserModel } from '@/modules/users/user.model';

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
}

export async function publish(input: PublishInput): Promise<PublicAvailability> {
  const until = new Date(Date.now() + input.durationMinutes * 60_000);

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
  // Defensive — if the doc somehow outlived its TTL between scan and
  // read (clock drift), treat it as gone.
  if (doc.until.getTime() <= Date.now()) {
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
  const baseMatch: Record<string, unknown> = {
    // The TTL index handles expiry, but a defensive filter on the live
    // index entries avoids returning a beacon that's milliseconds stale.
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

  const rows = await AvailabilityModel.aggregate(pipeline);
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
