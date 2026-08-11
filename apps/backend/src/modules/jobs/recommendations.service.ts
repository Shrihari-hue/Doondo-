/**
 * PostgreSQL-backed job recommendations.
 *
 * Application-history scoring is deliberately deferred: Applications still
 * stores Mongo ObjectId job references, which cannot refer to UUID Jobs.
 * The endpoint remains useful from the seeker's PostgreSQL profile, nearby
 * jobs, pay, work mode, and employer-verification signals instead of
 * attempting a Mongo lookup that would throw for every UUID seeker id.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { jobs } from '@/db/schema/jobs';
import { users } from '@/db/schema/users';
import { toPublicJob } from './job.serializers';
import type { PublicJob } from './job.model';

export interface ScoredJob extends PublicJob {
  score: number;
  scoreReasons: string[];
}

const HARD_LIMIT = 20;
const CANDIDATE_LIMIT = 100;

interface NearbyCandidate extends Record<string, unknown> {
  id: string;
  distance_meters: number | string;
}

export async function recommendFor(
  seekerId: string,
  opts?: { limit?: number },
): Promise<ScoredJob[]> {
  const limit = Math.min(opts?.limit ?? 10, HARD_LIMIT);
  const db = getDb();
  const seeker = await db.query.users.findFirst({
    where: eq(users.id, seekerId),
    columns: {
      skills: true,
      workType: true,
      expectedSalary: true,
      location: true,
    },
  });
  if (!seeker) return [];

  const coords = seeker.location?.coordinates ?? null;
  const skills = new Set((seeker.skills ?? []).map((s) => s.toLowerCase()));
  const preferredMode = seeker.workType ?? null;
  const expected = seeker.expectedSalary?.amount;

  // The spatial query preserves the legacy 30km/100-candidate behavior when
  // a location is available. Without one, use the latest active postings.
  const nearby = coords
    ? await db.execute<NearbyCandidate>(sql`
        SELECT id,
          ST_Distance(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${coords[0]}, ${coords[1]}), 4326)::geography
          ) AS distance_meters
        FROM jobs
        WHERE status = 'active'
          AND (crew_head_start_until IS NULL OR crew_head_start_until <= now())
          AND ST_DWithin(
            geo::geography,
            ST_SetSRID(ST_MakePoint(${coords[0]}, ${coords[1]}), 4326)::geography,
            30000
          )
        ORDER BY distance_meters ASC
        LIMIT ${CANDIDATE_LIMIT}
      `)
    : [];

  const candidateIds = nearby.map((row) => row.id);
  const candidateRows = coords
    ? candidateIds.length
      ? await db.query.jobs.findMany({
          where: inArray(jobs.id, candidateIds),
        })
      : []
    : await db.query.jobs.findMany({
        where: and(
          eq(jobs.status, 'active'),
          sql`(${jobs.crewHeadStartUntil} IS NULL OR ${jobs.crewHeadStartUntil} <= now())`,
        ),
        orderBy: (job, { desc }) => [desc(job.createdAt)],
        limit: 60,
      });

  const distances = new Map(
    nearby.map((row) => [row.id, Number(row.distance_meters)]),
  );
  const employerIds = [...new Set(candidateRows.map((job) => job.employerId))];
  const employers = employerIds.length
    ? await db.query.users.findMany({
        where: inArray(users.id, employerIds),
        columns: {
          id: true,
          name: true,
          isVerified: true,
          photoUrl: true,
          companyName: true,
        },
      })
    : [];
  const employersById = new Map(employers.map((employer) => [employer.id, employer]));

  const scored: ScoredJob[] = [];
  for (const job of candidateRows) {
    let score = 0;
    const scoreReasons: string[] = [];
    const jobSkills = (job.skills ?? []).map((skill) => skill.toLowerCase());
    const skillOverlap = jobSkills.filter((skill) => skills.has(skill)).length;
    if (skillOverlap > 0) {
      const add = Math.min(skillOverlap * 5, 25);
      score += add;
      scoreReasons.push(`+${add} skill match`);
    }

    const distanceMeters = distances.get(job.id);
    if (distanceMeters !== undefined) {
      if (distanceMeters < 2_000) {
        score += 20;
        scoreReasons.push('+20 very close');
      } else if (distanceMeters < 5_000) {
        score += 10;
        scoreReasons.push('+10 nearby');
      } else if (distanceMeters < 10_000) {
        score += 5;
        scoreReasons.push('+5 in your area');
      }
    }

    // Keep the legacy comparison semantics unchanged. A future profile
    // migration can introduce a dedicated preferred work-mode field.
    if (preferredMode && job.workMode === String(preferredMode)) {
      score += 10;
      scoreReasons.push('+10 work mode fit');
    }

    if (expected && job.payAmount) {
      const max = job.payAmountMax ?? job.payAmount;
      if (expected >= job.payAmount * 0.8 && expected <= max * 1.2) {
        score += 10;
        scoreReasons.push('+10 pay match');
      }
    }

    const employer = employersById.get(job.employerId);
    if (employer?.isVerified) {
      score += 5;
      scoreReasons.push('+5 verified employer');
    }

    if (score <= 0) continue;
    scored.push({
      ...toPublicJob(job, {
        distanceMeters,
        employer: employer
          ? {
              id: employer.id,
              name: employer.name,
              isVerified: employer.isVerified,
              photoUrl: employer.photoUrl ?? null,
              companyName: employer.companyName ?? null,
            }
          : undefined,
      }),
      score,
      scoreReasons,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
