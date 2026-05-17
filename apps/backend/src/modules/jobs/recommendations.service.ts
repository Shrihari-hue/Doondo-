/**
 * Job recommendations — "for you" feed driven by resume + application
 * history rather than just geography.
 *
 * Scoring (kept simple, explicable, and tunable):
 *   - Skill match:     +5 per overlapping skill (max 25)
 *   - Distance:        +20 if < 2km, +10 if < 5km, +5 if < 10km
 *   - Work mode fit:   +10 if matches the seeker's preferred mode
 *   - Pay match:       +10 if pay is within ±20% of expectedSalary
 *   - Verified emp:    +5
 *   - History boost:   +10 if seeker has applied to a similar job before
 *
 * Returns top N. The frontend renders this as a "Recommended for you"
 * rail on the Home screen — independent of the nearby query so a worker
 * far from any post can still get suggestions.
 */

import { Types, type PipelineStage } from 'mongoose';
import { JobModel } from './job.model';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { formatRawJob } from './job.service';
import type { PublicJob } from './job.model';

export interface ScoredJob extends PublicJob {
  score: number;
  scoreReasons: string[];
}

const HARD_LIMIT = 20;

export async function recommendFor(
  seekerId: string | Types.ObjectId,
  opts?: { limit?: number },
): Promise<ScoredJob[]> {
  const limit = Math.min(opts?.limit ?? 10, HARD_LIMIT);
  const seeker = await UserModel.findById(seekerId).lean();
  if (!seeker) return [];

  const coords = (seeker as { location?: { geo?: { coordinates?: [number, number] } } })
    .location?.geo?.coordinates;
  const skills = new Set(
    ((seeker as { skills?: string[] }).skills ?? []).map((s) => s.toLowerCase()),
  );
  const preferredMode = (seeker as { workType?: string | null }).workType ?? null;
  const expected = (seeker as { expectedSalary?: { amount?: number } }).expectedSalary
    ?.amount as number | undefined;

  // History — past job titles + skills the seeker applied to, used to
  // boost similar listings.
  const pastApps = await ApplicationModel.find({ seekerId: new Types.ObjectId(seekerId) })
    .select('jobId')
    .limit(50)
    .lean();
  const pastJobIds = pastApps
    .map((a) => a.jobId as Types.ObjectId | undefined)
    .filter((x): x is Types.ObjectId => Boolean(x));
  const pastJobs = pastJobIds.length
    ? await JobModel.find({ _id: { $in: pastJobIds } })
        .select('skills type')
        .lean()
    : [];
  const historySkills = new Set<string>();
  for (const j of pastJobs) {
    for (const s of (j.skills as string[] | undefined) ?? []) {
      historySkills.add(s.toLowerCase());
    }
  }

  // Candidate pool: active jobs near the seeker (if we have coords) or
  // recent active jobs globally (fallback).
  let candidates: Record<string, unknown>[];
  if (coords) {
    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: coords },
          distanceField: 'distanceMeters',
          maxDistance: 30_000,
          spherical: true,
          query: { status: 'active' },
        },
      },
      { $limit: 100 },
      {
        $lookup: {
          from: 'users',
          localField: 'employerId',
          foreignField: '_id',
          as: 'employer',
          pipeline: [{ $project: { name: 1, isVerified: 1, photoUrl: 1, companyName: 1 } }],
        },
      },
      { $unwind: { path: '$employer', preserveNullAndEmptyArrays: true } },
    ];
    candidates = await JobModel.aggregate(pipeline);
  } else {
    candidates = await JobModel.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
  }

  const scored: ScoredJob[] = [];
  for (const raw of candidates) {
    let score = 0;
    const reasons: string[] = [];

    const jobSkills = ((raw.skills as string[] | undefined) ?? []).map((s) =>
      s.toLowerCase(),
    );
    const skillOverlap = jobSkills.filter((s) => skills.has(s)).length;
    if (skillOverlap > 0) {
      const add = Math.min(skillOverlap * 5, 25);
      score += add;
      reasons.push(`+${add} skill match`);
    }

    const dist = raw.distanceMeters as number | undefined;
    if (typeof dist === 'number') {
      if (dist < 2_000) {
        score += 20;
        reasons.push('+20 very close');
      } else if (dist < 5_000) {
        score += 10;
        reasons.push('+10 nearby');
      } else if (dist < 10_000) {
        score += 5;
        reasons.push('+5 in your area');
      }
    }

    if (preferredMode && raw.workMode === preferredMode) {
      score += 10;
      reasons.push('+10 work mode fit');
    }

    const pay = raw.pay as { amount?: number; amountMax?: number | null } | undefined;
    if (expected && pay?.amount) {
      const min = pay.amount;
      const max = pay.amountMax ?? pay.amount;
      const inBand = expected >= min * 0.8 && expected <= max * 1.2;
      if (inBand) {
        score += 10;
        reasons.push('+10 pay match');
      }
    }

    if (raw.employer && (raw.employer as { isVerified?: boolean }).isVerified) {
      score += 5;
      reasons.push('+5 verified employer');
    }

    const historyHit = jobSkills.some((s) => historySkills.has(s));
    if (historyHit) {
      score += 10;
      reasons.push('+10 like your past applications');
    }

    if (score <= 0) continue;
    scored.push({ ...formatRawJob(raw), score, scoreReasons: reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
