/**
 * Employer profile detail endpoint.
 *
 * Lives outside the /me/* group because this is the PUBLIC view of an
 * employer that any seeker can pull up before deciding whether to apply
 * to one of their jobs. The mobile screen renders:
 *   - Company name + brand basics
 *   - Verified badge + rating summary
 *   - "Jobs posted" / "Hires made" / "Average rating" stats
 *   - Recent active jobs list
 *
 * The endpoint is intentionally lightweight: a single round-trip per
 * employer load, no pagination of the recent jobs list (cap at 5).
 * Heavy fields like resume / push tokens / employerLocation.* are never
 * touched — those would never apply to an employer anyway.
 */

import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';

import { UserModel } from '@/modules/users/user.model';
import { JobModel, type PublicJob } from '@/modules/jobs/job.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import { summarizeForUser } from '@/modules/ratings/rating.service';
import { AppError } from '@/lib/errors';

/**
 * GET /api/v1/employers/:id
 *
 * Returns a public profile + summary stats + the employer's most recent
 * active jobs. 404 if the user doesn't exist or isn't an employer (we
 * don't leak the existence of seeker accounts via this endpoint).
 */
export async function getEmployerProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid employer id',
        status: 400,
      });
    }
    const employerObjectId = new Types.ObjectId(id);

    const employer = await UserModel.findOne({
      _id: employerObjectId,
      role: 'employer',
      isActive: true,
    });
    if (!employer) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Employer not found',
        status: 404,
      });
    }

    // Stats — small aggregates kicked off in parallel. `totalApplications`
    // and `ghostedCount` feed the responsiveness signal: the anti-ghost
    // sweep stamps `flaggedAsGhostedAt` on applications this employer
    // left unanswered past the SLA window. A high ratio is the public
    // "slow to respond" warning a seeker sees before applying.
    const [
      jobsCount,
      activeJobsCount,
      hiresCount,
      totalApplications,
      ghostedCount,
      ratingSummary,
      recentJobs,
    ] = await Promise.all([
      JobModel.countDocuments({ employerId: employerObjectId }),
      JobModel.countDocuments({ employerId: employerObjectId, status: 'active' }),
      ApplicationModel.countDocuments({
        employerId: employerObjectId,
        status: 'hired',
      }),
      ApplicationModel.countDocuments({ employerId: employerObjectId }),
      ApplicationModel.countDocuments({
        employerId: employerObjectId,
        flaggedAsGhostedAt: { $ne: null },
      }),
      summarizeForUser(employer._id.toString()),
      JobModel.find({ employerId: employerObjectId, status: 'active' })
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    const rating =
      ratingSummary.count > 0
        ? { avg: ratingSummary.avg, count: ratingSummary.count }
        : null;

    const recentJobsPublic: PublicJob[] = recentJobs.map((j) => j.toPublicJSON());

    res.status(200).json({
      ok: true,
      data: {
        employer: employer.toPublicJSON({ rating }),
        stats: {
          jobsCount,
          activeJobsCount,
          hiresCount,
          // Responsiveness — the mobile decides whether to render a
          // warning pill. We send the raw numbers so the threshold
          // logic + copy live on the client (and stay tunable without
          // a backend deploy). `ghostRate` is 0..1, or null when there
          // aren't enough applications (< 5) to judge the employer fairly.
          totalApplications,
          ghostedCount,
          ghostRate:
            totalApplications >= 5 ? ghostedCount / totalApplications : null,
        },
        recentJobs: recentJobsPublic,
      },
    });
  } catch (err) {
    next(err);
  }
}
