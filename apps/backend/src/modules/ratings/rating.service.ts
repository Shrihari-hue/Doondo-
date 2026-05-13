/**
 * Ratings service — business logic for creating and reading ratings.
 *
 * Rules enforced here, not in the controller:
 *   - Cannot rate a non-`hired` application.
 *   - Cannot rate yourself.
 *   - Cannot rate the wrong party (e.g. a seeker can't rate another seeker
 *     just because they know the applicationId).
 *   - Cannot create two ratings for the same (reviewer, application).
 *
 * Reads:
 *   - listForUser(revieweeId) — paginates by createdAt desc.
 *   - summarizeForUser(userId) — returns {avg, count}. Cheap aggregation.
 *   - listMyUnrated(reviewerId) — applications the user could rate but
 *     hasn't yet; surfaced as a prompt on the Applications detail screen.
 */

import { Types } from 'mongoose';
import { ApplicationModel } from '@/modules/applications/application.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendRatingReceivedPush } from '@/lib/push';
import {
  RatingModel,
  type PublicRating,
  type RatingRole,
  type RatingSummary,
} from './rating.model';

interface CreateInput {
  reviewerId: string;
  applicationId: string;
  score: number;
  comment?: string;
}

/**
 * Create a rating. Direction (who's rating whom) is inferred from the
 * reviewer's role on the application: if the reviewer is the application's
 * employer, they're rating the seeker; vice versa.
 */
