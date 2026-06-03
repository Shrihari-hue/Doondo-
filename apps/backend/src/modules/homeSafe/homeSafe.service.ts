/**
 * Home-safe service — open a check on shift check-out, let the worker
 * confirm they got home, and (opt-in) reassure their Trust Circle.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserModel } from '@/modules/users/user.model';
import { HomeSafeCheckModel, type HomeSafeStatus } from './homeSafe.model';

export interface PublicHomeSafeCheck {
  id: string;
  applicationId: string;
  jobId: string;
  status: HomeSafeStatus;
  startedAt: string;
  confirmedAt: string | null;
  jobTitle: string | null;
}

interface CreateInput {
  seekerId: string;
  applicationId: string;
  jobId: string;
  employerId: string;
}

/**
 * Open a pending home-safe check for a shift check-out. Idempotent within
 * a short window: if a pending check for this application opened in the
 * last 6h, reuse it rather than stacking duplicates (double check-out).
 */
export async function openOnCheckout(input: CreateInput): Promise<void> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const existing = await HomeSafeCheckModel.findOne({
    applicationId: new Types.ObjectId(input.applicationId),
    status: 'pending',
    startedAt: { $gte: sixHoursAgo },
  })
    .select('_id')
    .lean();
  if (existing) return;

  await HomeSafeCheckModel.create({
    seekerId: new Types.ObjectId(input.seekerId),
    applicationId: new Types.ObjectId(input.applicationId),
    jobId: new Types.ObjectId(input.jobId),
    employerId: new Types.ObjectId(input.employerId),
    status: 'pending',
    startedAt: new Date(),
  });
}

export async function listPending(seekerId: string): Promise<PublicHomeSafeCheck[]> {
  const rows = await HomeSafeCheckModel.find({
    seekerId: new Types.ObjectId(seekerId),
    status: 'pending',
  })
    .sort({ startedAt: -1 })
    .limit(10)
    .populate('jobId', 'title')
    .lean();

  return rows.map((r) => ({
    id: (r._id as Types.ObjectId).toString(),
    applicationId: (r.applicationId as Types.ObjectId).toString(),
    jobId:
      typeof r.jobId === 'object' && r.jobId && '_id' in r.jobId
        ? (r.jobId as { _id: Types.ObjectId })._id.toString()
        : (r.jobId as unknown as Types.ObjectId).toString(),
    status: r.status,
    startedAt: new Date(r.startedAt).toISOString(),
    confirmedAt: r.confirmedAt ? new Date(r.confirmedAt).toISOString() : null,
    jobTitle:
      typeof r.jobId === 'object' && r.jobId && 'title' in r.jobId
        ? ((r.jobId as { title?: string }).title ?? null)
        : null,
  }));
}

/** Confirm safe arrival. Best-effort reassurance ping to the Trust Circle. */
export async function confirmSafe(seekerId: string, id: string): Promise<PublicHomeSafeCheck> {
  const check = await HomeSafeCheckModel.findOne({
    _id: new Types.ObjectId(id),
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!check) throw errors.notFound('Home-safe check not found.');

  if (check.status !== 'safe') {
    check.status = 'safe';
    check.confirmedAt = new Date();
    await check.save();
    void notifyCircle(seekerId).catch((err) =>
      logger.warn({ err, seekerId }, 'home-safe circle ping failed'),
    );
  }

  const job = await import('@/modules/jobs/job.model').then(({ JobModel }) =>
    JobModel.findById(check.jobId).select('title').lean(),
  );

  return {
    id: check.id,
    applicationId: check.applicationId.toString(),
    jobId: check.jobId.toString(),
    status: check.status,
    startedAt: check.startedAt.toISOString(),
    confirmedAt: check.confirmedAt ? check.confirmedAt.toISOString() : null,
    jobTitle: (job as { title?: string } | null)?.title ?? null,
  };
}

/**
 * Reassurance ping to the worker's Trust Circle contacts who are Doondo
 * users, gated on the same opt-in as the shift pings. Matches contacts by
 * phone hash, exactly like the SOS / shift fan-out.
 */
async function notifyCircle(seekerId: string): Promise<void> {
  const seeker = await UserModel.findById(seekerId)
    .select('name trustCircle shareShiftsWithCircle')
    .lean();
  if (!seeker) return;
  if (!(seeker as { shareShiftsWithCircle?: boolean }).shareShiftsWithCircle) return;
  const circle = (seeker as { trustCircle?: Array<{ phone: string }> }).trustCircle;
  if (!Array.isArray(circle) || circle.length === 0) return;

  const { hashPhone } = await import('@/modules/me/findFriends.service');
  const { sendHomeSafeCirclePush } = await import('@/lib/push');
  const hashes = circle.map((c) => hashPhone(c.phone));
  const matched = await UserModel.find({ phoneHash: { $in: hashes }, isActive: true })
    .select('_id')
    .lean();
  const firstName = ((seeker as { name?: string }).name ?? 'Your contact').split(' ')[0] ?? 'Your contact';

  for (const m of matched) {
    if ((m._id as Types.ObjectId).toString() === seekerId) continue;
    void sendHomeSafeCirclePush({
      recipientId: (m._id as Types.ObjectId).toString(),
      workerFirstName: firstName,
    });
  }
}
