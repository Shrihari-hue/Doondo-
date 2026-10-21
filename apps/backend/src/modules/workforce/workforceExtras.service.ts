/**
 * Tasks + private monthly reviews for hired workers.
 */
import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { ApplicationModel } from '@/modules/applications/application.model';
import { JobModel } from '@/modules/jobs/job.model';
import { WorkerTaskModel, type TaskPriority, type TaskStatus } from './workerTask.model';
import { WorkerReviewModel } from './workerReview.model';
import { UserModel } from '@/modules/users/user.model';
import { sendTaskAssignedPush } from '@/lib/push';
import { logger } from '@/lib/logger';

export interface PublicTask {
  id: string;
  applicationId: string;
  title: string;
  location: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  jobTitle?: string | null;
}

function toTask(t: {
  _id: unknown; applicationId: unknown; title: string; location?: string | null; dueDate?: string | null;
  priority: TaskPriority; status: TaskStatus; completedAt?: Date | null; createdAt: Date;
}): PublicTask {
  return {
    id: String(t._id),
    applicationId: String(t.applicationId),
    title: t.title,
    location: t.location ?? null,
    dueDate: t.dueDate ?? null,
    priority: t.priority,
    status: t.status,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

async function ownedHire(employerId: string, applicationId: string) {
  if (!Types.ObjectId.isValid(applicationId)) throw errors.notFound('Worker not found.');
  const app = await ApplicationModel.findById(applicationId).select('employerId seekerId status').lean();
  if (!app || app.employerId.toString() !== employerId || app.status !== 'hired') {
    throw errors.notFound('Worker not found.');
  }
  return app;
}

export async function listTasks(employerId: string, applicationId: string): Promise<PublicTask[]> {
  await ownedHire(employerId, applicationId);
  const rows = await WorkerTaskModel.find({ applicationId: new Types.ObjectId(applicationId) })
    .sort({ status: 1, dueDate: 1, createdAt: -1 })
    .lean();
  return rows.map(toTask);
}

export async function createTask(
  employerId: string,
  applicationId: string,
  input: { title: string; location?: string | null; dueDate?: string | null; priority?: TaskPriority },
): Promise<PublicTask> {
  const app = await ownedHire(employerId, applicationId);
  const created = await WorkerTaskModel.create({
    employerId: app.employerId,
    applicationId: new Types.ObjectId(applicationId),
    seekerId: app.seekerId,
    title: input.title.trim(),
    location: input.location?.trim() || null,
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? 'medium',
  });
  // Fire-and-forget: tell the worker.
  void (async () => {
    try {
      const employer = await UserModel.findById(employerId).select('name companyName').lean();
      const e = employer as { name?: string; companyName?: string | null } | null;
      await sendTaskAssignedPush({
        recipientId: app.seekerId.toString(),
        employerName: e?.companyName || e?.name || 'Your employer',
        taskTitle: created.title,
      });
    } catch (err) {
      logger.warn({ err }, 'task push failed');
    }
  })();
  return toTask(created.toObject());
}

/** Either party on the hire can move a task's status; only the employer can edit/delete. */
export async function updateTask(
  userId: string,
  role: 'employer' | 'seeker',
  taskId: string,
  patch: { status?: TaskStatus; title?: string; priority?: TaskPriority; dueDate?: string | null; location?: string | null },
): Promise<PublicTask> {
  if (!Types.ObjectId.isValid(taskId)) throw errors.notFound('Task not found.');
  const task = await WorkerTaskModel.findById(taskId);
  if (!task) throw errors.notFound('Task not found.');
  const owner = role === 'employer' ? task.employerId : task.seekerId;
  if (owner.toString() !== userId) throw errors.notFound('Task not found.');
  if (patch.status) {
    task.status = patch.status;
    task.completedAt = patch.status === 'completed' ? new Date() : null;
  }
  if (role === 'employer') {
    if (patch.title !== undefined) task.title = patch.title.trim();
    if (patch.priority) task.priority = patch.priority;
    if (patch.dueDate !== undefined) task.dueDate = patch.dueDate;
    if (patch.location !== undefined) task.location = patch.location?.trim() || null;
  }
  await task.save();
  return toTask(task.toObject());
}

export async function deleteTask(employerId: string, taskId: string): Promise<void> {
  if (!Types.ObjectId.isValid(taskId)) throw errors.notFound('Task not found.');
  const res = await WorkerTaskModel.deleteOne({ _id: taskId, employerId: new Types.ObjectId(employerId) });
  if (res.deletedCount === 0) throw errors.notFound('Task not found.');
}

/** A worker's open + recently completed tasks across all their active hires. */
export async function listMyTasks(seekerId: string): Promise<PublicTask[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await WorkerTaskModel.find({
    seekerId: new Types.ObjectId(seekerId),
    $or: [{ status: { $ne: 'completed' } }, { completedAt: { $gte: since } }],
  })
    .sort({ status: 1, dueDate: 1 })
    .limit(100)
    .lean();
  const appIds = [...new Set(rows.map((r) => r.applicationId.toString()))];
  const apps = await ApplicationModel.find({ _id: { $in: appIds } }).select('jobId').lean();
  const jobs = await JobModel.find({ _id: { $in: apps.map((a) => a.jobId) } }).select('title').lean();
  const jobTitle = new Map(jobs.map((j) => [String(j._id), j.title as string]));
  const appJob = new Map(apps.map((a) => [String(a._id), jobTitle.get(a.jobId.toString()) ?? null]));
  return rows.map((r) => ({ ...toTask(r), jobTitle: appJob.get(r.applicationId.toString()) ?? null }));
}

export interface PublicReview {
  month: string;
  punctuality: number;
  quality: number;
  attitude: number;
  notes: string;
  updatedAt: string;
}

export async function getReview(employerId: string, applicationId: string, month: string): Promise<PublicReview | null> {
  await ownedHire(employerId, applicationId);
  const r = await WorkerReviewModel.findOne({ applicationId: new Types.ObjectId(applicationId), month }).lean();
  return r
    ? { month: r.month, punctuality: r.punctuality, quality: r.quality, attitude: r.attitude, notes: r.notes, updatedAt: r.updatedAt.toISOString() }
    : null;
}

export async function listReviews(employerId: string, applicationId: string): Promise<PublicReview[]> {
  await ownedHire(employerId, applicationId);
  const rows = await WorkerReviewModel.find({ applicationId: new Types.ObjectId(applicationId) })
    .sort({ month: -1 })
    .limit(24)
    .lean();
  return rows.map((r) => ({
    month: r.month, punctuality: r.punctuality, quality: r.quality, attitude: r.attitude, notes: r.notes,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function saveReview(
  employerId: string,
  applicationId: string,
  input: { month: string; punctuality: number; quality: number; attitude: number; notes?: string },
): Promise<PublicReview> {
  const app = await ownedHire(employerId, applicationId);
  const r = await WorkerReviewModel.findOneAndUpdate(
    { applicationId: new Types.ObjectId(applicationId), month: input.month },
    {
      $set: {
        punctuality: input.punctuality,
        quality: input.quality,
        attitude: input.attitude,
        notes: input.notes ?? '',
      },
      $setOnInsert: { employerId: app.employerId, seekerId: app.seekerId },
    },
    { upsert: true, new: true },
  ).lean();
  return { month: r!.month, punctuality: r!.punctuality, quality: r!.quality, attitude: r!.attitude, notes: r!.notes, updatedAt: r!.updatedAt.toISOString() };
}
