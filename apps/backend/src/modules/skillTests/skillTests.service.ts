/**
 * Skill tests service — list the catalogue, submit attempts, return
 * the seeker's passed-test list (which drives the "Tested" pill).
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import {
  SKILL_TESTS,
  findSkillTest,
  toPublic,
  type PublicSkillTest,
} from './skillTests.catalogue';
import {
  SkillTestAttemptModel,
  type PublicSkillTestAttempt,
} from './skillTestAttempt.model';

/** 24h cooldown between failed attempts on the same test. */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function listTests(): PublicSkillTest[] {
  return SKILL_TESTS.map(toPublic);
}

export function getTest(testId: string): PublicSkillTest {
  const test = findSkillTest(testId);
  if (!test) throw errors.notFound('Skill test not found');
  return toPublic(test);
}

interface SubmitInput {
  seekerId: string;
  testId: string;
  /** Indices into options[] for each question, in order. */
  answers: number[];
}

export async function submitAttempt(
  input: SubmitInput,
): Promise<PublicSkillTestAttempt & { cooldownUntil: string | null }> {
  const test = findSkillTest(input.testId);
  if (!test) throw errors.notFound('Skill test not found');

  if (
    !Array.isArray(input.answers) ||
    input.answers.length !== test.questions.length
  ) {
    throw errors.validation(
      { received: input.answers?.length, expected: test.questions.length },
      'answers must match the number of questions',
    );
  }

  // Has the seeker already passed this test? Once passed, the badge is
  // permanent; we don't let them retake (no incentive, no security
  // benefit, and it removes the possibility of accidentally "downgrading"
  // a verified worker).
  const existingPass = await SkillTestAttemptModel.findOne({
    seekerId: new Types.ObjectId(input.seekerId),
    testId: input.testId,
    passed: true,
  });
  if (existingPass) {
    throw errors.conflict('You\'ve already passed this test.');
  }

  // Cooldown — if there's a recent failed attempt, block.
  const lastAttempt = await SkillTestAttemptModel.findOne({
    seekerId: new Types.ObjectId(input.seekerId),
    testId: input.testId,
  }).sort({ createdAt: -1 });
  if (lastAttempt && !lastAttempt.passed) {
    const elapsed = Date.now() - lastAttempt.createdAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitMs = COOLDOWN_MS - elapsed;
      throw errors.rateLimited(
        `Try again in ${Math.ceil(waitMs / 3600_000)}h. Pace lets you actually study between attempts.`,
      );
    }
  }

  // Grade.
  let score = 0;
  for (let i = 0; i < test.questions.length; i++) {
    if (input.answers[i] === test.questions[i]!.correctIndex) score++;
  }
  const passed = score >= test.passingScore;

  const doc = await SkillTestAttemptModel.create({
    seekerId: new Types.ObjectId(input.seekerId),
    testId: input.testId,
    score,
    passingScore: test.passingScore,
    passed,
    answers: input.answers,
  });

  const cooldownUntil = !passed
    ? new Date(doc.createdAt.getTime() + COOLDOWN_MS).toISOString()
    : null;

  return {
    ...doc.toPublicJSON(),
    cooldownUntil,
  };
}

/** Tests the seeker has passed — drives the "✓ Tested" pills on resume. */
export async function listPassedTests(seekerId: string): Promise<string[]> {
  const rows = await SkillTestAttemptModel.find({
    seekerId: new Types.ObjectId(seekerId),
    passed: true,
  })
    .select('testId')
    .lean();
  return [...new Set(rows.map((r) => r.testId))];
}

/** Latest attempt per testId — drives the cooldown UI. */
export async function listMyAttempts(
  seekerId: string,
): Promise<PublicSkillTestAttempt[]> {
  const rows = await SkillTestAttemptModel.find({
    seekerId: new Types.ObjectId(seekerId),
  })
    .sort({ createdAt: -1 })
    .lean();
  // Keep only the newest per testId.
  const seen = new Set<string>();
  const latest = rows.filter((r) => {
    if (seen.has(r.testId)) return false;
    seen.add(r.testId);
    return true;
  });
  return latest.map((r) => ({
    id: (r._id as unknown as { toString(): string }).toString(),
    testId: r.testId,
    score: r.score,
    passingScore: r.passingScore,
    passed: Boolean(r.passed),
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}
