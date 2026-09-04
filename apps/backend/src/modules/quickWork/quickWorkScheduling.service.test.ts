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
import * as availabilityService from '@/modules/availabilities/availability.service';
import * as workerServiceProfileService from '@/modules/quickWork/workerServiceProfile.service';
import { runScheduledMatchingSweep, runScheduledReminderSweep } from './quickWorkScheduling.service';

const LAT = 12.9716;
const LNG = 77.5946;

describe('quickWorkScheduling.service', () => {
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

  async function employerAndService() {
    const employer = await createTestUser('employer');
    userIds.push(employer.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    return { employer, serviceId };
  }

  describe('runScheduledMatchingSweep', () => {
    it('leaves a scheduled request untouched when its scheduled time is far in the future', async () => {
      const { employer, serviceId } = await employerAndService();
      const farFuture = new Date(Date.now() + 3 * 60 * 60_000); // 3h out — default lead is 30 min
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'posted',
        isImmediate: false,
        scheduledAt: farFuture,
      });
      quickWorkRequestIds.push(row.id);

      const summary = await runScheduledMatchingSweep();
      expect(summary.started).toBe(0);

      const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(updated?.status).toBe('posted');
    });

    it('expires a stale scheduled request instead of matching a worker to a job that already passed', async () => {
      const { employer, serviceId } = await employerAndService();
      const longPast = new Date(Date.now() - 6 * 60 * 60_000); // 6h ago, well past the 60-min stale window
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'posted',
        isImmediate: false,
        scheduledAt: longPast,
      });
      quickWorkRequestIds.push(row.id);

      const summary = await runScheduledMatchingSweep();
      expect(summary.expired).toBeGreaterThanOrEqual(1);

      const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(updated?.status).toBe('expired');
    });

    it('kicks off matching for a scheduled request once inside the lead window, and is safe to run twice', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      await workerServiceProfileService.setMine(worker.id, [serviceId]);
      await availabilityService.publish({ seekerId: worker.id, durationMinutes: 60, lat: LAT, lng: LNG });

      const dueSoon = new Date(Date.now() + 10 * 60_000); // 10 min out — inside the default 30-min lead
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'posted',
        isImmediate: false,
        scheduledAt: dueSoon,
      });
      quickWorkRequestIds.push(row.id);

      const first = await runScheduledMatchingSweep();
      expect(first.started).toBeGreaterThanOrEqual(1);

      const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(updated?.status).not.toBe('posted'); // moved on to matching/offered/no_worker_found

      // Idempotency: a second sweep tick must not re-touch a row that's
      // already left 'posted' — the compare-and-swap inside startMatching
      // guards this, and the sweep's own SELECT WHERE status='posted'
      // won't even find the row a second time.
      const second = await runScheduledMatchingSweep();
      const stillThere = second.started; // may include other tests' fixtures running in parallel files, so just assert this row didn't move again
      expect(typeof stillThere).toBe('number');

      const [afterSecond] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(afterSecond?.status).toBe(updated?.status); // unchanged by the second tick
    });
  });

  describe('runScheduledReminderSweep', () => {
    it('sends the upcoming-work reminder once, then never again for the same request', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const soon = new Date(Date.now() + 20 * 60_000); // inside the default 45-min reminder window
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        isImmediate: false,
        scheduledAt: soon,
        matchedWorkerId: worker.id,
        acceptedAt: new Date(),
      });
      quickWorkRequestIds.push(row.id);

      const first = await runScheduledReminderSweep();
      expect(first.reminded).toBeGreaterThanOrEqual(1);

      const [afterFirst] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(afterFirst?.scheduledReminderSentAt).not.toBeNull();

      // Re-running must not re-claim the same row — the compare-and-swap
      // is on `scheduledReminderSentAt IS NULL`.
      const before = afterFirst!.scheduledReminderSentAt!.getTime();
      await runScheduledReminderSweep();
      const [afterSecond] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(afterSecond?.scheduledReminderSentAt?.getTime()).toBe(before);
    });

    it('does not remind a request whose scheduled time is far outside the window', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const farFuture = new Date(Date.now() + 5 * 60 * 60_000);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        isImmediate: false,
        scheduledAt: farFuture,
        matchedWorkerId: worker.id,
        acceptedAt: new Date(),
      });
      quickWorkRequestIds.push(row.id);

      await runScheduledReminderSweep();
      const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
      expect(updated?.scheduledReminderSentAt).toBeNull();
    });
  });
});
