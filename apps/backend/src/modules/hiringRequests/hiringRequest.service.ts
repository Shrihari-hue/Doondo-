/**
 * HiringRequest service — the employer→worker outbound invite flow.
 *
 * `send` lets an employer invite a worker (picked off the worker map /
 * Find-workers list) to apply for one of their active jobs. The worker
 * answers with `respond`. On accept we upsert an Application so the
 * worker lands straight in that job's pipeline at `shortlisted` — the
 * invite becomes a real pipeline entry, the mirror of a normal apply.
 *
 * No cron: a pending request past `expiresAt` is treated as expired
 * lazily, both when listing and when the worker tries to respond.
 */

import { Types } from 'mongoose';
import { AppError, errors } from '@/lib/errors';
import {
  HiringRequestModel,
  HIRING_REQUEST_TTL_DAYS,
  type HiringRequestDocument,
  type HiringRequestStatus,
  type PublicHiringRequest,
} from './hiringRequest.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import * as notifications from '@/modules/notifications/notification.service';

// ─── Hydration ───────────────────────────────────────────────────────────────

/**
 * Turn raw documents into the public, hydrated shape: attaches the job
 * summary, both party summaries, and the worker's rating in a fixed
 * number of bulk queries regardless of how many requests there are.
 * Also applies lazy expiry — a pending row past its window reads as
 * `expired` without ever being written back.
 */
async function hydrate(
  docs: HiringRequestDocument[],
): Promise<PublicHiringRequest[]> {
  if (docs.length === 0) return [];
  const now = Date.now();

  const jobIds = [...new Set(docs.map((d) => String(d.jobId)))];
  const employerIds = docs.map((d) => String(d.employerId));
  const seekerIds = [...new Set(docs.map((d) => String(d.seekerId)))];
  const userIds = [...new Set([...employerIds, ...seekerIds])];

  const [jobs, users] = await Promise.all([
    JobModel.find({ _id: { $in: jobIds } }).select('title status').lean(),
    UserModel.find({ _id: { $in: userIds } })
      .select('name photoUrl isVerified skills')
      .lean(),
  ]);

  // Reuse the shared ratings aggregation so the worker's "★ 4.6 · 32"
  // badge is identical to everywhere else it appears.
  const { summarizeForUsers } = await import('@/modules/ratings/rating.service');
  const ratingMap = await summarizeForUsers(seekerIds);

  const jobMap = new Map(jobs.map((j) => [String(j._id), j]));
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  return docs.map((doc) => {
    const base = doc.toPublicJSON();
    if (base.status === 'pending' && doc.expiresAt.getTime() <= now) {
      base.status = 'expired';
    }

    const job = jobMap.get(base.jobId);
    if (job) {
      base.job = {
        id: base.jobId,
        title: (job as { title?: string }).title ?? 'Job',
        status: (job as { status?: string }).status ?? 'active',
      };
    }

    const employer = userMap.get(base.employerId);
    if (employer) {
      base.employer = {
        id: base.employerId,
        name: (employer as { name?: string }).name ?? 'Employer',
        photoUrl: (employer as { photoUrl?: string | null }).photoUrl ?? null,
        isVerified: Boolean((employer as { isVerified?: boolean }).isVerified),
      };
    }

    const seeker = userMap.get(base.seekerId);
    if (seeker) {
      const rating = ratingMap.get(base.seekerId);
      base.seeker = {
        id: base.seekerId,
        name: (seeker as { name?: string }).name ?? 'Worker',
        photoUrl: (seeker as { photoUrl?: string | null }).photoUrl ?? null,
        isVerified: Boolean((seeker as { isVerified?: boolean }).isVerified),
        skills: (seeker as { skills?: string[] }).skills ?? [],
        rating:
          rating && rating.count > 0
            ? { avg: rating.avg, count: rating.count }
            : null,
      };
    }

    return base;
  });
}

// ─── Send (employer) ─────────────────────────────────────────────────────────

interface SendInput {
  employerId: string;
  seekerId: string;
  jobId: string;
  message?: string | null;
}

export async function send(input: SendInput): Promise<PublicHiringRequest> {
  if (input.employerId === input.seekerId) {
    throw errors.forbidden('You cannot send a hiring request to yourself.');
  }

  const job = await JobModel.findById(input.jobId).select('employerId status title');
  if (!job) throw errors.jobNotFound();
  if (String(job.employerId) !== input.employerId) {
    throw errors.forbidden('That job belongs to another employer.');
  }
  if (job.status !== 'active') throw errors.jobNotOpen();

  const seeker = await UserModel.findById(input.seekerId).select('role isActive');
  if (!seeker || seeker.role !== 'seeker' || !seeker.isActive) {
    throw errors.notFound('Worker not found.');
  }

  const now = new Date();

  // One live request per (employer, seeker, job). A past decline /
  // withdrawal doesn't block a fresh invite — only an open pending one.
  const existing = await HiringRequestModel.findOne({
    employerId: new Types.ObjectId(input.employerId),
    seekerId: new Types.ObjectId(input.seekerId),
    jobId: new Types.ObjectId(input.jobId),
    status: 'pending',
    expiresAt: { $gt: now },
  });
  if (existing) {
    throw new AppError({
      code: 'CONFLICT',
      message:
        'You already have a pending hiring request to this worker for this job.',
      status: 409,
    });
  }

  const doc = await HiringRequestModel.create({
    employerId: new Types.ObjectId(input.employerId),
    seekerId: new Types.ObjectId(input.seekerId),
    jobId: new Types.ObjectId(input.jobId),
    message: input.message?.trim() || null,
    status: 'pending',
    expiresAt: new Date(
      now.getTime() + HIRING_REQUEST_TTL_DAYS * 24 * 60 * 60_000,
    ),
  });

  // Notify the worker — best-effort, never blocks the request.
  const employer = await UserModel.findById(input.employerId)
    .select('name photoUrl')
    .lean();
  const employerName = (employer as { name?: string } | null)?.name ?? 'An employer';
  await notifications.record({
    recipientId: input.seekerId,
    kind: 'hiring_request',
    title: 'You have a hiring request',
    body: `${employerName} wants to hire you for "${job.title}".`,
    deeplink: { screen: 'HiringRequests' },
    imageUrl: (employer as { photoUrl?: string | null } | null)?.photoUrl ?? null,
  });

  const [pub] = await hydrate([doc]);
  return pub ?? doc.toPublicJSON();
}

