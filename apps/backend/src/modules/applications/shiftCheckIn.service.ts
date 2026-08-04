/**
 * ShiftCheckIn service — record a worker arriving / leaving a job site.
 *
 * Business rules:
 *   - Only the seeker on a `hired` application may check in / out.
 *   - The selfie + geo are both required so the record is auditable.
 *   - Check-ins beyond `MAX_DISTANCE_METERS` from the job's saved
 *     coordinates are rejected with a 422 so the worker is told their
 *     location doesn't match. Jobs without coordinates (rare) skip
 *     the fence and accept anything — better than refusing to check
 *     in on a flexible / route-based job.
 *
 * Side effects:
 *   - On every successful check-in/out, the employer is pushed so
 *     they see worker activity in real time. The seeker is socketed
 *     so their other devices stay in sync.
 *   - The check-in is also a positive signal for the worker's Doondo
 *     Score over time (not wired in v1 — we'd want a few weeks of
 *     real attendance data first before letting it move the score).
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emitToUser } from '@/sockets/bus';
import { sendShiftCheckinPush } from '@/lib/push';
import { getDb } from '@/db/client';
import { applications, jobs, shiftCheckIns, users } from '@/db/schema';
import { hashPhone } from '@/lib/phoneHash';
import type { PublicShiftCheckIn, ShiftCheckInKind } from './shiftCheckIn.model';

/** Hard fence — beyond this, the check-in is suspect. */
const MAX_DISTANCE_METERS = 750;

interface CreateInput {
  callerId: string;
  applicationId: string;
  kind: ShiftCheckInKind;
  selfieDataUrl: string;
  lat: number;
  lng: number;
  /** Optional client-side timestamp (rarely used; defaults to server time). */
  timestamp?: string;
}

type CheckInRow = typeof shiftCheckIns.$inferSelect;

