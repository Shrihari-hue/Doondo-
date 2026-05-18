/**
 * "Hired near you today" — social-proof signal.
 *
 * Two surfaces:
 *   1. PUSH FAN-OUT on hire — when an application transitions to
 *      `hired`, we find seekers within `RADIUS_METERS` of the job
 *      site whose Doondo Score / verification suggests they're real
 *      users (not spammers) and push them: "Priya was just hired
 *      as Cook helper in Indiranagar." This drives belief that the
 *      platform actually works.
 *
 *   2. PULL FEED — `GET /me/hired-nearby` returns the last few hires
 *      within radius of the caller's home location, so the Home
 *      screen can render a static social-proof rail without needing
 *      a push to have been received.
 *
 * Privacy posture:
 *   - We surface only the hired worker's first name (split on space),
 *     the job title, and the area — never the full name, never the
 *     phone, never the exact coordinates.
 *   - The feed is auth-gated so a casual scraper can't pull it.
 *
 * Anti-spam:
 *   - Hard cap at 50 recipients per hire event.
 *   - Recipients must be verified seekers (`isVerified === true`).
 *   - Recipients with `notificationPrefs.jobs === false` are skipped.
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { sendHiredNearbyPush } from '@/lib/push';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from './application.model';

const RADIUS_METERS = 10_000;
const FANOUT_MAX = 50;

interface HiredNearbyEntry {
  /** Application id of the hire (opaque — used as a key by the UI). */
  applicationId: string;
  /** Hired worker's first name only. */
  hiredFirstName: string;
  jobTitle: string;
  area: string | null;
  city: string | null;
  /** ISO timestamp of the hire. */
  hiredAt: string;
}

/**
 * Push fan-out called from `application.service.transitionByEmployer`
 * the moment a hire is recorded. The job and the application are
 * already loaded by the caller — we re-query so this service stays
 * self-sufficient and testable.
 */
export async function fanOutOnHire(input: {
  applicationId: string;
  excludeUserIds?: string[];
}): Promise<{ pushed: number }> {
  const app = await ApplicationModel.findById(input.applicationId).lean();
  if (!app) return { pushed: 0 };
  const job = await JobModel.findById(app.jobId).select('title location').lean();
  if (!job) return { pushed: 0 };

  const coords = (job as { location?: { geo?: { coordinates?: [number, number] } } })
    .location?.geo?.coordinates;
  if (!coords || coords.length !== 2) return { pushed: 0 };

  const seeker = await UserModel.findById(app.seekerId).select('name').lean();
  const firstName =
    ((seeker as { name?: string } | null)?.name ?? 'A worker').split(' ')[0] ?? 'A worker';

  const exclude = new Set([
    (app.seekerId as unknown as Types.ObjectId).toString(),
    ...(input.excludeUserIds ?? []),
  ]);

  // Find verified seekers within radius. The 2dsphere index on
  // `location.geo` makes this cheap. We DON'T limit by notificationPrefs
  // here — the push helper filters per-recipient.
  const candidates = await UserModel.find({
    role: 'seeker',
    isVerified: true,
    isActive: true,
    'location.geo': {
      $near: {
        $geometry: { type: 'Point', coordinates: coords },
        $maxDistance: RADIUS_METERS,
      },
    },
  })
    .select('_id notificationPrefs')
    .limit(FANOUT_MAX * 2) // grab a bit more so we can filter out opt-outs
    .lean();

  const jobTitle = (job as { title?: string }).title ?? 'a role';
  const area = (job as { location?: { area?: string | null } }).location?.area ?? null;

  let pushed = 0;
  for (const u of candidates) {
    if (pushed >= FANOUT_MAX) break;
    const uid = (u._id as Types.ObjectId).toString();
    if (exclude.has(uid)) continue;
    // Honor the seeker's job-push preference. We're pinging them about
    // a hire, which is the "jobs" channel from the user's perspective.
    const wantsJobs =
      (u as { notificationPrefs?: { jobs?: boolean } }).notificationPrefs?.jobs !== false;
    if (!wantsJobs) continue;

    void sendHiredNearbyPush({
      recipientId: uid,
      hiredFirstName: firstName,
      jobTitle,
      area,
    }).catch((err) =>
      logger.warn({ err, recipientId: uid }, 'hired-nearby push failed'),
    );
    pushed += 1;
  }

  logger.info(
    { applicationId: input.applicationId, pushed, radius: RADIUS_METERS },
    'hired-nearby fan-out complete',
  );

  return { pushed };
}

