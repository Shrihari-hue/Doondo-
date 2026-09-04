/** UUID-native moderation block-list + user-report access. */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { blockedWorkers, userReports, type UserReportReason } from '@/db/schema';

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

/** Bulk form of isBlocked — every worker id this employer has blocked, for filtering a candidate pool (e.g. Quick Work matching). */
export async function listBlockedWorkerIds(employerId: string): Promise<Set<string>> {
  const rows = await getDb().select({ workerId: blockedWorkers.workerId }).from(blockedWorkers).where(eq(blockedWorkers.employerId, employerId));
  return new Set(rows.map((r) => r.workerId));
}

export async function reportUser(input: { reporterId: string; reportedUserId: string; reason: UserReportReason; note?: string }): Promise<void> {
  await getDb().insert(userReports).values({
    reporterId: input.reporterId,
    reportedUserId: input.reportedUserId,
    reason: input.reason,
    note: (input.note ?? '').slice(0, 1000),
  });
}