function toPublic(row: CheckInRow): PublicShiftCheckIn {
  return {
    id: row.id,
    applicationId: row.applicationId,
    seekerId: row.seekerId,
    employerId: row.employerId,
    jobId: row.jobId,
    kind: row.kind,
    selfieUrl: row.selfieUrl,
    location: { lat: row.geo.y, lng: row.geo.x },
    distanceFromJobMeters: row.distanceFromJobMeters ?? null,
    timestamp: row.timestamp.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Create a check-in or check-out row. Enforces ownership, status,
 * fence distance, and selfie format before writing.
 */
export async function createCheckIn(input: CreateInput): Promise<PublicShiftCheckIn> {
  // 1. Load + authorize.
  const [app] = await getDb()
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!app) throw errors.applicationNotFound();
  if (app.seekerId !== input.callerId) throw errors.forbidden();
  if (app.status !== 'hired') {
    throw errors.conflict('You can only check in once you have been hired.');
  }

  // 2. Validate the selfie shape. Cheap reject on size + prefix.
  if (typeof input.selfieDataUrl !== 'string' || !input.selfieDataUrl.startsWith('data:image/')) {
    throw errors.validation(
      { selfieDataUrl: 'invalid' },
      'Selfie must be a base64 data URL (data:image/...).',
    );
  }
  if (input.selfieDataUrl.length > 550_000) {
    throw errors.validation(
      { selfieDataUrl: 'too_large' },
      'Selfie is too large after compression. Try again.',
    );
  }

  // 3. Fence the location against the job's saved coordinates. Jobs
  //    without geo are off-route work — we accept anything (rare).
  const [job] = await getDb()
    .select({ geo: jobs.geo, title: jobs.title })
    .from(jobs)
    .where(eq(jobs.id, app.jobId))
    .limit(1);
  if (!job) throw errors.jobNotFound();
  const jobCoords: [number, number] = [job.geo.x, job.geo.y];

  let distanceMeters: number | null = null;
  if (jobCoords.length === 2) {
    distanceMeters = haversineMeters(
      { lat: jobCoords[1]!, lng: jobCoords[0]! },
      { lat: input.lat, lng: input.lng },
    );
    if (distanceMeters > MAX_DISTANCE_METERS) {
      throw new (await import('@/lib/errors')).AppError({
        code: 'CONFLICT',
        message: `You're ${Math.round(distanceMeters)}m from the job site. Move closer (within ${MAX_DISTANCE_METERS}m) and try again.`,
        status: 422,
        details: { distanceMeters, maxDistance: MAX_DISTANCE_METERS },
      });
    }
  }

  // 4. Write. Denormalise the seeker/employer ids so future queries
  //    don't need a join.
  const [row] = await getDb()
    .insert(shiftCheckIns)
    .values({
      applicationId: app.id,
      seekerId: app.seekerId,
      employerId: app.employerId,
      jobId: app.jobId,
      kind: input.kind,
      selfieUrl: input.selfieDataUrl,
      geo: { x: input.lng, y: input.lat },
      distanceFromJobMeters: distanceMeters,
      timestamp: input.timestamp ? new Date(input.timestamp) : new Date(),
    })
    .returning();

  // 5. Side effects — push the employer, socket the seeker. Best-effort.
  const [seeker] = await getDb()
    .select({
      name: users.name,
      trustCircle: users.trustCircle,
      shareShiftsWithCircle: users.shareShiftsWithCircle,
    })
    .from(users)
    .where(eq(users.id, app.seekerId))
    .limit(1);
  void sendShiftCheckinPush({
    recipientId: app.employerId,
    actorName: seeker?.name ?? 'Worker',
    kind: input.kind,
    jobTitle: job.title,
    applicationId: app.id,
  }).catch((err) => logger.warn({ err, applicationId: app.id }, 'shift check-in push failed'));

  // Trust Circle shift ping — when the worker has opted in, notify the
  // contacts in their circle who are themselves Doondo users (push
  // only, matched by phone hash, same as the SOS fan-out). This is the
  // accountability / safety-net half of the Trust Circle feature.
  if (seeker?.shareShiftsWithCircle && Array.isArray(seeker.trustCircle)) {
    void (async () => {
      try {
        const circle = seeker.trustCircle;
        if (circle.length === 0) return;
        const { sendTrustCircleShiftPush } = await import('@/lib/push');
        const hashes = circle.map((c) => hashPhone(c.phone));
        const matched = await getDb()
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.phoneHash, hashes), eq(users.isActive, true)));
        const workerFirstName = (seeker.name ?? 'Your contact').split(' ')[0] ?? 'Your contact';
        for (const m of matched) {
          // Don't notify the worker themself if they happen to have
          // their own number in their circle.
          if (m.id === app.seekerId) {
            continue;
          }
          void sendTrustCircleShiftPush({
            recipientId: m.id,
            workerFirstName,
            kind: input.kind,
            jobTitle: job.title,
          });
        }
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'trust circle shift ping failed');
      }
    })();
  }
  emitToUser(app.seekerId, 'shift:check_in', {
    applicationId: app.id,
    kind: input.kind,
    timestamp: row!.timestamp.toISOString(),
  });

  // On check-OUT, open a "reached home safe?" prompt for the worker. The
  // positive safety bookend to the shift — best-effort, never blocks.
  if (input.kind === 'check_out') {
    void (async () => {
      try {
        const { openOnCheckout } = await import('@/modules/homeSafe/homeSafe.service');
        await openOnCheckout({
          seekerId: app.seekerId,
          applicationId: app.id,
          jobId: app.jobId,
          employerId: app.employerId,
        });
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'home-safe open failed');
      }
    })();
  }

  // Bump the seeker's shift-day streak — only on check_in (not check_out)
  // so each day of work counts exactly once. Fire-and-forget.
  if (input.kind === 'check_in') {
    void (async () => {
      try {
        const { bumpStreak } = await import('@/modules/users/streaks.service');
        await bumpStreak(app.seekerId, 'shift');
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'shift streak bump failed');
      }
    })();

    // First shift check-in for this application? Credit the referral
    // bonus to both sides. We detect "first" by counting check_in rows
    // for the application — exactly 1 means the row we just wrote is
    // the first. The referral service is itself idempotent (status
    // guard), so a double-fire is harmless.
    void (async () => {
      try {
        const [count] = await getDb()
          .select({ value: sql<number>`count(*)::int` })
          .from(shiftCheckIns)
          .where(and(eq(shiftCheckIns.applicationId, app.id), eq(shiftCheckIns.kind, 'check_in')));
        const priorCheckIns = count?.value ?? 0;
        if (priorCheckIns !== 1) return; // not the first check-in
        const { creditOnFirstShift } = await import('@/modules/referrals/referral.service');
        await creditOnFirstShift({
          refereeId: app.seekerId,
          jobId: app.jobId,
          applicationId: app.id,
        });
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'referral first-shift credit failed');
      }
    })();
  }

  logger.info(
    {
      applicationId: app.id,
      kind: input.kind,
      seekerId: app.seekerId,
      employerId: app.employerId,
      distanceMeters,
    },
    'shift check-in recorded',
  );

  // Include the selfie in the response so the caller can show it back
  // immediately for confirmation.
  return toPublic(row!);
}

/**
 * List check-ins for an application. Returns oldest-first (chronological)
 * so callers can render the day's events as a stripe.
 *
 * Authorisation:
 *   - The seeker on the application
 *   - The employer on the application
 *   - Anyone else: 403.
 *
 * The selfie data URL is included only for the parties; admins / future
 * exports will need their own code path.
 */
export async function listForApplication(input: {
  callerId: string;
  applicationId: string;
}): Promise<PublicShiftCheckIn[]> {
  const [app] = await getDb()
    .select({ seekerId: applications.seekerId, employerId: applications.employerId })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!app) throw errors.applicationNotFound();

  const { seekerId, employerId } = app;
  if (input.callerId !== seekerId && input.callerId !== employerId) {
    throw errors.forbidden();
  }

  const rows = await getDb()
    .select()
    .from(shiftCheckIns)
    .where(eq(shiftCheckIns.applicationId, input.applicationId))
    .orderBy(asc(shiftCheckIns.timestamp));

  return rows.map(toPublic);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Haversine distance in meters between two lat/lng points.
 *
 * Used for the geofence check. Cheap, deterministic, and good to ~0.5%
 * for distances under 10km — well within our 750m fence tolerance.
 */
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000; // mean Earth radius, meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
