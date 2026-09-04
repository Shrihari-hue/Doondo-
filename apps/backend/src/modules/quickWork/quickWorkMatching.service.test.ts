import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { quickWorkRequests, users } from '@/db/schema';
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
import * as matchingService from './quickWorkMatching.service';

// A fixed Bengaluru point — matches createTestQuickWorkRequest's default geo,
// well inside the matching engine's initial 5km radius.
const LAT = 12.9716;
const LNG = 77.5946;

describe('quickWorkMatching.service', () => {
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

  async function employerAndService(overrides: { requiresVerification?: boolean } = {}) {
    const employer = await createTestUser('employer');
    userIds.push(employer.id);
    const { categoryId, serviceId } = await createTestService(overrides);
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    return { employer, serviceId };
  }

  async function eligibleWorker(serviceId: string, opts: { isVerified?: boolean } = {}) {
    const worker = await createTestUser('seeker');
    userIds.push(worker.id);
    if (opts.isVerified) {
      await getDb().update(users).set({ isVerified: true }).where(eq(users.id, worker.id));
    }
    await workerServiceProfileService.setMine(worker.id, [serviceId]);
    await availabilityService.publish({ seekerId: worker.id, durationMinutes: 60, lat: LAT, lng: LNG });
    return worker;
  }

  async function requestRow(employerId: string, serviceId: string) {
    const row = await createTestQuickWorkRequest(employerId, serviceId, { status: 'posted' });
    quickWorkRequestIds.push(row.id);
    return row;
  }

  it('finds an eligible nearby worker and fans out an offer', async () => {
    const { employer, serviceId } = await employerAndService();
    const worker = await eligibleWorker(serviceId);
    const row = await requestRow(employer.id, serviceId);

    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('offered');

    const { quickWorkOffers } = await import('@/db/schema');
    const offers = await getDb().select().from(quickWorkOffers).where(eq(quickWorkOffers.requestId, row.id));
    expect(offers.some((o) => o.workerId === worker.id)).toBe(true);
  });

  it('reaches no_worker_found when nobody has opted into the service', async () => {
    const { employer, serviceId } = await employerAndService();
    const row = await requestRow(employer.id, serviceId);

    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('no_worker_found');
  });

  it('excludes an unverified worker from a service that requires verification', async () => {
    const { employer, serviceId } = await employerAndService({ requiresVerification: true });
    await eligibleWorker(serviceId, { isVerified: false });
    const row = await requestRow(employer.id, serviceId);

    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('no_worker_found');
  });

  it('matches a verified worker for a service that requires verification', async () => {
    const { employer, serviceId } = await employerAndService({ requiresVerification: true });
    await eligibleWorker(serviceId, { isVerified: true });
    const row = await requestRow(employer.id, serviceId);

    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('offered');
  });

  it('excludes a worker already busy on another active Quick Work job', async () => {
    const { employer, serviceId } = await employerAndService();
    const worker = await eligibleWorker(serviceId);

    // Worker is mid-way through a different Quick Work job right now.
    const busyJob = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'in_progress',
      matchedWorkerId: worker.id,
    });
    quickWorkRequestIds.push(busyJob.id);

    const row = await requestRow(employer.id, serviceId);
    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('no_worker_found');
  });

  it('excludes a paused worker from Quick Work matching', async () => {
    const { employer, serviceId } = await employerAndService();
    const worker = await eligibleWorker(serviceId);
    await availabilityService.setPaused(worker.id, true);

    const row = await requestRow(employer.id, serviceId);
    await matchingService.startMatching(row.id);

    const [updated] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, row.id));
    expect(updated?.status).toBe('no_worker_found');
  });
});
