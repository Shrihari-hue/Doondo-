/**
 * Doondo for Women — peer verification + privacy settings.
 *
 *   - Women's-Mode workers who were hired are asked (once per hire, 2+ days
 *     after hire) whether the workplace was safe and which of the
 *     employer's declared signals held true.
 *   - Employer summary: "confirmed safe by N of M women who worked here",
 *     plus per-signal confirmation counts. Shown only once there are at
 *     least MIN_REPORTS answers, so one report can't identify a worker.
 */
import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { ApplicationModel } from '@/modules/applications/application.model';
import { JobModel } from '@/modules/jobs/job.model';
import { UserModel } from '@/modules/users/user.model';
import { computeWomenSafety, type WomenSafetySignal } from '@/modules/jobs/womenSafety';
import { WomenSafetyReportModel } from './womenSafetyReport.model';

export const MIN_REPORTS = 2;
const ASK_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export interface EmployerSafetySummary {
  employerId: string;
  reports: number;
  safe: number;
  /** null until MIN_REPORTS answers exist (anonymity floor). */
  safePercent: number | null;
  signals: Partial<Record<WomenSafetySignal, number>>;
}

export async function getPrivacy(userId: string): Promise<{ maskLocation: boolean; womenMode: boolean }> {
  const u = await UserModel.findById(userId).select('privacy').lean();
  const p = (u as { privacy?: { maskLocation?: boolean; womenMode?: boolean } } | null)?.privacy;
  return { maskLocation: Boolean(p?.maskLocation), womenMode: Boolean(p?.womenMode) };
}

export async function setPrivacy(userId: string, patch: { maskLocation?: boolean; womenMode?: boolean }) {
  const $set: Record<string, boolean> = {};
  if (typeof patch.maskLocation === 'boolean') $set['privacy.maskLocation'] = patch.maskLocation;
  if (typeof patch.womenMode === 'boolean') $set['privacy.womenMode'] = patch.womenMode;
  if (Object.keys($set).length) await UserModel.updateOne({ _id: userId }, { $set });
  return getPrivacy(userId);
}

export interface PendingSafetyQuestion {
  applicationId: string;
  jobTitle: string;
  employerName: string;
  /** The signals the employer declared — the worker confirms which held. */
  declared: WomenSafetySignal[];
}

export async function listPending(seekerId: string): Promise<PendingSafetyQuestion[]> {
  const { womenMode } = await getPrivacy(seekerId);
  if (!womenMode) return [];
  const apps = await ApplicationModel.find({
    seekerId: new Types.ObjectId(seekerId),
    status: 'hired',
    hiredAt: { $lte: new Date(Date.now() - ASK_AFTER_MS) },
  })
    .select('_id jobId employerId')
    .sort({ hiredAt: -1 })
    .limit(10)
    .lean();
  if (apps.length === 0) return [];
  const answered = new Set(
    (await WomenSafetyReportModel.find({ applicationId: { $in: apps.map((a) => a._id) } }).select('applicationId').lean()).map((r) =>
      r.applicationId.toString(),
    ),
  );
  const open = apps.filter((a) => !answered.has(a._id.toString()));
  if (open.length === 0) return [];
  const [jobs, employers] = await Promise.all([
    JobModel.find({ _id: { $in: open.map((a) => a.jobId) } }).select('title womenSafety').lean(),
    UserModel.find({ _id: { $in: open.map((a) => a.employerId) } }).select('name companyName').lean(),
  ]);
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const empById = new Map(employers.map((e) => [String(e._id), (e as { companyName?: string | null; name?: string }).companyName || (e as { name?: string }).name || 'Employer']));
  return open.slice(0, 3).map((a) => {
    const job = jobById.get(a.jobId.toString()) as { title?: string; womenSafety?: unknown } | undefined;
    return {
      applicationId: a._id.toString(),
      jobTitle: job?.title ?? 'Job',
      employerName: empById.get(a.employerId.toString()) ?? 'Employer',
      declared: computeWomenSafety(job?.womenSafety as never).signals,
    };
  });
}

export async function submitReport(
  seekerId: string,
  input: { applicationId: string; safe: boolean; confirmed: WomenSafetySignal[] },
): Promise<void> {
  if (!Types.ObjectId.isValid(input.applicationId)) throw errors.applicationNotFound();
  const app = await ApplicationModel.findOne({ _id: input.applicationId, seekerId: new Types.ObjectId(seekerId), status: 'hired' })
    .select('jobId employerId')
    .lean();
  if (!app) throw errors.applicationNotFound();
  try {
    await WomenSafetyReportModel.create({
      employerId: app.employerId,
      jobId: app.jobId,
      applicationId: new Types.ObjectId(input.applicationId),
      seekerId: new Types.ObjectId(seekerId),
      safe: input.safe,
      confirmed: [...new Set(input.confirmed)],
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw errors.conflict('You already answered for this job.');
    throw err;
  }
}

export async function employerSummary(employerId: string): Promise<EmployerSafetySummary> {
  if (!Types.ObjectId.isValid(employerId)) throw errors.notFound('Employer not found.');
  const rows = await WomenSafetyReportModel.find({ employerId: new Types.ObjectId(employerId) }).select('safe confirmed').lean();
  const safe = rows.filter((r) => r.safe).length;
  const signals: Partial<Record<WomenSafetySignal, number>> = {};
  if (rows.length >= MIN_REPORTS) {
    for (const r of rows) for (const s of r.confirmed) signals[s] = (signals[s] ?? 0) + 1;
  }
  return {
    employerId,
    reports: rows.length,
    safe: rows.length >= MIN_REPORTS ? safe : 0,
    safePercent: rows.length >= MIN_REPORTS ? Math.round((safe / rows.length) * 100) : null,
    signals,
  };
}
