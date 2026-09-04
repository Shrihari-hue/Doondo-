import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { quickWorkRequests } from '@/db/schema';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import { env } from '@/config/env';
import { reportCustomerNoShow, runWorkerNoShowSweep } from './quickWorkNoShow.service';

describe('quickWorkNoShow.service', () => {
  const userIds: string[] = [];
  const quickWorkRequestIds: string[] = [];
  const serviceIds: string[] = [];
  const categoryIds: string[] = [];

  beforeAll(() => {
    ensureDb();
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, quickWorkRequestIds, serviceIds, categoryIds });
    await closeDb();
  });

  async function acceptedRequest(acceptedMinutesAgo: number) {
    const employer = await createTestUser('employer');
    const worker = await createTestUser('seeker');
    userIds.push(employer.id, worker.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    const row = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'accepted',
      matchedWorkerId: worker.id,
      acceptedAt: new Date(Date.now() - acceptedMinutesAgo * 60_000),
    });
    quickWorkRequestIds.push(row.id);
    return { employer, worker, requestId: row.id };
  }

  describe('runWorkerNoShowSweep', () => {
    it('does not flag a worker still comfortably inside the grace period', async () => {
      const { requestId } = await acceptedRequest(2); // way under the default 20-min grace
      await runWorkerNoShowSweep();
      const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
      expect(row?.noShowBy).toBeNull();
    });

    it('flags a worker who has not arrived after the grace period elapses', async () => {
      const graceMinutes = env.QUICK_WORK_ARRIVAL_GRACE_MINUTES;
      const { requestId } = await acceptedRequest(graceMinutes + 5);
      await runWorkerNoShowSweep();
      const [row] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
      expect(row?.noShowBy).toBe('worker');
      expect(row?.noShowAt).not.toBeNull();
      // Status is untouched — no-show is metadata layered on the existing
      // state machine, not a new terminal status.
      expect(row?.status).toBe('accepted');
    });

    it('does NOT flag a worker who accepted a scheduled job well before its start time', async () => {
      // Regression: anchoring the deadline on `acceptedAt` alone flagged a
      // worker who booked a scheduled job hours ahead as a no-show minutes
      // later, while they were still perfectly on time. The deadline is
      // measured from COALESCE(scheduledAt, acceptedAt).
      const employer = await createTestUser('employer');
      const worker = await createTestUser('seeker');
      userIds.push(employer.id, worker.id);
      const { categoryId, serviceId } = await createTestService();
      categoryIds.push(categoryId);
      serviceIds.push(serviceId);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        isImmediate: false,
        // Accepted 3 hours ago (way past the grace period)…
        acceptedAt: new Date(Date.now() - 3 * 60 * 60_000),
        // …for a job that doesn't start for another 3 hours.
        scheduledAt: new Date(Date.now() + 3 * 60 * 60_000),
        matchedWorkerId: worker.id,
      });
      quickWorkRequestIds.push(row.id);

      await runWorkerNoShowSweep();
      const [after] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(after?.noShowBy).toBeNull();
    });

    it('flags a scheduled job once its own start time is past the grace period', async () => {
      const employer = await createTestUser('employer');
      const worker = await createTestUser('seeker');
      userIds.push(employer.id, worker.id);
      const { categoryId, serviceId } = await createTestService();
      categoryIds.push(categoryId);
      serviceIds.push(serviceId);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        isImmediate: false,
        acceptedAt: new Date(Date.now() - 5 * 60 * 60_000),
        scheduledAt: new Date(Date.now() - (env.QUICK_WORK_ARRIVAL_GRACE_MINUTES + 5) * 60_000),
        matchedWorkerId: worker.id,
      });
      quickWorkRequestIds.push(row.id);

      await runWorkerNoShowSweep();
      const [after] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(after?.noShowBy).toBe('worker');
      expect(after?.noShowReason).toContain('scheduled start time');
    });

    it('is idempotent — a second sweep tick does not re-flag or overwrite the reason', async () => {
      const graceMinutes = env.QUICK_WORK_ARRIVAL_GRACE_MINUTES;
      const { requestId } = await acceptedRequest(graceMinutes + 5);
      await runWorkerNoShowSweep();
      const [first] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
      await runWorkerNoShowSweep();
      const [second] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
      expect(second?.noShowAt?.getTime()).toBe(first?.noShowAt?.getTime());
    });
  });

  describe('reportCustomerNoShow', () => {
    async function arrivedRequest(arrivedMinutesAgo: number) {
      const employer = await createTestUser('employer');
      const worker = await createTestUser('seeker');
      userIds.push(employer.id, worker.id);
      const { categoryId, serviceId } = await createTestService();
      categoryIds.push(categoryId);
      serviceIds.push(serviceId);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'arrived',
        matchedWorkerId: worker.id,
        acceptedAt: new Date(Date.now() - (arrivedMinutesAgo + 5) * 60_000),
        arrivedAt: new Date(Date.now() - arrivedMinutesAgo * 60_000),
      });
      quickWorkRequestIds.push(row.id);
      return { worker, requestId: row.id };
    }

    it('rejects reporting before the minimum wait since arrival has elapsed', async () => {
      const { worker, requestId } = await arrivedRequest(1); // just arrived
      await expect(reportCustomerNoShow(requestId, worker.id, 'not responding')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects reporting when the request is not in the arrived status', async () => {
      const employer = await createTestUser('employer');
      const worker = await createTestUser('seeker');
      userIds.push(employer.id, worker.id);
      const { categoryId, serviceId } = await createTestService();
      categoryIds.push(categoryId);
      serviceIds.push(serviceId);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        matchedWorkerId: worker.id,
      });
      quickWorkRequestIds.push(row.id);
      await expect(reportCustomerNoShow(row.id, worker.id, 'not responding')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('rejects a worker who is not the matched worker on the request', async () => {
      const { requestId } = await arrivedRequest(env.QUICK_WORK_CUSTOMER_NOSHOW_MIN_WAIT_MINUTES + 2);
      const impostor = await createTestUser('seeker');
      userIds.push(impostor.id);
      await expect(reportCustomerNoShow(requestId, impostor.id, 'not responding')).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('succeeds once the minimum wait has passed, and cannot be reported twice', async () => {
      const { worker, requestId } = await arrivedRequest(env.QUICK_WORK_CUSTOMER_NOSHOW_MIN_WAIT_MINUTES + 2);
      const updated = await reportCustomerNoShow(requestId, worker.id, 'Customer is not answering the door.');
      expect(updated.noShowBy).toBe('employer');

      await expect(reportCustomerNoShow(requestId, worker.id, 'again')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });
});
