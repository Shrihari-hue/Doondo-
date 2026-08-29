/**
 * Wage Strike Alerts (#46) — anonymous, structured wage-issue flags.
 *
 * The roadmap flagged this as "politically/legally heavy — ship anonymous
 * reviews first, measure signal, then decide" (see DOONDO_V2_ROADMAP.md
 * bet #44). Anonymous reviews (#10) have been live; this ships a first,
 * deliberately conservative version rather than a public per-employer
 * accusation feed:
 *
 *   - Individual flags are NEVER exposed. Not to the flagged employer,
 *     not to other seekers, not even the reporter's own name on the
 *     aggregate. Only `listMine` (the reporter's own receipt) reads raw
 *     rows, scoped to `reporterId = viewer`.
 *   - The public surface is an aggregate only, and only once volume
 *     clears MIN_SIGNAL_FLAGS — the same honesty bar the ratings
 *     module's tag summary already uses (hidden under 3 reviews).
 *   - One flag per (reporter, job) — a unique index prevents a single
 *     disgruntled reporter from inflating the count by resubmitting.
 */

import { and, count, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { jobs, wageFlags, type WageFlagReason } from '@/db/schema';
import { errors } from '@/lib/errors';

/** Below this many total flags, no aggregate is shown at all. */
export const MIN_SIGNAL_FLAGS = 3;
/** Only flags from the last N days count toward the surfaced signal — an
 *  employer's practices from a year ago shouldn't follow them forever. */
const SIGNAL_WINDOW_DAYS = 180;

export interface CreateWageFlagInput {
  jobId: string;
  reason: WageFlagReason;
  promisedWageAmount?: number | null;
  actualWageAmount?: number | null;
  wagePeriod?: 'hour' | 'day' | 'week' | 'month' | 'fixed' | null;
  note?: string;
}

export interface PublicWageFlag {
  id: string;
  jobId: string;
  jobTitle: string;
  reason: WageFlagReason;
  createdAt: string;
}

export async function createWageFlag(reporterId: string, input: CreateWageFlagInput): Promise<PublicWageFlag> {
  const [job] = await getDb()
    .select({ id: jobs.id, title: jobs.title, employerId: jobs.employerId })
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId === reporterId) throw errors.forbidden("You can't flag your own job.");

  try {
    const [row] = await getDb()
      .insert(wageFlags)
      .values({
        reporterId,
        employerId: job.employerId,
        jobId: job.id,
        reason: input.reason,
        promisedWageAmount: input.promisedWageAmount ?? null,
        actualWageAmount: input.actualWageAmount ?? null,
        wagePeriod: input.wagePeriod ?? null,
        note: (input.note ?? '').trim().slice(0, 500),
      })
      .returning();
    if (!row) throw errors.internal('Could not save flag.');
    return { id: row.id, jobId: job.id, jobTitle: job.title, reason: row.reason, createdAt: row.createdAt.toISOString() };
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } } | null)?.code;
    const causeCode = (err as { cause?: { code?: string } } | null)?.cause?.code;
    if (code === '23505' || causeCode === '23505') {
      throw errors.conflict("You've already flagged this job.");
    }
    throw err;
  }
}

export async function listMine(reporterId: string): Promise<PublicWageFlag[]> {
  const rows = await getDb()
    .select({ id: wageFlags.id, jobId: wageFlags.jobId, reason: wageFlags.reason, createdAt: wageFlags.createdAt, jobTitle: jobs.title })
    .from(wageFlags)
    .innerJoin(jobs, eq(wageFlags.jobId, jobs.id))
    .where(eq(wageFlags.reporterId, reporterId))
    .orderBy(desc(wageFlags.createdAt));
  return rows.map((r) => ({ id: r.id, jobId: r.jobId, jobTitle: r.jobTitle, reason: r.reason, createdAt: r.createdAt.toISOString() }));
}

export interface WageFlagReasonEntry {
  reason: WageFlagReason;
  count: number;
  ratio: number;
}

export type WageFlagSummary =
  | { hasSignal: false }
  | { hasSignal: true; totalFlags: number; windowDays: number; reasons: WageFlagReasonEntry[] };

/**
 * Aggregate wage-flag signal for an employer, gated on volume. Employer
 * identity and individual reports never leak through this — only counts.
 */
export async function summarizeForEmployer(employerId: string): Promise<WageFlagSummary> {
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({ reason: wageFlags.reason, n: count() })
    .from(wageFlags)
    .where(and(eq(wageFlags.employerId, employerId), gte(wageFlags.createdAt, since)))
    .groupBy(wageFlags.reason);

  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  if (total < MIN_SIGNAL_FLAGS) return { hasSignal: false };

  const reasons: WageFlagReasonEntry[] = rows
    .map((r) => ({ reason: r.reason, count: Number(r.n), ratio: Number(r.n) / total }))
    .sort((a, b) => b.count - a.count);

  return { hasSignal: true, totalFlags: total, windowDays: SIGNAL_WINDOW_DAYS, reasons };
}
