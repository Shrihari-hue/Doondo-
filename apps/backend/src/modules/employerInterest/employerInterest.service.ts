/**
 * EmployerInterest service — the worker→employer inbound-interest flow.
 *
 * `express` upserts the worker's standing interest in an employer (one
 * row per pair, so re-expressing refreshes rather than spams). The
 * employer reads their inbound list with `listForEmployer` and clears
 * rows with `markViewed` / `archive`. `getMine` lets the seeker UI show
 * "interest already sent" without a second guess.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { employerInterests, users, type EmployerInterestStatus } from '@/db/schema';
import * as notifications from '@/modules/notifications/notification.service';

export interface PublicEmployerInterest {
  id: string;
  status: EmployerInterestStatus;
  message: string | null;
  seekerId: string;
  employerId: string;
  viewedAt: string | null;
  createdAt: string;
  /** Hydrated by the service for the employer's inbound-list view. */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    isVerified: boolean;
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
}

type InterestRow = typeof employerInterests.$inferSelect;

function toPublicJSON(row: InterestRow): PublicEmployerInterest {
  return {
    id: row.id,
    status: row.status,
    message: row.message ?? null,
    seekerId: row.seekerId,
    employerId: row.employerId,
    viewedAt: row.viewedAt ? row.viewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Hydration ───────────────────────────────────────────────────────────────

/** Attach the worker summary + rating in a fixed number of bulk queries. */
async function hydrate(rows: InterestRow[]): Promise<PublicEmployerInterest[]> {
  if (rows.length === 0) return [];
  const seekerIds = [...new Set(rows.map((r) => r.seekerId))];

  const seekers = await getDb()
    .select({ id: users.id, name: users.name, photoUrl: users.photoUrl, isVerified: users.isVerified, skills: users.skills })
    .from(users)
    .where(inArray(users.id, seekerIds));
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds);

  const seekerMap = new Map(seekers.map((s) => [s.id, s]));

  return rows.map((row) => {
    const base = toPublicJSON(row);
    const seeker = seekerMap.get(base.seekerId);
    if (seeker) {
      const rating = ratingMap.get(base.seekerId);
      base.seeker = {
        id: base.seekerId,
        name: seeker.name ?? 'Worker',
        photoUrl: seeker.photoUrl ?? null,
        isVerified: Boolean(seeker.isVerified),
        skills: seeker.skills ?? [],
        rating: rating && rating.count > 0 ? { avg: rating.avg, count: rating.count } : null,
      };
    }
    return base;
  });
}

// ─── Express (worker) ────────────────────────────────────────────────────────

interface ExpressInput {
  seekerId: string;
  employerId: string;
  message?: string | null;
}

export async function express(
  input: ExpressInput,
): Promise<PublicEmployerInterest> {
  if (input.seekerId === input.employerId) {
    throw errors.forbidden('You cannot express interest in yourself.');
  }

  const [employer] = await getDb()
    .select({ role: users.role, isActive: users.isActive, name: users.name })
    .from(users)
    .where(eq(users.id, input.employerId))
    .limit(1);
  if (!employer || employer.role !== 'employer' || !employer.isActive) {
    throw errors.notFound('Employer not found.');
  }

  // Upsert by (seeker, employer) — the unique index guarantees one
  // standing interest per pair. Re-expressing refreshes the message and
  // resets the status to pending so it resurfaces for the employer.
  const [doc] = await getDb()
    .insert(employerInterests)
    .values({
      seekerId: input.seekerId,
      employerId: input.employerId,
      message: input.message?.trim() || null,
      status: 'pending',
      viewedAt: null,
    })
    .onConflictDoUpdate({
      target: [employerInterests.seekerId, employerInterests.employerId],
      set: { message: input.message?.trim() || null, status: 'pending', viewedAt: null, updatedAt: new Date() },
    })
    .returning();
  if (!doc) throw errors.internal();

  // Notify the employer — best-effort.
  const [seeker] = await getDb()
    .select({ name: users.name, photoUrl: users.photoUrl })
    .from(users)
    .where(eq(users.id, input.seekerId))
    .limit(1);
  const seekerName = seeker?.name ?? 'A worker';
  await notifications.record({
    recipientId: input.employerId,
    kind: 'employer_interest',
    title: 'A worker is interested in you',
    body: `${seekerName} would like to work for you.`,
    deeplink: { screen: 'InterestedWorkers' },
    imageUrl: seeker?.photoUrl ?? null,
  });

  const [pub] = await hydrate([doc]);
  return pub ?? toPublicJSON(doc);
}

// ─── Lists / reads ───────────────────────────────────────────────────────────

/** Employer inbound list — workers who expressed interest in this employer. */
export async function listForEmployer(
  employerId: string,
  statusFilter?: EmployerInterestStatus,
): Promise<PublicEmployerInterest[]> {
  const conditions = [eq(employerInterests.employerId, employerId)];
  if (statusFilter) conditions.push(eq(employerInterests.status, statusFilter));
  const rows = await getDb()
    .select()
    .from(employerInterests)
    .where(and(...conditions))
    .orderBy(desc(employerInterests.createdAt))
    .limit(100);
  return hydrate(rows);
}

/** The seeker's own interest in one employer — null if they haven't raised it. */
export async function getMine(input: {
  seekerId: string;
  employerId: string;
}): Promise<PublicEmployerInterest | null> {
  const [row] = await getDb()
    .select()
    .from(employerInterests)
    .where(and(eq(employerInterests.seekerId, input.seekerId), eq(employerInterests.employerId, input.employerId)))
    .limit(1);
  return row ? toPublicJSON(row) : null;
}

// ─── Employer mutations ──────────────────────────────────────────────────────

async function loadOwned(interestId: string, employerId: string): Promise<InterestRow> {
  const [row] = await getDb().select().from(employerInterests).where(eq(employerInterests.id, interestId)).limit(1);
  if (!row) throw errors.notFound('Interest not found.');
  if (row.employerId !== employerId) {
    throw errors.forbidden('This interest is not addressed to you.');
  }
  return row;
}

export async function markViewed(input: {
  interestId: string;
  employerId: string;
}): Promise<PublicEmployerInterest> {
  const row = await loadOwned(input.interestId, input.employerId);
  if (row.status === 'pending') {
    const [updated] = await getDb()
      .update(employerInterests)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(eq(employerInterests.id, row.id))
      .returning();
    if (updated) return (await hydrate([updated]))[0] ?? toPublicJSON(updated);
  }
  return (await hydrate([row]))[0] ?? toPublicJSON(row);
}

export async function archive(input: {
  interestId: string;
  employerId: string;
}): Promise<PublicEmployerInterest> {
  const row = await loadOwned(input.interestId, input.employerId);
  const [updated] = await getDb()
    .update(employerInterests)
    .set({ status: 'archived' })
    .where(eq(employerInterests.id, row.id))
    .returning();
  if (!updated) throw errors.internal();
  return (await hydrate([updated]))[0] ?? toPublicJSON(updated);
}

// ─── Withdraw (worker) ───────────────────────────────────────────────────────

export async function withdraw(input: {
  seekerId: string;
  employerId: string;
}): Promise<void> {
  await getDb()
    .delete(employerInterests)
    .where(and(eq(employerInterests.seekerId, input.seekerId), eq(employerInterests.employerId, input.employerId)));
}
