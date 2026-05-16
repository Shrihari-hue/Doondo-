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
import { Types } from 'mongoose';
import { errors, AppError } from '@/lib/errors';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { AvailabilityModel } from '@/modules/availabilities/availability.model';

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
    if (!jobId || !Types.ObjectId.isValid(jobId)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid job id',
        status: 400,
      });
    }

    const application = await ApplicationModel.findOne({
      seekerId: new Types.ObjectId(req.user.id),
      jobId: new Types.ObjectId(jobId),
    })
      .select('_id')
      .lean();

    if (!application) {
      throw new AppError({
        code: 'AUTH_FORBIDDEN',
        message: 'Tap "I\'m interested" first to unlock the employer\'s phone.',
        status: 403,
      });
    }

    const job = await JobModel.findById(jobId).select('employerId').lean();
    if (!job) throw errors.jobNotFound();

    const employer = await UserModel.findById(job.employerId)
      .select('name companyName phone')
      .lean();
    if (!employer) throw errors.notFound('Employer not found');

    ok(req, res, 200, {
      contact: {
        userId: (employer._id as Types.ObjectId).toString(),
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
    if (!seekerId || !Types.ObjectId.isValid(seekerId)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid seeker id',
        status: 400,
      });
    }

    const seekerObjectId = new Types.ObjectId(seekerId);
    const employerObjectId = new Types.ObjectId(req.user.id);

    const [hasApplication, hasBeacon] = await Promise.all([
      ApplicationModel.exists({
        seekerId: seekerObjectId,
        employerId: employerObjectId,
      }),
      AvailabilityModel.exists({
        seekerId: seekerObjectId,
        until: { $gt: new Date() },
      }),
    ]);

    if (!hasApplication && !hasBeacon) {
      throw new AppError({
        code: 'AUTH_FORBIDDEN',
        message:
          'This worker hasn\'t applied to your jobs and isn\'t broadcasting availability.',
        status: 403,
      });
    }

    const seeker = await UserModel.findById(seekerObjectId)
      .select('name phone')
      .lean();
    if (!seeker) throw errors.notFound('Worker not found');

    ok(req, res, 200, {
      contact: {
        userId: (seeker._id as Types.ObjectId).toString(),
        name: seeker.name,
        phone: seeker.phone ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
