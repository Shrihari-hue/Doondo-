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
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { applications, jobs, users } from '@/db/schema';
import { toPublicUser } from '@/modules/users/user.serializers';
import { toPublicJob } from '@/modules/jobs/job.serializers';
import { summarizeForUser } from '@/modules/ratings/rating.service';
import { AppError } from '@/lib/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!id || !UUID_RE.test(id)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid employer id',
        status: 400,
      });
    }

    const db = getDb();
    const [employer] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, 'employer'), eq(users.isActive, true)))
      .limit(1);
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
      [jobsCountRow],
      [activeJobsCountRow],
      [hiresCountRow],
      [totalApplicationsRow],
      [ghostedCountRow],
      ratingSummary,
      recentJobs,
    ] = await Promise.all([
      db.select({ n: count() }).from(jobs).where(eq(jobs.employerId, id)),
      db.select({ n: count() }).from(jobs).where(and(eq(jobs.employerId, id), eq(jobs.status, 'active'))),
      db.select({ n: count() }).from(applications).where(and(eq(applications.employerId, id), eq(applications.status, 'hired'))),
      db.select({ n: count() }).from(applications).where(eq(applications.employerId, id)),
      db.select({ n: count() }).from(applications).where(and(eq(applications.employerId, id), isNotNull(applications.flaggedAsGhostedAt))),
      summarizeForUser(employer.id),
      db.select().from(jobs).where(and(eq(jobs.employerId, id), eq(jobs.status, 'active'))).orderBy(desc(jobs.createdAt)).limit(5),
    ]);

    const jobsCount = jobsCountRow!.n;
    const activeJobsCount = activeJobsCountRow!.n;
    const hiresCount = hiresCountRow!.n;
    const totalApplications = totalApplicationsRow!.n;
    const ghostedCount = ghostedCountRow!.n;

    const rating =
      ratingSummary.count > 0
        ? { avg: ratingSummary.avg, count: ratingSummary.count }
        : null;

    const recentJobsPublic = recentJobs.map((j) => toPublicJob(j));

    res.status(200).json({
      ok: true,
      data: {
        employer: toPublicUser(employer, { rating }),
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
