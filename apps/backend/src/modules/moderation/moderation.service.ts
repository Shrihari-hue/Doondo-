/**
 * Moderation service — employer block list + user reports.
 *
 * Block: prevents a worker from applying to that employer's jobs again
 * (enforced in the apply path via `isBlocked`). Report: files a row in the
 * trust-and-safety queue for ops to review — no automated action here.
 */

import { Types } from 'mongoose';
import { BlockedWorkerModel } from './blockedWorker.model';
import {
  UserReportModel,
  type ReportReason,
} from './userReport.model';

export interface BlockedWorkerView {
  workerId: string;
  createdAt: string;
}

export async function blockWorker(employerId: string, workerId: string): Promise<void> {
  await BlockedWorkerModel.updateOne(
    { employerId: new Types.ObjectId(employerId), workerId: new Types.ObjectId(workerId) },
    { $setOnInsert: { employerId: new Types.ObjectId(employerId), workerId: new Types.ObjectId(workerId) } },
    { upsert: true },
  );
}

export async function unblockWorker(employerId: string, workerId: string): Promise<void> {
  await BlockedWorkerModel.deleteOne({
    employerId: new Types.ObjectId(employerId),
    workerId: new Types.ObjectId(workerId),
  });
}

export async function listBlocked(employerId: string): Promise<BlockedWorkerView[]> {
  const rows = await BlockedWorkerModel.find({ employerId: new Types.ObjectId(employerId) })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((r) => ({
    workerId: (r.workerId as unknown as Types.ObjectId).toString(),
    createdAt: (r as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

/** Has this employer blocked this worker? Used by the apply guard. */
export async function isBlocked(employerId: string, workerId: string): Promise<boolean> {
  const hit = await BlockedWorkerModel.exists({
    employerId: new Types.ObjectId(employerId),
    workerId: new Types.ObjectId(workerId),
  });
  return !!hit;
}

export async function reportUser(input: {
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  note?: string;
}): Promise<void> {
  await UserReportModel.create({
    reporterId: new Types.ObjectId(input.reporterId),
    reportedUserId: new Types.ObjectId(input.reportedUserId),
    reason: input.reason,
    note: (input.note ?? '').slice(0, 1000),
  });
}
