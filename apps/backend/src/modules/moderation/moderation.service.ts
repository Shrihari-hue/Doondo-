/** UUID-native moderation block-list access. User reports remain legacy. */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { blockedWorkers } from '@/db/schema';
import { UserReportModel, type ReportReason } from './userReport.model';
import { Types } from 'mongoose';

export interface BlockedWorkerView { workerId: string; createdAt: string; }

export async function blockWorker(employerId: string, workerId: string): Promise<void> {
  await getDb().insert(blockedWorkers).values({ employerId, workerId }).onConflictDoNothing();
}

export async function unblockWorker(employerId: string, workerId: string): Promise<void> {
  await getDb().delete(blockedWorkers).where(and(eq(blockedWorkers.employerId, employerId), eq(blockedWorkers.workerId, workerId)));
}

export async function listBlocked(employerId: string): Promise<BlockedWorkerView[]> {
  const rows = await getDb().select().from(blockedWorkers).where(eq(blockedWorkers.employerId, employerId)).orderBy(desc(blockedWorkers.createdAt));
  return rows.map((row) => ({ workerId: row.workerId, createdAt: row.createdAt.toISOString() }));
}

export async function isBlocked(employerId: string, workerId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: blockedWorkers.id }).from(blockedWorkers).where(and(eq(blockedWorkers.employerId, employerId), eq(blockedWorkers.workerId, workerId))).limit(1);
  return Boolean(row);
}

/** Legacy user-report persistence is intentionally outside the atomic boundary. */
export async function reportUser(input: { reporterId: string; reportedUserId: string; reason: ReportReason; note?: string }): Promise<void> {
  await UserReportModel.create({ reporterId: new Types.ObjectId(input.reporterId), reportedUserId: new Types.ObjectId(input.reportedUserId), reason: input.reason, note: (input.note ?? '').slice(0, 1000) });
}
