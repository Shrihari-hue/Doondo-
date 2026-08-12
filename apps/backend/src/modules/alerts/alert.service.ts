/**
 * Job-alerts service.
 *
 * Two responsibilities:
 *   1. CRUD on a seeker's own alerts (list/create/update/delete).
 *   2. Match-on-create: when a job is posted, fan out a push + in-app
 *      notification to seekers whose alerts match.
 *
 * The matcher runs in-process — no queue, no cron. For Doondo's v1 scale
 * (thousands of alerts, hundreds of new jobs/day) a simple query scoped
 * by `enabled + city` keeps the work bounded; we add a proper background
 * worker only when the query starts costing >50ms.
 */

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { jobAlerts, type JobType } from '@/db/schema';
import { sendJobAlertMatchPush } from '@/lib/push';
import type { PublicJob } from '@/modules/jobs/job.model';

type JobAlertRow = typeof jobAlerts.$inferSelect;

export interface PublicJobAlert {
  id: string;
  name: string;
  query: string | null;
  city: string | null;
  jobTypes: JobType[];
  urgentOnly: boolean;
  radiusKm: number | null;
  coordinates: [number, number] | null;
  enabled: boolean;
  lastMatchedJobId: string | null;
  lastMatchedAt: string | null;
  matchCount: number;
  createdAt: string;
}

function toPublicJSON(row: JobAlertRow): PublicJobAlert {
  return {
    id: row.id,
    name: row.name,
    query: row.query ?? null,
    city: row.city ?? null,
    jobTypes: row.jobTypes,
    urgentOnly: row.urgentOnly,
    radiusKm: row.radiusKm ?? null,
    coordinates: row.coordinates ?? null,
    enabled: row.enabled,
    lastMatchedJobId: row.lastMatchedJobId ?? null,
    lastMatchedAt: row.lastMatchedAt ? row.lastMatchedAt.toISOString() : null,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export interface UpsertInput {
  name: string;
  query?: string | null;
  city?: string | null;
  jobTypes?: PublicJobAlert['jobTypes'];
  urgentOnly?: boolean;
  radiusKm?: number | null;
  coordinates?: [number, number] | null;
  enabled?: boolean;
}

/** Alerts the user owns, newest first. */
export async function listForUser(seekerId: string): Promise<PublicJobAlert[]> {
  const rows = await getDb()
    .select()
    .from(jobAlerts)
    .where(eq(jobAlerts.seekerId, seekerId))
    .orderBy(desc(jobAlerts.updatedAt));
  return rows.map(toPublicJSON);
}

export async function createForUser(
  seekerId: string,
  input: UpsertInput,
): Promise<PublicJobAlert> {
  const [created] = await getDb()
    .insert(jobAlerts)
    .values({
      seekerId,
      name: input.name.trim(),
      query: input.query?.trim() || null,
      city: input.city?.trim() || null,
      jobTypes: input.jobTypes ?? [],
      urgentOnly: Boolean(input.urgentOnly),
      radiusKm: input.radiusKm ?? null,
      coordinates: input.coordinates ?? null,
      enabled: input.enabled ?? true,
    })
    .returning();
  return toPublicJSON(created!);
}

export async function updateForUser(
  seekerId: string,
  alertId: string,
  patch: Partial<UpsertInput>,
): Promise<PublicJobAlert> {
  const values: Partial<typeof jobAlerts.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.query !== undefined) values.query = patch.query?.trim() || null;
  if (patch.city !== undefined) values.city = patch.city?.trim() || null;
  if (patch.jobTypes !== undefined) values.jobTypes = patch.jobTypes;
  if (patch.urgentOnly !== undefined) values.urgentOnly = patch.urgentOnly;
  if (patch.radiusKm !== undefined) values.radiusKm = patch.radiusKm;
  if (patch.coordinates !== undefined) values.coordinates = patch.coordinates ?? null;
  if (patch.enabled !== undefined) values.enabled = patch.enabled;

  const [updated] = await getDb()
    .update(jobAlerts)
    .set(values)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.seekerId, seekerId)))
    .returning();
  if (!updated) throw errors.notFound('Alert not found');
  return toPublicJSON(updated);
}

export async function deleteForUser(seekerId: string, alertId: string): Promise<void> {
  await getDb()
    .delete(jobAlerts)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.seekerId, seekerId)));
}

// ─── Matching ───────────────────────────────────────────────────────────────

/**
 * Hot path — called once per new active job. Fires push + in-app
 * notifications to seekers whose alerts match. Caller is expected to
 * `void` this so failures don't bubble to the job-create response.
 */
export async function matchJobToAlerts(job: PublicJob): Promise<void> {
  if (job.status !== 'active') return;

  // Pre-filter at the DB level: only enabled alerts, optionally scoped to
  // the job's city. We accept alerts with no city (national) too.
  const candidates = await getDb()
    .select({
      id: jobAlerts.id,
      seekerId: jobAlerts.seekerId,
      name: jobAlerts.name,
      query: jobAlerts.query,
      city: jobAlerts.city,
      jobTypes: jobAlerts.jobTypes,
      urgentOnly: jobAlerts.urgentOnly,
    })
    .from(jobAlerts)
    .where(
      and(
        eq(jobAlerts.enabled, true),
        or(isNull(jobAlerts.city), sql`lower(${jobAlerts.city}) = lower(${job.location.city})`),
      ),
    );

  if (candidates.length === 0) return;

  const matched: Array<{ id: string; seekerId: string; name: string }> = [];
  for (const a of candidates) {
    if (jobMatchesAlert(job, a)) {
      matched.push({ id: a.id, seekerId: a.seekerId, name: a.name });
    }
  }
  if (matched.length === 0) return;

  // Bump counters + lastMatched for every matched alert.
  await Promise.all(
    matched.map((m) =>
      getDb()
        .update(jobAlerts)
        .set({
          lastMatchedJobId: job.id,
          lastMatchedAt: new Date(),
          matchCount: sql`${jobAlerts.matchCount} + 1`,
        })
        .where(eq(jobAlerts.id, m.id)),
    ),
  );

  // Fan out a push + in-app row per matched seeker. Each seeker may have
  // multiple alerts matching the same job; we collapse to one notification
  // per seeker by keeping just the first alert name.
  const perSeeker = new Map<string, { alertName: string }>();
  for (const m of matched) {
    if (!perSeeker.has(m.seekerId)) {
      perSeeker.set(m.seekerId, { alertName: m.name });
    }
  }
  for (const [seekerId, { alertName }] of perSeeker) {
    void sendJobAlertMatchPush({
      recipientId: seekerId,
      alertName,
      jobId: job.id,
      jobTitle: job.title,
      city: job.location.city,
    });
  }
}

interface AlertSnapshot {
  query?: string | null;
  city?: string | null;
  jobTypes?: string[];
  urgentOnly?: boolean;
}

function jobMatchesAlert(job: PublicJob, alert: AlertSnapshot): boolean {
  // City — already pre-filtered, but a defensive belt-and-braces check.
  if (alert.city) {
    if (job.location.city.toLowerCase() !== alert.city.toLowerCase()) {
      return false;
    }
  }

  // Job type — empty list means "any type".
  if (Array.isArray(alert.jobTypes) && alert.jobTypes.length > 0) {
    if (!alert.jobTypes.includes(job.type)) return false;
  }

  // Urgent only.
  if (alert.urgentOnly && !job.urgent) return false;

  // Free-text query — searched against title, description, skills.
  if (alert.query && alert.query.trim()) {
    const q = alert.query.trim().toLowerCase();
    const haystack = [
      job.title,
      job.description,
      ...(job.skills ?? []),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}
