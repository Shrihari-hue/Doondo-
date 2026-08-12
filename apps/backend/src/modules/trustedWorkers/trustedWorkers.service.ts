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

import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, ratings, users } from '@/db/schema';

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
  const db = getDb();
  const [me] = await db
    .select({ employerLocation: users.employerLocation, location: users.location })
    .from(users)
    .where(eq(users.id, employerId))
    .limit(1);
  const city = me?.employerLocation?.city || me?.location?.city || null;

  // Trusted employers = other employers in the same city. With no city on
  // file we can't scope locally, so we return nothing rather than leaking
  // a global list that wouldn't be "near you".
  if (!city) return [];

  const employers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, 'employer'),
        ne(users.id, employerId),
        or(sql`${users.employerLocation}->>'city' = ${city}`, sql`${users.location}->>'city' = ${city}`),
      ),
    )
    .limit(MAX_EMPLOYERS);
  if (employers.length === 0) return [];
  const employerIds = employers.map((e) => e.id);

  // Workers already in the caller's pipeline — exclude from recommendations.
  const knownRows = await db
    .selectDistinct({ seekerId: applications.seekerId })
    .from(applications)
    .where(eq(applications.employerId, employerId));
  const knownSet = new Set(knownRows.map((r) => r.seekerId));

  // Local employers' 4★+ ratings of seekers, grouped by who they rated.
  const agg = await db
    .select({
      revieweeId: ratings.revieweeId,
      avg: sql<number>`avg(${ratings.score})`,
      employerCount: sql<number>`count(distinct ${ratings.reviewerId})::int`,
    })
    .from(ratings)
    .where(
      and(
        eq(ratings.role, 'seeker'),
        gte(ratings.score, 4),
        inArray(ratings.reviewerId, employerIds),
      ),
    )
    .groupBy(ratings.revieweeId)
    .orderBy(desc(sql`count(distinct ${ratings.reviewerId})`), desc(sql`avg(${ratings.score})`))
    .limit(Math.min(50, limit * 3));

  const ranked = agg.filter((r) => !knownSet.has(r.revieweeId)).slice(0, limit);
  if (ranked.length === 0) return [];

  const workers = await db
    .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, skills: users.skills, isVerified: users.isVerified })
    .from(users)
    .where(inArray(users.id, ranked.map((r) => r.revieweeId)));
  const workerMap = new Map(workers.map((w) => [w.id, w]));

  return ranked
    .map((r) => {
      const w = workerMap.get(r.revieweeId);
      if (!w) return null;
      return {
        seeker: {
          id: r.revieweeId,
          name: w.name ?? 'Worker',
          photoUrl: w.photoUrl ?? null,
          skills: w.skills ?? [],
          isVerified: Boolean(w.isVerified),
        },
        avgScore: Math.round(r.avg * 10) / 10,
        employerCount: r.employerCount,
      } as TrustedWorker;
    })
    .filter((x): x is TrustedWorker => x !== null);
}
