import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import * as ratingService from './rating.service';

describe('rating.service — Quick Work ratings', () => {
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

  async function paidRequest() {
    const employer = await createTestUser('employer');
    const worker = await createTestUser('seeker');
    userIds.push(employer.id, worker.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    const row = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'paid',
      matchedWorkerId: worker.id,
      finalPrice: 40000,
    });
    quickWorkRequestIds.push(row.id);
    return { employer, worker, requestId: row.id };
  }

  it('lets the employer rate the worker after payment, moving the request to rated', async () => {
    const { employer, requestId } = await paidRequest();
    const rating = await ratingService.createQuickWorkRating({
      reviewerId: employer.id,
      quickWorkRequestId: requestId,
      score: 5,
    });
    expect(rating.score).toBe(5);
    expect(rating.quickWorkRequestId).toBe(requestId);
  });

  it('rejects a duplicate rating from the same reviewer with a clean 409 CONFLICT', async () => {
    const { employer, requestId } = await paidRequest();
    await ratingService.createQuickWorkRating({ reviewerId: employer.id, quickWorkRequestId: requestId, score: 4 });

    await expect(
      ratingService.createQuickWorkRating({ reviewerId: employer.id, quickWorkRequestId: requestId, score: 2 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows both parties to rate independently — the second rating does not conflict with the first', async () => {
    const { employer, worker, requestId } = await paidRequest();
    await ratingService.createQuickWorkRating({ reviewerId: employer.id, quickWorkRequestId: requestId, score: 5 });
    const workerRating = await ratingService.createQuickWorkRating({
      reviewerId: worker.id,
      quickWorkRequestId: requestId,
      score: 4,
    });
    expect(workerRating.score).toBe(4);
  });

  it('rejects rating before payment is complete', async () => {
    const employer = await createTestUser('employer');
    const worker = await createTestUser('seeker');
    userIds.push(employer.id, worker.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    const row = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'in_progress',
      matchedWorkerId: worker.id,
    });
    quickWorkRequestIds.push(row.id);

    await expect(
      ratingService.createQuickWorkRating({ reviewerId: employer.id, quickWorkRequestId: row.id, score: 5 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a rating from someone who is not a party to the request', async () => {
    const { requestId } = await paidRequest();
    const stranger = await createTestUser('employer');
    userIds.push(stranger.id);
    await expect(
      ratingService.createQuickWorkRating({ reviewerId: stranger.id, quickWorkRequestId: requestId, score: 5 }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
