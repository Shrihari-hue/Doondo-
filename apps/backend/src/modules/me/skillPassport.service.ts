/**
 * Skill Passport — the worker's portable, verified work credential.
 *
 * The Doondo Score is one number. The Skill Passport is the document
 * behind it: which skills the worker actually has, which of those are
 * *verified* (an employer endorsed them, or the worker passed the
 * trade test), how many jobs they've completed, what employers rated
 * them. It's the artifact a worker shows a new employer — in person or
 * shared as text — to prove they are who they say they are.
 *
 * The long game (per the Doondo Score philosophy): a credential the
 * worker carries between employers becomes something the whole
 * industry starts asking for. The passport is that credential made
 * concrete.
 *
 * Everything is computed on the read path from data that already
 * exists — Doondo Score, endorsements, skill-test attempts, the user
 * record. No new denormalised state.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import { EndorsementModel } from '@/modules/endorsements/endorsement.model';
import { computeForUser } from '@/modules/users/doondoScore.service';
import { listPassedTests } from '@/modules/skillTests/skillTests.service';
import { findSkillTest } from '@/modules/skillTests/skillTests.catalogue';

export interface PassportSkill {
  /** The skill slug as stored on the user. */
  slug: string;
  /** Endorsed by ≥1 employer OR backed by a passed trade test. */
  verified: boolean;
  /** How many employers have endorsed this exact trade. */
  endorsementCount: number;
  /** Whether the worker has passed the trade test for this skill. */
  tested: boolean;
}

export interface PassportTest {
  id: string;
  title: string;
  emoji: string;
}

export interface SkillPassport {
  /** Doondo Score, 0-100 — the headline number. */
  score: number;
  /** Whether the worker has cleared identity verification. */
  isIdentityVerified: boolean;
  /** Account creation date, ISO — "member since". */
  memberSince: string;
  /** The worker's skills, each annotated with its verification status. */
  skills: PassportSkill[];
  endorsements: {
    /** Total endorsements across all trades. */
    total: number;
    /** Distinct trades with ≥1 endorsement. */
    verifiedTrades: number;
  };
  /** Trade tests the worker has passed. */
  skillTests: PassportTest[];
  /** Self-reported years of experience. */
  experienceYears: number | null;
  /** Jobs completed (hired applications). */
  jobsCompleted: number;
  ratings: { avg: number | null; count: number };
}

/**
 * Annotate a worker's skill list with verification status.
 *
 * Pure + exported so it can be unit-tested without a DB. A skill is
 * "verified" when an employer has endorsed that exact trade OR the
 * worker has passed its trade test. Matching is case-insensitive on the
 * normalised slug — endorsement trades and test ids both use the same
 * lowercase trade vocabulary as the skill slugs.
 */
export function annotateSkills(
  skills: string[],
  endorsementTrades: string[],
  passedTestIds: string[],
): PassportSkill[] {
  const endorsementByTrade = new Map<string, number>();
  for (const raw of endorsementTrades) {
    const trade = (raw ?? '').trim().toLowerCase();
    if (!trade) continue;
    endorsementByTrade.set(trade, (endorsementByTrade.get(trade) ?? 0) + 1);
  }
  const testedSet = new Set(
    passedTestIds.map((id) => (id ?? '').trim().toLowerCase()).filter(Boolean),
  );

  return skills.map((slug) => {
    const norm = (slug ?? '').trim().toLowerCase();
    const endorsementCount = endorsementByTrade.get(norm) ?? 0;
    const tested = testedSet.has(norm);
    return {
      slug,
      endorsementCount,
      tested,
      verified: endorsementCount > 0 || tested,
    };
  });
}

/**
 * Assemble the Skill Passport for one seeker.
 *
 * Throws `notFound` when the user doesn't exist. Four independent
 * lookups run in parallel — the Doondo Score (which carries ratings,
 * hires, verification, endorsement-trade count), the user record, the
 * raw endorsements (for the per-skill breakdown), and the passed-test
 * ids.
 */
export async function getSkillPassportForSeeker(
  userId: string,
): Promise<SkillPassport> {
  const seekerOid = new Types.ObjectId(userId);
  const [score, user, endorsements, passedTestIds] = await Promise.all([
    computeForUser(userId),
    UserModel.findById(userId).select('skills experienceYears createdAt'),
    EndorsementModel.find({ seekerId: seekerOid }).select('trade').lean(),
    listPassedTests(userId),
  ]);

  if (!user) throw errors.notFound('User not found.');

  const skills = annotateSkills(
    user.skills ?? [],
    endorsements.map((e) => (e as { trade?: string }).trade ?? ''),
    passedTestIds,
  );

  const skillTests: PassportTest[] = passedTestIds
    .map((id) => {
      const test = findSkillTest(id);
      return test
        ? { id: test.id, title: test.title, emoji: test.emoji }
        : null;
    })
    .filter((t): t is PassportTest => t !== null);

  return {
    score: score.score,
    isIdentityVerified: score.breakdown.verification.isVerified,
    memberSince: user.createdAt.toISOString(),
    skills,
    endorsements: {
      total: endorsements.length,
      verifiedTrades: score.breakdown.endorsements.uniqueTrades,
    },
    skillTests,
    experienceYears: user.experienceYears ?? null,
    jobsCompleted: score.breakdown.hires.count,
    ratings: {
      avg: score.breakdown.ratings.avg,
      count: score.breakdown.ratings.count,
    },
  };
}
