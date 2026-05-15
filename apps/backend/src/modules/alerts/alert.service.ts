/**
 * Job-alerts service.
 *
 * Two responsibilities:
 *   1. CRUD on a seeker's own alerts (list/create/update/delete).
 *   2. Match-on-create: when a job is posted, fan out a push + in-app
 *      notification to seekers whose alerts match.
 *
 * The matcher runs in-process — no queue, no cron. For Doondo's v1 scale
 * (thousands of alerts, hundreds of new jobs/day) a simple Mongo query
 * scoped by `enabled + city` keeps the work bounded; we add a proper
 * background worker only when the query starts costing >50ms.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { JobAlertModel, type PublicJobAlert } from './alert.model';
import { sendJobAlertMatchPush } from '@/lib/push';
import type { PublicJob } from '@/modules/jobs/job.model';

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
  const alerts = await JobAlertModel.find({
    seekerId: new Types.ObjectId(seekerId),
  }).sort({ updatedAt: -1 });
  return alerts.map((a) => a.toPublicJSON());
}

export async function createForUser(
  seekerId: string,
  input: UpsertInput,
): Promise<PublicJobAlert> {
  const created = await JobAlertModel.create({
    seekerId: new Types.ObjectId(seekerId),
    name: input.name.trim(),
    query: input.query?.trim() || null,
    city: input.city?.trim() || null,
    jobTypes: input.jobTypes ?? [],
    urgentOnly: Boolean(input.urgentOnly),
    radiusKm: input.radiusKm ?? null,
    coordinates: input.coordinates ?? undefined,
    enabled: input.enabled ?? true,
  });
  return created.toPublicJSON();
}

export async function updateForUser(
  seekerId: string,
  alertId: string,
  patch: Partial<UpsertInput>,
): Promise<PublicJobAlert> {
  if (!Types.ObjectId.isValid(alertId)) {
    throw errors.notFound('Alert not found');
  }
  const alert = await JobAlertModel.findOne({
    _id: new Types.ObjectId(alertId),
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!alert) throw errors.notFound('Alert not found');

  if (patch.name !== undefined) alert.name = patch.name.trim();
  if (patch.query !== undefined) alert.query = patch.query?.trim() || null;
  if (patch.city !== undefined) alert.city = patch.city?.trim() || null;
  if (patch.jobTypes !== undefined) alert.jobTypes = patch.jobTypes;
  if (patch.urgentOnly !== undefined) alert.urgentOnly = patch.urgentOnly;
  if (patch.radiusKm !== undefined) alert.radiusKm = patch.radiusKm;
  if (patch.coordinates !== undefined) {
    alert.coordinates = patch.coordinates ?? undefined;
  }
  if (patch.enabled !== undefined) alert.enabled = patch.enabled;

  await alert.save();
  return alert.toPublicJSON();
}

export async function deleteForUser(
  seekerId: string,
  alertId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(alertId)) return;
  await JobAlertModel.deleteOne({
    _id: new Types.ObjectId(alertId),
    seekerId: new Types.ObjectId(seekerId),
  });
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
  const candidates = await JobAlertModel.find({
    enabled: true,
    $or: [{ city: null }, { city: new RegExp(`^${escapeRegex(job.location.city)}$`, 'i') }],
  })
    .select('seekerId name query city jobTypes urgentOnly lastMatchedJobId')
    .lean();

  if (candidates.length === 0) return;

  const matched: Array<{ id: string; seekerId: string; name: string }> = [];
  for (const a of candidates) {
    if (jobMatchesAlert(job, a)) {
      matched.push({
        id: (a._id as Types.ObjectId).toString(),
        seekerId: (a.seekerId as Types.ObjectId).toString(),
        name: a.name,
      });
    }
  }
  if (matched.length === 0) return;

  // Bump counters + lastMatched. One bulk write keeps it cheap.
  try {
    await JobAlertModel.bulkWrite(
      matched.map((m) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(m.id) },
          update: {
            $set: {
              lastMatchedJobId: new Types.ObjectId(job.id),
              lastMatchedAt: new Date(),
            },
            $inc: { matchCount: 1 },
          },
        },
      })),
    );
  } catch (err) {
    logger.warn({ err, jobId: job.id }, 'alert bulkWrite failed');
  }

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
