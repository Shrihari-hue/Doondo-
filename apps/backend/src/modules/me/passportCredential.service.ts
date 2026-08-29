/**
 * Skill Passport — the shareable, signed credential.
 *
 * The Skill Passport is computed live (see skillPassport.service). This
 * module turns it into a *portable credential*, reusing the exact
 * scoreCredential pattern: a stored record keyed by a short code, plus
 * a QR encoding a short verification URL, plus an HMAC tamper check.
 *
 * One credential per worker: re-issuing ("refresh") keeps the same
 * code and updates the snapshot, so a QR the worker already shared —
 * printed, sent on WhatsApp, taped to a toolbox — keeps resolving, to
 * their *current* passport.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDb } from '@/db/client';
import { passportCredentials, users } from '@/db/schema';
import { buildQrMatrix, type QrMatrix } from '@/lib/qrMatrix';
import { getSkillPassportForSeeker, type PassportSkill, type PassportTest } from './skillPassport.service';

/** Credential lifetime — a passport snapshot shouldn't circulate forever. */
const CREDENTIAL_TTL_DAYS = 90;

/**
 * Code alphabet — Crockford-style, no ambiguous characters (0/O, 1/I/L),
 * so a worker reading the URL aloud isn't misheard. 8 chars ≈ 30 bits.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 8;

/** HMAC secret — same dedicated value (or JWT-secret fallback) the Doondo Score credential uses. */
function secret(): string {
  return env.DOONDO_SCORE_SECRET ?? env.JWT_ACCESS_SECRET;
}

/**
 * Deterministic HMAC over the credential's gameable facts — the tamper
 * check. Mirrors scoreCredential's precedent of leaving display-only
 * fields (name, the full skills/tests lists) out of the signature.
 */
function sign(parts: {
  code: string;
  userId: string;
  score: number;
  verifiedSkillCount: number;
  jobsCompleted: number;
  expiresAt: Date;
}): string {
  const payload = [
    parts.code,
    parts.userId,
    parts.score,
    parts.verifiedSkillCount,
    parts.jobsCompleted,
    parts.expiresAt.getTime(),
  ].join('.');
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export interface IssuedPassportCredential {
  /** Short lookup code embedded in the QR URL. */
  code: string;
  /** Public verification URL the QR encodes. */
  verifyUrl: string;
  score: number;
  memberSince: string;
  skills: PassportSkill[];
  verifiedSkillCount: number;
  skillTests: PassportTest[];
  jobsCompleted: number;
  ratings: { avg: number | null; count: number };
  issuedAt: string;
  expiresAt: string;
  qr: QrMatrix;
}

export interface VerifiedPassportCredential {
  valid: boolean;
  userId?: string;
  name?: string;
  score?: number;
  memberSince?: string;
  skills?: Array<{ slug: string; verified: boolean }>;
  verifiedSkillCount?: number;
  skillTests?: Array<{ id: string; title: string; emoji: string }>;
  jobsCompleted?: number;
  ratingsAvg?: number | null;
  ratingsCount?: number;
  issuedAt?: string;
  expiresAt?: string;
}

/** One random code from the unambiguous alphabet. */
function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = (bytes[i] ?? 0) % CODE_ALPHABET.length;
    out += CODE_ALPHABET[idx] ?? '';
  }
  return out;
}

/** A code not currently in use (retries on the rare collision). */
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(CODE_LENGTH);
    const [clash] = await getDb()
      .select({ id: passportCredentials.id })
      .from(passportCredentials)
      .where(eq(passportCredentials.code, code))
      .limit(1);
    if (!clash) return code;
  }
  // Astronomically unlikely — widen the code rather than fail.
  return randomCode(CODE_LENGTH + 4);
}

/**
 * Issue (or refresh) the worker's Skill Passport credential. Keeps a
 * stable code across refreshes so a previously-shared QR keeps
 * resolving.
 *
 * Throws `notFound` when the user doesn't exist.
 */
export async function issuePassportCredential(userId: string): Promise<IssuedPassportCredential> {
  const db = getDb();
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw errors.notFound('User not found.');

  const passport = await getSkillPassportForSeeker(userId);
  const verifiedSkillCount = passport.skills.filter((s) => s.verified).length;

  const [existing] = await db
    .select({ code: passportCredentials.code })
    .from(passportCredentials)
    .where(eq(passportCredentials.userId, userId))
    .limit(1);
  const code = existing?.code ?? (await generateUniqueCode());

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CREDENTIAL_TTL_DAYS * 24 * 60 * 60 * 1000);
  const signature = sign({
    code,
    userId,
    score: passport.score,
    verifiedSkillCount,
    jobsCompleted: passport.jobsCompleted,
    expiresAt,
  });

  const skillsSnapshot = passport.skills.map((s) => ({ slug: s.slug, verified: s.verified }));

  await db
    .insert(passportCredentials)
    .values({
      userId,
      code,
      name: user.name,
      score: passport.score,
      memberSince: new Date(passport.memberSince),
      skills: skillsSnapshot,
      verifiedSkillCount,
      skillTests: passport.skillTests,
      jobsCompleted: passport.jobsCompleted,
      ratingsAvg: passport.ratings.avg,
      ratingsCount: passport.ratings.count,
      signature,
      issuedAt,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: passportCredentials.userId,
      set: {
        code,
        name: user.name,
        score: passport.score,
        memberSince: new Date(passport.memberSince),
        skills: skillsSnapshot,
        verifiedSkillCount,
        skillTests: passport.skillTests,
        jobsCompleted: passport.jobsCompleted,
        ratingsAvg: passport.ratings.avg,
        ratingsCount: passport.ratings.count,
        signature,
        issuedAt,
        expiresAt,
        updatedAt: new Date(),
      },
    });

  const verifyUrl = `${env.PUBLIC_BASE_URL}/api/v1/passport/verify/${code}`;
  logger.info({ userId, code, score: passport.score }, 'skill passport credential issued');

  return {
    code,
    verifyUrl,
    score: passport.score,
    memberSince: passport.memberSince,
    skills: passport.skills,
    verifiedSkillCount,
    skillTests: passport.skillTests,
    jobsCompleted: passport.jobsCompleted,
    ratings: passport.ratings,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    qr: buildQrMatrix(verifyUrl),
  };
}

/**
 * Verify a scanned credential code. Never throws — an unknown, expired,
 * or tampered credential returns `{ valid: false }`.
 */
export async function verifyPassportCredential(code: string): Promise<VerifiedPassportCredential> {
  const [record] = await getDb()
    .select()
    .from(passportCredentials)
    .where(eq(passportCredentials.code, code.trim()))
    .limit(1);
  if (!record) return { valid: false };

  if (record.expiresAt.getTime() < Date.now()) return { valid: false };

  const expected = sign({
    code: record.code,
    userId: record.userId,
    score: record.score,
    verifiedSkillCount: record.verifiedSkillCount,
    jobsCompleted: record.jobsCompleted,
    expiresAt: record.expiresAt,
  });
  if (expected !== record.signature) return { valid: false };

  return {
    valid: true,
    userId: record.userId,
    name: record.name,
    score: record.score,
    memberSince: record.memberSince.toISOString(),
    skills: record.skills,
    verifiedSkillCount: record.verifiedSkillCount,
    skillTests: record.skillTests,
    jobsCompleted: record.jobsCompleted,
    ratingsAvg: record.ratingsAvg,
    ratingsCount: record.ratingsCount,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}
