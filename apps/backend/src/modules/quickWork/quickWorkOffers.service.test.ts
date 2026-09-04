import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { quickWorkOffers, quickWorkRequests } from '@/db/schema';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import * as offersService from './quickWorkOffers.service';

describe('quickWorkOffers.service', () => {
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

  async function offeredRequestWithTwoCandidates() {
    const employer = await createTestUser('employer');
    const workerA = await createTestUser('seeker');
    const workerB = await createTestUser('seeker');
    userIds.push(employer.id, workerA.id, workerB.id);
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);

    const row = await createTestQuickWorkRequest(employer.id, serviceId, { status: 'offered' });
    quickWorkRequestIds.push(row.id);

    const expiresAt = new Date(Date.now() + 90_000);
    const [offerA] = await getDb()
      .insert(quickWorkOffers)
      .values({ requestId: row.id, workerId: workerA.id, status: 'offered', expiresAt })
      .returning();
    const [offerB] = await getDb()
      .insert(quickWorkOffers)
      .values({ requestId: row.id, workerId: workerB.id, status: 'offered', expiresAt })
      .returning();

    return { employer, workerA, workerB, requestId: row.id, offerAId: offerA!.id, offerBId: offerB!.id };
  }

  it('accepting an offer moves the request to accepted and supersedes sibling offers', async () => {
    const { workerA, requestId, offerAId, offerBId } = await offeredRequestWithTwoCandidates();

    const accepted = await offersService.acceptOffer(offerAId, workerA.id);
    expect(accepted.status).toBe('accepted');
    expect(accepted.matchedWorkerId).toBe(workerA.id);

    const [siblingOffer] = await getDb().select().from(quickWorkOffers).where(eq(quickWorkOffers.id, offerBId));
    expect(siblingOffer?.status).toBe('superseded');

    const [requestRow] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
    expect(requestRow?.status).toBe('accepted');
  });

  it('a second worker trying to accept after the first wins gets QUICK_WORK_ALREADY_TAKEN', async () => {
    const { workerA, workerB, offerAId, offerBId } = await offeredRequestWithTwoCandidates();

    await offersService.acceptOffer(offerAId, workerA.id);
    await expect(offersService.acceptOffer(offerBId, workerB.id)).rejects.toMatchObject({
      code: 'QUICK_WORK_ALREADY_TAKEN',
    });
  });

  it('accepting the same offer twice (double-tap) is rejected the second time', async () => {
    const { workerA, offerAId } = await offeredRequestWithTwoCandidates();

    await offersService.acceptOffer(offerAId, workerA.id);
    await expect(offersService.acceptOffer(offerAId, workerA.id)).rejects.toMatchObject({
      code: 'QUICK_WORK_ALREADY_TAKEN',
    });
  });

  it('declining an offer frees it without affecting the request', async () => {
    const { workerA, requestId, offerAId } = await offeredRequestWithTwoCandidates();

    await offersService.declineOffer(offerAId, workerA.id);
    const [offer] = await getDb().select().from(quickWorkOffers).where(eq(quickWorkOffers.id, offerAId));
    expect(offer?.status).toBe('declined');

    const [requestRow] = await getDb().select().from(quickWorkRequests).where(eq(quickWorkRequests.id, requestId));
    expect(requestRow?.status).toBe('offered'); // unaffected — the sibling offer is still live
  });

  it('two truly concurrent accept attempts on different offers of the same request — only one wins', async () => {
    const { workerA, workerB, offerAId, offerBId } = await offeredRequestWithTwoCandidates();

    const results = await Promise.allSettled([
      offersService.acceptOffer(offerAId, workerA.id),
      offersService.acceptOffer(offerBId, workerB.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
