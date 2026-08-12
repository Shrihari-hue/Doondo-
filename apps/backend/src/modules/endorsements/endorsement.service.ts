/**
 * Endorsements service — create, list, summarise per seeker.
 *
 * Gating rule: only an employer who has hired the seeker on at least
 * one application can endorse them. We check by counting Applications
 * with status='hired' for the (employer, seeker) pair.
 *
 * Verified-trade threshold: 3 distinct employers endorsing the same
 * trade flips the seeker into "Verified [trade]" badge territory. This
 * is a cheap consensus signal that survives any single employer
 * gaming the system.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, endorsements, photoVerifications, users } from '@/db/schema';

const VERIFIED_THRESHOLD = 3;

export interface PublicEndorsement {
  id: string;
  endorserId: string;
  endorserName: string;
  endorserCompanyName: string | null;
  seekerId: string;
  trade: string;
  applicationId: string | null;
  createdAt: string;
}

export interface PublicPhotoVerification {
  id: string;
  employerId: string;
  employerName: string;
  employerCompanyName: string | null;
  seekerId: string;
  photoIndex: number;
  createdAt: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505'
  );
}

interface CreateInput {
  endorserId: string;
  seekerId: string;
  trade: string;
  applicationId?: string;
}

export async function endorse(input: CreateInput): Promise<PublicEndorsement> {
  if (input.endorserId === input.seekerId) {
    throw errors.forbidden("You can't endorse yourself.");
  }

  // Gate: the endorser must have actually hired this seeker.
  const [hired] = await getDb()
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.employerId, input.endorserId),
        eq(applications.seekerId, input.seekerId),
        eq(applications.status, 'hired'),
      ),
    )
    .limit(1);
  if (!hired) {
    throw errors.forbidden('Only employers who have hired this worker can endorse them.');
  }

  const trade = input.trade.trim().toLowerCase();
  if (!trade) {
    throw errors.validation({ trade: input.trade }, 'trade is required');
  }

  try {
    const [doc] = await getDb()
      .insert(endorsements)
      .values({
        endorserId: input.endorserId,
        seekerId: input.seekerId,
        trade,
        applicationId: input.applicationId ?? null,
      })
      .returning();

    const [endorser] = await getDb()
      .select({ name: users.name, companyName: users.companyName })
      .from(users)
      .where(eq(users.id, input.endorserId))
      .limit(1);

    return {
      id: doc!.id,
      endorserId: doc!.endorserId,
      endorserName: endorser?.name ?? 'Doondo employer',
      endorserCompanyName: endorser?.companyName ?? null,
      seekerId: doc!.seekerId,
      trade: doc!.trade,
      applicationId: doc!.applicationId,
      createdAt: doc!.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw errors.conflict("You've already endorsed this worker for this trade.");
    }
    throw err;
  }
}

export interface TradeEndorsementSummary {
  trade: string;
  count: number;
  /** True when count >= VERIFIED_THRESHOLD (default 3). */
  verified: boolean;
}

/**
 * For a seeker, return per-trade endorsement counts. Drives the
 * "✓ Verified [trade]" pill that surfaces on their profile.
 */
export async function summarizeForSeeker(
  seekerId: string,
): Promise<TradeEndorsementSummary[]> {
  const rows = await getDb()
    .select({ trade: endorsements.trade, count: sql<number>`count(*)::int` })
    .from(endorsements)
    .where(eq(endorsements.seekerId, seekerId))
    .groupBy(endorsements.trade)
    .orderBy(desc(sql`count(*)`), asc(endorsements.trade));

  return rows.map((r) => ({
    trade: r.trade,
    count: r.count,
    verified: r.count >= VERIFIED_THRESHOLD,
  }));
}

/**
 * Did this employer already endorse this seeker on this trade? Used by
 * the mobile to grey out the "Endorse" button when the action is
 * already done.
 */
export async function hasEndorsed(
  employerId: string,
  seekerId: string,
  trade: string,
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: endorsements.id })
    .from(endorsements)
    .where(
      and(
        eq(endorsements.endorserId, employerId),
        eq(endorsements.seekerId, seekerId),
        eq(endorsements.trade, trade.trim().toLowerCase()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ─── Photo verification ─────────────────────────────────────────────────────

interface VerifyPhotoInput {
  employerId: string;
  seekerId: string;
  photoIndex: number;
  applicationId?: string;
}

export async function verifyPhoto(
  input: VerifyPhotoInput,
): Promise<PublicPhotoVerification> {
  if (input.employerId === input.seekerId) {
    throw errors.forbidden("You can't verify your own photos.");
  }
  const [hired] = await getDb()
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.employerId, input.employerId),
        eq(applications.seekerId, input.seekerId),
        eq(applications.status, 'hired'),
      ),
    )
    .limit(1);
  if (!hired) {
    throw errors.forbidden('Only employers who have hired this worker can verify their photos.');
  }
  try {
    const [doc] = await getDb()
      .insert(photoVerifications)
      .values({
        employerId: input.employerId,
        seekerId: input.seekerId,
        photoIndex: input.photoIndex,
        applicationId: input.applicationId ?? null,
      })
      .returning();
    const [employer] = await getDb()
      .select({ name: users.name, companyName: users.companyName })
      .from(users)
      .where(eq(users.id, input.employerId))
      .limit(1);
    return {
      id: doc!.id,
      employerId: doc!.employerId,
      employerName: employer?.name ?? 'Doondo employer',
      employerCompanyName: employer?.companyName ?? null,
      seekerId: doc!.seekerId,
      photoIndex: doc!.photoIndex,
      createdAt: doc!.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw errors.conflict("You've already verified this photo.");
    }
    throw err;
  }
}

export interface PhotoVerificationSummary {
  photoIndex: number;
  count: number;
}

export async function summarizePhotoVerifications(
  seekerId: string,
): Promise<PhotoVerificationSummary[]> {
  const rows = await getDb()
    .select({ photoIndex: photoVerifications.photoIndex, count: sql<number>`count(*)::int` })
    .from(photoVerifications)
    .where(eq(photoVerifications.seekerId, seekerId))
    .groupBy(photoVerifications.photoIndex)
    .orderBy(asc(photoVerifications.photoIndex));
  return rows.map((r) => ({ photoIndex: r.photoIndex, count: r.count }));
}