// ─── Lists ───────────────────────────────────────────────────────────────────

/** Worker inbox — hiring requests sent TO this seeker. */
export async function listForSeeker(
  seekerId: string,
  statusFilter?: HiringRequestStatus,
): Promise<PublicHiringRequest[]> {
  const query: Record<string, unknown> = {
    seekerId: new Types.ObjectId(seekerId),
  };
  if (statusFilter) query.status = statusFilter;
  const docs = await HiringRequestModel.find(query)
    .sort({ createdAt: -1 })
    .limit(100);
  return hydrate(docs);
}

/** Employer sent-list — hiring requests this employer has sent out. */
export async function listForEmployer(
  employerId: string,
): Promise<PublicHiringRequest[]> {
  const docs = await HiringRequestModel.find({
    employerId: new Types.ObjectId(employerId),
  })
    .sort({ createdAt: -1 })
    .limit(100);
  return hydrate(docs);
}

// ─── Respond (worker) ────────────────────────────────────────────────────────

interface RespondInput {
  requestId: string;
  seekerId: string;
  action: 'accept' | 'decline';
}

export async function respond(
  input: RespondInput,
): Promise<PublicHiringRequest> {
  const doc = await HiringRequestModel.findById(input.requestId);
  if (!doc) throw errors.notFound('Hiring request not found.');
  if (String(doc.seekerId) !== input.seekerId) {
    throw errors.forbidden('This hiring request is not yours.');
  }

  const now = new Date();
  const isExpired =
    doc.status === 'pending' && doc.expiresAt.getTime() <= now.getTime();
  if (doc.status !== 'pending' || isExpired) {
    throw new AppError({
      code: 'CONFLICT',
      message: isExpired
        ? 'This hiring request has expired.'
        : 'This hiring request has already been answered.',
      status: 409,
    });
  }

  let applicationId: Types.ObjectId | null = null;

  if (input.action === 'accept') {
    // Drop the worker into the job's pipeline. Upsert by (seekerId,
    // jobId) — the Application model's compound unique index makes this
    // safe; an existing application is linked rather than duplicated.
    const app = await ApplicationModel.findOneAndUpdate(
      { seekerId: doc.seekerId, jobId: doc.jobId },
      {
        $setOnInsert: {
          seekerId: doc.seekerId,
          jobId: doc.jobId,
          employerId: doc.employerId,
          status: 'shortlisted',
          appliedAt: now,
          shortlistedAt: now,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!app) throw errors.internal();
    applicationId = app._id;
  }

  const updated = await HiringRequestModel.findByIdAndUpdate(
    doc._id,
    {
      $set: {
        status: input.action === 'accept' ? 'accepted' : 'declined',
        applicationId,
        respondedAt: now,
      },
    },
    { new: true },
  );
  if (!updated) throw errors.internal();

  // Tell the employer how the worker answered.
  const seeker = await UserModel.findById(doc.seekerId)
    .select('name photoUrl')
    .lean();
  const seekerName = (seeker as { name?: string } | null)?.name ?? 'A worker';
  const job = await JobModel.findById(doc.jobId).select('title').lean();
  const jobTitle = (job as { title?: string } | null)?.title ?? 'your job';

  await notifications.record({
    recipientId: String(doc.employerId),
    kind: 'hiring_request_responded',
    title:
      input.action === 'accept'
        ? 'Hiring request accepted'
        : 'Hiring request declined',
    body:
      input.action === 'accept'
        ? `${seekerName} accepted your request for "${jobTitle}" — they're now in your applicants.`
        : `${seekerName} declined your hiring request for "${jobTitle}".`,
    deeplink:
      input.action === 'accept' && applicationId
        ? {
            screen: 'ApplicantDetail',
            params: { applicationId: applicationId.toString() },
          }
        : { screen: 'SentHiringRequests' },
    imageUrl: (seeker as { photoUrl?: string | null } | null)?.photoUrl ?? null,
  });

  const [pub] = await hydrate([updated]);
  return pub ?? updated.toPublicJSON();
}

// ─── Withdraw (employer) ─────────────────────────────────────────────────────

export async function withdraw(input: {
  requestId: string;
  employerId: string;
}): Promise<PublicHiringRequest> {
  const doc = await HiringRequestModel.findById(input.requestId);
  if (!doc) throw errors.notFound('Hiring request not found.');
  if (String(doc.employerId) !== input.employerId) {
    throw errors.forbidden('This hiring request is not yours.');
  }
  if (doc.status !== 'pending') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only a pending hiring request can be withdrawn.',
      status: 409,
    });
  }

  const updated = await HiringRequestModel.findByIdAndUpdate(
    doc._id,
    { $set: { status: 'withdrawn', respondedAt: new Date() } },
    { new: true },
  );
  if (!updated) throw errors.internal();
  const [pub] = await hydrate([updated]);
  return pub ?? updated.toPublicJSON();
}