/**
 * Pull surface for the Home screen rail. Returns up to `limit` recent
 * hires within radius of the caller's saved home location.
 *
 * Auth-gated (the route uses requireAuth). The list is anonymised —
 * only first names, no coords beyond the area string.
 */
export async function listNearbyHires(input: {
  callerId: string;
  limit?: number;
  /** Override radius — defaults to the same 10km the fan-out uses. */
  radiusMeters?: number;
}): Promise<HiredNearbyEntry[]> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  const radius = input.radiusMeters ?? RADIUS_METERS;

  const caller = await UserModel.findById(input.callerId)
    .select('location')
    .lean<{ location?: { geo?: { coordinates?: [number, number] } } } | null>();
  const coords = caller?.location?.geo?.coordinates;
  if (!coords || coords.length !== 2) return [];

  // Stage 1: find jobs near the caller. Stage 2: pull recent hires
  // against those job ids. Using a $geoNear aggregation on jobs is
  // simpler than two queries.
  const nearbyJobs = await JobModel.aggregate<{
    _id: Types.ObjectId;
    title: string;
    location?: { area?: string | null; city?: string | null };
  }>([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: coords },
        distanceField: 'distanceMeters',
        maxDistance: radius,
        spherical: true,
      },
    },
    { $project: { _id: 1, title: 1, 'location.area': 1, 'location.city': 1 } },
    { $limit: 500 },
  ]);
  if (nearbyJobs.length === 0) return [];

  const jobIdToMeta = new Map(
    nearbyJobs.map((j) => [
      j._id.toString(),
      {
        title: j.title,
        area: (j.location?.area as string | null | undefined) ?? null,
        city: (j.location?.city as string | null | undefined) ?? null,
      },
    ]),
  );

  // Pull the most recent hired applications for those jobs.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const hires = await ApplicationModel.find({
    jobId: { $in: nearbyJobs.map((j) => j._id) },
    status: 'hired',
    hiredAt: { $gte: since },
  })
    .sort({ hiredAt: -1 })
    .limit(limit * 3) // overfetch so we can drop self + missing seeker rows
    .lean<
      Array<{
        _id: Types.ObjectId;
        seekerId: Types.ObjectId;
        jobId: Types.ObjectId;
        hiredAt: Date;
      }>
    >();
  if (hires.length === 0) return [];

  const seekerIds = [...new Set(hires.map((h) => h.seekerId.toString()))];
  const seekers = await UserModel.find({ _id: { $in: seekerIds } })
    .select('_id name')
    .lean<Array<{ _id: Types.ObjectId; name?: string }>>();
  const nameById = new Map(
    seekers.map((s) => [
      s._id.toString(),
      (s.name ?? 'A worker').split(' ')[0] ?? 'A worker',
    ]),
  );

  const entries: HiredNearbyEntry[] = [];
  for (const hire of hires) {
    if (entries.length >= limit) break;
    const seekerKey = hire.seekerId.toString();
    if (seekerKey === input.callerId) continue; // never show the caller's own hire to themself
    const meta = jobIdToMeta.get(hire.jobId.toString());
    if (!meta) continue;
    entries.push({
      applicationId: hire._id.toString(),
      hiredFirstName: nameById.get(seekerKey) ?? 'A worker',
      jobTitle: meta.title,
      area: meta.area,
      city: meta.city,
      hiredAt: hire.hiredAt.toISOString(),
    });
  }

  return entries;
}