export async function createRating(input: CreateInput): Promise<PublicRating> {
  const reviewerObjectId = new Types.ObjectId(input.reviewerId);
  const applicationObjectId = new Types.ObjectId(input.applicationId);

  // 1. Load the application + verify status + figure out direction.
  const app = await ApplicationModel.findById(applicationObjectId);
  if (!app) {
    throw new ApiError({
      code: 'NOT_FOUND',
      message: 'Application not found',
      status: 404,
    });
  }
  if (app.status !== 'hired') {
    throw new ApiError({
      code: 'INVALID_STATE',
      message: 'You can only rate someone after the application is hired',
      status: 409,
    });
  }

  const seekerId = app.seekerId.toString();
  const employerId = app.employerId.toString();
  const reviewerIdStr = input.reviewerId;

  let revieweeIdStr: string;
  let role: RatingRole;

  if (reviewerIdStr === seekerId) {
    revieweeIdStr = employerId;
    role = 'employer'; // reviewee is the employer
  } else if (reviewerIdStr === employerId) {
    revieweeIdStr = seekerId;
    role = 'seeker';
  } else {
    throw new ApiError({
      code: 'FORBIDDEN',
      message: 'Only the seeker or employer on this application can rate',
      status: 403,
    });
  }

  if (reviewerIdStr === revieweeIdStr) {
    // Defensive — shouldn't happen given the branches above.
    throw new ApiError({
      code: 'INVALID_INPUT',
      message: "You can't rate yourself",
      status: 400,
    });
  }

  // 2. Create. Unique index on (reviewerId, applicationId) means we either
  //    succeed or hit a duplicate-key — surface that cleanly.
  try {
    const created = await RatingModel.create({
      reviewerId: reviewerObjectId,
      revieweeId: new Types.ObjectId(revieweeIdStr),
      applicationId: applicationObjectId,
      jobId: app.jobId,
      role,
      score: input.score,
      comment: input.comment?.trim() || null,
    });

    // 3. Hydrate the public view.
    const [reviewer, job] = await Promise.all([
      UserModel.findById(reviewerObjectId).select('name photoUrl'),
      JobModel.findById(app.jobId).select('title'),
    ]);

    // Notify the person being rated. Best-effort, won't block the response.
    void sendRatingReceivedPush({
      recipientId: revieweeIdStr,
      reviewerName: reviewer?.name ?? 'Someone',
      score: input.score,
      jobTitle: job?.title,
    });

    return created.toPublicJSON({
      reviewerName: reviewer?.name ?? 'Doondo user',
      reviewerPhotoUrl: reviewer?.photoUrl ?? null,
      jobTitle: job?.title ?? 'this job',
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ApiError({
        code: 'ALREADY_EXISTS',
        message: "You've already rated this job",
        status: 409,
      });
    }
    logger.error({ err }, 'rating create failed');
    throw err;
  }
}

/**
 * Compute summary for a user. Returns 0/0 if no ratings yet — caller
 * should render "No ratings yet" rather than "0.0 ⭐".
 */
export async function summarizeForUser(userId: string): Promise<RatingSummary> {
  const result = await RatingModel.aggregate<{
    _id: null;
    avg: number;
    count: number;
  }>([
    { $match: { revieweeId: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        avg: { $avg: '$score' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (result.length === 0) return { avg: 0, count: 0 };
  const r = result[0]!;
  return {
    // round to one decimal so "4.555…" becomes 4.6 for display.
    avg: Math.round(r.avg * 10) / 10,
    count: r.count,
  };
}

/** Bulk summarize for many users at once — used when listing search results. */
export async function summarizeForUsers(
  userIds: string[],
): Promise<Map<string, RatingSummary>> {
  if (userIds.length === 0) return new Map();
  const result = await RatingModel.aggregate<{
    _id: Types.ObjectId;
    avg: number;
    count: number;
  }>([
    { $match: { revieweeId: { $in: userIds.map((id) => new Types.ObjectId(id)) } } },
    {
      $group: {
        _id: '$revieweeId',
        avg: { $avg: '$score' },
        count: { $sum: 1 },
      },
    },
  ]);
  const map = new Map<string, RatingSummary>();
  for (const r of result) {
    map.set(r._id.toString(), {
      avg: Math.round(r.avg * 10) / 10,
      count: r.count,
    });
  }
  return map;
}

interface ListForUserInput {
  revieweeId: string;
  limit?: number;
}

/** List ratings RECEIVED by a user, newest first. */
export async function listForUser(input: ListForUserInput): Promise<PublicRating[]> {
  const limit = input.limit ?? 20;
  const ratings = await RatingModel.find({ revieweeId: new Types.ObjectId(input.revieweeId) })
    .sort({ createdAt: -1 })
    .limit(limit);

  if (ratings.length === 0) return [];

  // Bulk-load reviewer + job names.
  const reviewerIds = [...new Set(ratings.map((r) => r.reviewerId.toString()))];
  const jobIds = [...new Set(ratings.map((r) => r.jobId.toString()))];

  const [reviewers, jobs] = await Promise.all([
    UserModel.find({ _id: { $in: reviewerIds } }).select('name photoUrl'),
    JobModel.find({ _id: { $in: jobIds } }).select('title'),
  ]);

  const reviewerMap = new Map(
    reviewers.map((u) => [u._id.toString(), { name: u.name, photoUrl: u.photoUrl ?? null }]),
  );
  const jobMap = new Map(jobs.map((j) => [j._id.toString(), j.title]));

  return ratings.map((r) => {
    const reviewerInfo = reviewerMap.get(r.reviewerId.toString());
    return r.toPublicJSON({
      reviewerName: reviewerInfo?.name ?? 'Doondo user',
      reviewerPhotoUrl: reviewerInfo?.photoUrl ?? null,
      jobTitle: jobMap.get(r.jobId.toString()) ?? 'a job',
    });
  });
}

interface UnratedApp {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  otherPartyName: string;
  otherPartyPhotoUrl: string | null;
  hiredAt: string;
}

/**
 * Applications the user could rate but hasn't yet. Surfaced as a prompt
 * banner on the Applications screen / Profile screen — "Rate your last
 * employer / worker".
 */
export async function listMyUnrated(reviewerId: string, limit = 10): Promise<UnratedApp[]> {
  const reviewerObjectId = new Types.ObjectId(reviewerId);

  // 1. All hired applications where this user is either the seeker or employer.
  const applications = await ApplicationModel.find({
    status: 'hired',
    $or: [{ seekerId: reviewerObjectId }, { employerId: reviewerObjectId }],
  })
    .sort({ hiredAt: -1, updatedAt: -1 })
    .limit(50); // load a bit more than `limit` to allow filtering below

  if (applications.length === 0) return [];

  // 2. Which ones have we already rated?
  const applicationIds = applications.map((a) => a._id);
  const myRatings = await RatingModel.find({
    reviewerId: reviewerObjectId,
    applicationId: { $in: applicationIds },
  }).select('applicationId');
  const ratedSet = new Set(myRatings.map((r) => r.applicationId.toString()));

  const unrated = applications
    .filter((a) => !ratedSet.has(a._id.toString()))
    .slice(0, limit);

  if (unrated.length === 0) return [];

  // 3. Hydrate the "other party" and job title.
  const otherIds = unrated.map((a) =>
    reviewerId === a.seekerId.toString() ? a.employerId : a.seekerId,
  );
  const jobIds = unrated.map((a) => a.jobId);

  const [otherUsers, jobs] = await Promise.all([
    UserModel.find({ _id: { $in: otherIds } }).select('name photoUrl'),
    JobModel.find({ _id: { $in: jobIds } }).select('title'),
  ]);

  const otherMap = new Map(
    otherUsers.map((u) => [u._id.toString(), { name: u.name, photoUrl: u.photoUrl ?? null }]),
  );
  const jobMap = new Map(jobs.map((j) => [j._id.toString(), j.title]));

  return unrated.map((a) => {
    const otherId =
      reviewerId === a.seekerId.toString() ? a.employerId.toString() : a.seekerId.toString();
    const other = otherMap.get(otherId);
    return {
      applicationId: a._id.toString(),
      jobId: a.jobId.toString(),
      jobTitle: jobMap.get(a.jobId.toString()) ?? 'this job',
      otherPartyName: other?.name ?? 'Doondo user',
      otherPartyPhotoUrl: other?.photoUrl ?? null,
      hiredAt: (a.hiredAt ?? a.updatedAt).toISOString(),
    };
  });
}
