/**
 * Applications service.
 *
 * apply()
 *   1. Loads the job, asserts it exists and is 'active'.
 *   2. Tries to insert the Application. The unique index on (seekerId,
 *      jobId) is the source of truth for "already applied" — we don't
 *      pre-check, we let the DB enforce it and translate the duplicate
 *      key error to a clean 409.
 *   3. Bumps job.applicantsCount denormalised counter.
 *   4. Emits 'application:status_changed' to the seeker for parity with
 *      future status updates (so mobile can update its cache uniformly).
 *
 * listMine() returns the seeker's applications, optionally filtered by
 * status, hydrated with their job summaries — Phase 2's "My Applications"
 * tab needs both the application + the job in one fetch.
 *
 * Phase 3 will add employer-facing methods (markViewed, shortlist, hire,
 * reject) that drive the rest of the lifecycle. They live on this service
 * so all status transitions go through one validated code path.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emitToUser } from '@/sockets/bus';
import { sendApplicationStatusPush } from '@/lib/push';
import { JobModel, type PublicJob } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { getOrCreateForApplication } from '@/modules/chat/chat.service';
import {
  ApplicationModel,
  type ApplicationStatus,
  type PublicApplication,
} from './application.model';

interface ApplyInput {
  seekerId: string;
  jobId: string;
  coverNote?: string | null;
}

export async function apply(input: ApplyInput): Promise<PublicApplication> {
  const job = await JobModel.findById(input.jobId);
  if (!job) throw errors.jobNotFound();
  if (job.status !== 'active') throw errors.jobNotOpen();

  try {
    const app = await ApplicationModel.create({
      seekerId: new Types.ObjectId(input.seekerId),
      jobId: job._id,
      employerId: job.employerId,
      coverNote: input.coverNote ?? null,
      status: 'pending',
      appliedAt: new Date(),
    });

    // Bump denormalised counter — fire and forget; even if it fails the
    // application itself is the source of truth.
    void JobModel.updateOne({ _id: job._id }, { $inc: { applicantsCount: 1 } });

    logger.info(
      { applicationId: app.id, seekerId: input.seekerId, jobId: input.jobId },
      'application submitted',
    );

    // Emit to the seeker so their other devices stay in sync.
    emitToUser(input.seekerId, 'application:status_changed', {
      applicationId: app.id,
      jobId: input.jobId,
      status: 'pending' as ApplicationStatus,
      timestamp: app.appliedAt.toISOString(),
    });

    return app.toPublicJSON();
  } catch (err) {
    if (isDuplicateKey(err)) throw errors.applicationAlreadyExists();
    throw err;
  }
}

export async function listMine(
  seekerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<PublicApplication & { job?: PublicJob }>> {
  const q: Record<string, unknown> = { seekerId: new Types.ObjectId(seekerId) };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q)
    .sort({ createdAt: -1 })
    .limit(filter.limit);

  if (apps.length === 0) return [];

  // Hydrate jobs in one round-trip.
  const jobIds = [...new Set(apps.map((a) => a.jobId.toString()))];
  const jobs = await JobModel.find({ _id: { $in: jobIds } });
  const employerIds = [...new Set(jobs.map((j) => j.employerId.toString()))];
  const employers = await UserModel.find({ _id: { $in: employerIds } })
    .select('name isVerified')
    .lean();
  const employerMap = new Map(
    employers.map((e) => [
      (e._id as Types.ObjectId).toString(),
      {
        id: (e._id as Types.ObjectId).toString(),
        name: e.name,
        isVerified: Boolean(e.isVerified),
      },
    ]),
  );
  const jobMap = new Map(
    jobs.map((j) => [
      j.id,
      { ...j.toPublicJSON(), employer: employerMap.get(j.employerId.toString()) },
    ]),
  );

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    job: jobMap.get(a.jobId.toString()),
  }));
}

export async function findById(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication & { job?: PublicJob }> {
  const app = await ApplicationModel.findOne({
    _id: applicationId,
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!app) throw errors.applicationNotFound();

  const job = await JobModel.findById(app.jobId);
  if (!job) {
    return app.toPublicJSON();
  }
  const employer = await UserModel.findById(job.employerId)
    .select('name isVerified')
    .lean();
  return {
    ...app.toPublicJSON(),
    job: {
      ...job.toPublicJSON(),
      employer: employer
        ? {
            id: (employer._id as Types.ObjectId).toString(),
            name: employer.name,
            isVerified: Boolean(employer.isVerified),
          }
        : undefined,
    },
  };
}

export async function withdraw(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findOne({
    _id: applicationId,
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!app) throw errors.applicationNotFound();

  if (app.status === 'withdrawn' || app.status === 'rejected' || app.status === 'hired') {
    throw errors.applicationInvalidTransition(app.status, 'withdrawn');
  }

  app.status = 'withdrawn';
  app.withdrawnAt = new Date();
  await app.save();

  void JobModel.updateOne(
    { _id: app.jobId, applicantsCount: { $gt: 0 } },
    { $inc: { applicantsCount: -1 } },
  );

  emitToUser(seekerId, 'application:status_changed', {
    applicationId: app.id,
    jobId: app.jobId.toString(),
    status: 'withdrawn' as ApplicationStatus,
    timestamp: app.withdrawnAt.toISOString(),
  });

  return app.toPublicJSON();
}

// ─── Employer-side operations (Phase 3) ─────────────────────────────────────

/**
 * Transition an application's status. Validates ownership (employer must
 * own the job the application is for) and the state machine, sets the
 * matching timestamp, emits the live socket event to the seeker, and
 * (on hire) bumps the job to `filled`.
 *
 * Allowed transitions:
 *   pending     → viewed | rejected
 *   viewed      → shortlisted | rejected
 *   shortlisted → hired | rejected
 *
 * `withdrawn` is seeker-only (handled in withdraw()) and terminal in
 * both directions. `hired` and `rejected` are terminal.
 */
