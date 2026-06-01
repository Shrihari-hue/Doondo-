/**
 * "Workers your trusted employers rated" — local social proof.
 *
 * Surfaces workers that *other employers in your city* have rated highly.
 * A recommendation from a peer who already paid and worked with someone
 * carries more weight than a cold search result, and the graph it runs on
 * (employer→worker ratings) is something only Doondo's network has — a
 * genuine moat.
 *
 * The query:
 *   1. find employers in the same city (excluding the caller),
 *   2. take their 4★+ ratings of workers,
 *   3. rank workers by how many distinct local employers rated them well
 *      (then by average score),
 *   4. drop anyone already in the caller's own pipeline (no point
 *      recommending someone they've already met),
 *   5. hydrate the top few worker summaries.
 *
 * No geo index needed — city is a cheap string match — so this is safe to
 * run without new infrastructure.
 */

import { Types } from 'mongoose';
import { UserModel } from '@/modules/users/user.model';
import { RatingModel } from '@/modules/ratings/rating.model';
import { ApplicationModel } from '@/modules/applications/application.model';

export interface TrustedWorker {
  seeker: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
  };
  /** Average score from local employers (1 decimal). */
  avgScore: number;
  /** How many distinct local employers rated this worker 4★+. */
  employerCount: number;
}

const MAX_EMPLOYERS = 500;

export async function findWorkersRatedByLocalEmployers(
  employerId: string,
  limit: number,
): Promise<TrustedWorker[]> {
  const meId = new Types.ObjectId(employerId);
  const me = await UserModel.findById(meId).select('employerLocation location').lean();
  const city =
    (me as { employerLocation?: { city?: string } | null } | null)?.employerLocation?.city ||
    (me as { location?: { city?: string } | null } | null)?.location?.city ||
    null;

  // Trusted employers = other employers in the same city. With no city on
  // file we can't scope locally, so we return nothing rather than leaking
  // a global list that wouldn't be "near you".
  if (!city) return [];

  const employers = await UserModel.find({
    role: 'employer',
    _id: { $ne: meId },
    $or: [{ 'employerLocation.city': city }, { 'location.city': city }],
  })
    .select('_id')
    .limit(MAX_EMPLOYERS)
    .lean();
  if (employers.length === 0) return [];
  const employerIds = employers.map((e) => e._id as Types.ObjectId);

  // Workers already in the caller's pipeline — exclude from recommendations.
  const knownSeekerIds = (await ApplicationModel.distinct('seekerId', {
    employerId: meId,
  })) as unknown as Types.ObjectId[];
  const knownSet = new Set(knownSeekerIds.map((id) => id.toString()));

  const agg = (await RatingModel.aggregate([
    { $match: { role: 'seeker', score: { $gte: 4 }, reviewerId: { $in: employerIds } } },
    {
      $group: {
        _id: '$revieweeId',
        avg: { $avg: '$score' },
        employers: { $addToSet: '$reviewerId' },
      },
    },
    { $project: { avg: 1, employerCount: { $size: '$employers' } } },
    { $sort: { employerCount: -1, avg: -1 } },
    { $limit: Math.min(50, limit * 3) },
  ])) as Array<{ _id: Types.ObjectId; avg: number; employerCount: number }>;

  const ranked = agg.filter((r) => !knownSet.has(r._id.toString())).slice(0, limit);
  if (ranked.length === 0) return [];

  const workers = await UserModel.find({ _id: { $in: ranked.map((r) => r._id) } })
    .select('name photoUrl skills isVerified')
    .lean();
  const workerMap = new Map(workers.map((w) => [(w._id as Types.ObjectId).toString(), w]));

  return ranked
    .map((r) => {
      const w = workerMap.get(r._id.toString());
      if (!w) return null;
      return {
        seeker: {
          id: r._id.toString(),
          name: (w as { name?: string }).name ?? 'Worker',
          photoUrl: (w as { photoUrl?: string | null }).photoUrl ?? null,
          skills: (w as { skills?: string[] }).skills ?? [],
          isVerified: Boolean((w as { isVerified?: boolean }).isVerified),
        },
        avgScore: Math.round(r.avg * 10) / 10,
        employerCount: r.employerCount,
      } as TrustedWorker;
    })
    .filter((x): x is TrustedWorker => x !== null);
}
