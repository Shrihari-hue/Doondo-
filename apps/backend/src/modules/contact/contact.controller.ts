/**
 * Contact-reveal endpoints — gated phone-number lookup that powers the
 * one-tap call flow.
 *
 * Why a separate endpoint instead of just exposing `phone` in PublicJob
 * or the seeker summary: a phone number is the most sensitive thing on
 * a profile. Revealing it only after a real signal of mutual interest
 * (an Application either way, or an active Availability beacon) cuts
 * the spam surface dramatically.
 *
 * Gating rules:
 *   GET /jobs/:id/contact         — seeker calling employer.
 *     Requires the seeker to have an Application (any status) on the job.
 *   GET /seekers/:id/contact      — employer calling seeker.
 *     Requires EITHER (a) an Application from this seeker on one of the
 *     employer's jobs, OR (b) an active Availability beacon from this
 *     seeker. Either way the seeker has signalled openness to contact.
 */

import type { Request, Response, NextFunction } from 'express';
import { gt, and, eq } from 'drizzle-orm';
import { errors, AppError } from '@/lib/errors';
import { getDb } from '@/db/client';
import { applications, availabilities, jobs, users } from '@/db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/**
 * Seeker → employer phone reveal for a specific job.
 * Returns 403 when the caller hasn't applied (or expressed interest) yet.
 */
export async function revealEmployerContact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const jobId = req.params.id;
    if (!jobId || !UUID_RE.test(jobId)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid job id',
        status: 400,
      });
    }

    const db = getDb();
    const [application] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.seekerId, req.user.id), eq(applications.jobId, jobId)))
      .limit(1);

    if (!application) {
      throw new AppError({
        code: 'AUTH_FORBIDDEN',
        message: 'Tap "I\'m interested" first to unlock the employer\'s phone.',
        status: 403,
      });
    }

    const [job] = await db.select({ employerId: jobs.employerId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw errors.jobNotFound();

    const [employer] = await db
      .select({ id: users.id, name: users.name, companyName: users.companyName, phone: users.phone })
      .from(users)
      .where(eq(users.id, job.employerId))
      .limit(1);
    if (!employer) throw errors.notFound('Employer not found');

    ok(req, res, 200, {
      contact: {
        userId: employer.id,
        name: employer.companyName ?? employer.name,
        phone: employer.phone ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Employer → seeker phone reveal. Allowed when:
 *   - the seeker has applied to (or expressed interest in) one of the
 *     employer's jobs, OR
 *   - the seeker has an active Availability beacon (anyone-can-call mode)
 */
export async function revealSeekerContact(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const seekerId = req.params.id;
    if (!seekerId || !UUID_RE.test(seekerId)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid seeker id',
        status: 400,
      });
    }

    const db = getDb();
    const [applicationRows, beaconRows] = await Promise.all([
      db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.seekerId, seekerId), eq(applications.employerId, req.user.id)))
        .limit(1),
      db
        .select({ id: availabilities.id })
        .from(availabilities)
        .where(and(eq(availabilities.seekerId, seekerId), gt(availabilities.until, new Date())))
        .limit(1),
    ]);
    const hasApplication = applicationRows.length > 0;
    const hasBeacon = beaconRows.length > 0;

    if (!hasApplication && !hasBeacon) {
      throw new AppError({
        code: 'AUTH_FORBIDDEN',
        message:
          'This worker hasn\'t applied to your jobs and isn\'t broadcasting availability.',
        status: 403,
      });
    }

    const [seeker] = await db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, seekerId))
      .limit(1);
    if (!seeker) throw errors.notFound('Worker not found');

    ok(req, res, 200, {
      contact: {
        userId: seeker.id,
        name: seeker.name,
        phone: seeker.phone ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