const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['viewed', 'rejected', 'shortlisted'],
  viewed: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  hired: [],
  withdrawn: [],
};

export async function transitionByEmployer(
  employerId: string,
  applicationId: string,
  next: ApplicationStatus,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(applicationId);
  if (!app) throw errors.applicationNotFound();
  if (app.employerId.toString() !== employerId) throw errors.forbidden();

  const cur = app.status;
  const allowed = ALLOWED_TRANSITIONS[cur].includes(next);
  if (!allowed) {
    throw errors.applicationInvalidTransition(cur, next);
  }

  const now = new Date();
  app.status = next;
  switch (next) {
    case 'viewed':
      app.viewedAt = now;
      break;
    case 'shortlisted':
      app.shortlistedAt = now;
      break;
    case 'rejected':
      app.rejectedAt = now;
      break;
    case 'hired':
      app.hiredAt = now;
      break;
    default:
      break;
  }
  await app.save();

  // On hire, mark the job filled — frees other seekers from seeing it.
  if (next === 'hired') {
    void JobModel.updateOne({ _id: app.jobId }, { $set: { status: 'filled' } });
  }

  // Auto-unlock chat on shortlist or hire. Idempotent — re-running on
  // shortlist→hire returns the same conversation.
  if (next === 'shortlisted' || next === 'hired') {
    try {
      await getOrCreateForApplication({
        employerId: new Types.ObjectId(employerId),
        seekerId: app.seekerId as unknown as Types.ObjectId,
        jobId: app.jobId as unknown as Types.ObjectId,
      });
    } catch (err) {
      logger.warn({ err, applicationId: app.id }, 'chat auto-unlock failed');
    }
  }

  logger.info(
    { applicationId: app.id, status: next, employerId, seekerId: app.seekerId.toString() },
    'application transitioned',
  );

  // Notify the seeker live (socket).
  emitToUser(app.seekerId.toString(), 'application:status_changed', {
    applicationId: app.id,
    jobId: app.jobId.toString(),
    status: next,
    timestamp: now.toISOString(),
  });

  // Push (best-effort) — for users who have the app closed or backgrounded.
  // We hydrate the job title for a friendlier message body.
  void (async () => {
    const job = await JobModel.findById(app.jobId).select('title').lean();
    void sendApplicationStatusPush({
      recipientId: app.seekerId.toString(),
      status: next,
      jobTitle: job?.title,
      applicationId: app.id,
    });
  })();

  return app.toPublicJSON();
}

interface ApplicantListEntry extends PublicApplication {
  /** Hydrated seeker summary (name, photo, skills, location). */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    location: { city: string | null; area: string | null } | null;
  };
}

/**
 * List ALL applicants across ALL of the employer's jobs in one query.
 * Used by the employer's Applicants tab. Hydrates seeker + job summaries
 * so the client renders a flat list without follow-up requests.
 */
export async function listApplicantsForEmployer(
  employerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<ApplicantListEntry & { job?: import('@/modules/jobs/job.model').PublicJob }>> {
  const q: Record<string, unknown> = {
    employerId: new Types.ObjectId(employerId),
  };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q).sort({ createdAt: -1 }).limit(filter.limit);
  if (apps.length === 0) return [];

  const seekerIds = [...new Set(apps.map((a) => a.seekerId.toString()))];
  const jobIds = [...new Set(apps.map((a) => a.jobId.toString()))];

  const [seekers, jobs] = await Promise.all([
    UserModel.find({ _id: { $in: seekerIds } })
      .select('name photoUrl skills isVerified location')
      .lean(),
    JobModel.find({ _id: { $in: jobIds } }),
  ]);

  const seekerMap = new Map(
    seekers.map((s) => [
      (s._id as Types.ObjectId).toString(),
      {
        id: (s._id as Types.ObjectId).toString(),
        name: s.name,
        photoUrl: s.photoUrl ?? null,
        skills: s.skills ?? [],
        isVerified: Boolean(s.isVerified),
        location: s.location
          ? { city: s.location.city ?? null, area: s.location.area ?? null }
          : null,
      },
    ]),
  );
  const jobMap = new Map(jobs.map((j) => [j.id, j.toPublicJSON()]));

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    seeker: seekerMap.get(a.seekerId.toString()),
    job: jobMap.get(a.jobId.toString()),
  }));
}

/**
 * List all applicants for one of the employer's jobs. Asserts ownership.
 */
export async function listApplicantsForJob(
  employerId: string,
  jobId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<ApplicantListEntry[]> {
  const job = await JobModel.findById(jobId).select('employerId').lean();
  if (!job) throw errors.jobNotFound();
  if (job.employerId.toString() !== employerId) throw errors.forbidden();

  const q: Record<string, unknown> = {
    jobId: new Types.ObjectId(jobId),
    employerId: new Types.ObjectId(employerId),
  };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q).sort({ createdAt: -1 }).limit(filter.limit);
  if (apps.length === 0) return [];

  const seekerIds = [...new Set(apps.map((a) => a.seekerId.toString()))];
  const seekers = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl skills isVerified location')
    .lean();
  const seekerMap = new Map(
    seekers.map((s) => [
      (s._id as Types.ObjectId).toString(),
      {
        id: (s._id as Types.ObjectId).toString(),
        name: s.name,
        photoUrl: s.photoUrl ?? null,
        skills: s.skills ?? [],
        isVerified: Boolean(s.isVerified),
        location: s.location
          ? { city: s.location.city ?? null, area: s.location.area ?? null }
          : null,
      },
    ]),
  );

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    seeker: seekerMap.get(a.seekerId.toString()),
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}
