import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';
import * as quickWorkService from './quickWork.service';

describe('quickWork.service', () => {
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

  describe('post()', () => {
    it('rejects posting a draft missing serviceId/location/timing with QUICK_WORK_MISSING_FIELDS', async () => {
      const { employer } = await employerAndService();
      const draft = await quickWorkService.createDraft(employer.id, {});
      quickWorkRequestIds.push(draft.id);
      await expect(quickWorkService.post(draft.id, employer.id)).rejects.toMatchObject({
        code: 'QUICK_WORK_MISSING_FIELDS',
      });
    });

    it('posts a fully-filled draft and starts matching for an immediate request', async () => {
      const { employer, serviceId } = await employerAndService();
      const draft = await quickWorkService.createDraft(employer.id, {
        serviceId,
        lat: 12.9716,
        lng: 77.5946,
        isImmediate: true,
      });
      quickWorkRequestIds.push(draft.id);
      const posted = await quickWorkService.post(draft.id, employer.id);
      expect(posted.status).toBe('posted');
      expect(posted.postedAt).not.toBeNull();
    });

    it('rejects a non-owner posting someone else\'s draft', async () => {
      const { employer, serviceId } = await employerAndService();
      const stranger = await createTestUser('employer');
      userIds.push(stranger.id);
      const draft = await quickWorkService.createDraft(employer.id, { serviceId, lat: 12.9716, lng: 77.5946 });
      quickWorkRequestIds.push(draft.id);
      await expect(quickWorkService.post(draft.id, stranger.id)).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
    });
  });

  describe('draft editing', () => {
    it('rejects editing a draft that has already moved past DRAFT', async () => {
      const { employer, serviceId } = await employerAndService();
      const draft = await quickWorkService.createDraft(employer.id, { serviceId, lat: 12.9716, lng: 77.5946 });
      quickWorkRequestIds.push(draft.id);
      await quickWorkService.post(draft.id, employer.id);
      await expect(
        quickWorkService.updateDraft(draft.id, employer.id, { title: 'changed' }),
      ).rejects.toMatchObject({ code: 'QUICK_WORK_INVALID_TRANSITION' });
    });
  });

  describe('worker execution lifecycle', () => {
    async function acceptedRequest() {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        matchedWorkerId: worker.id,
        acceptedAt: new Date(),
        estimatedPrice: 50000,
      });
      quickWorkRequestIds.push(row.id);
      return { employer, worker, requestId: row.id };
    }

    it('walks accepted -> arriving -> arrived -> in_progress -> completed -> payment_pending', async () => {
      const { worker, requestId } = await acceptedRequest();

      const arriving = await quickWorkService.markArriving(requestId, worker.id);
      expect(arriving.status).toBe('arriving');

      const arrived = await quickWorkService.markArrived(requestId, worker.id);
      expect(arrived.status).toBe('arrived');

      const started = await quickWorkService.startWork(requestId, worker.id);
      expect(started.status).toBe('in_progress');

      const completed = await quickWorkService.completeWork(requestId, worker.id, {
        completionNotes: 'Fixed it',
        finalPrice: 50000,
      });
      expect(completed.status).toBe('payment_pending');
      expect(completed.finalPrice).toBe(50000);
      expect(completed.priceApprovedAt).toBeNull();
    });

    it('rejects an out-of-order transition (arrived before accepted->arriving/arrived path)', async () => {
      const { worker, requestId } = await acceptedRequest();
      // Never called markArriving/markArrived — jumping straight to start is invalid.
      await expect(quickWorkService.startWork(requestId, worker.id)).rejects.toMatchObject({
        code: 'QUICK_WORK_INVALID_TRANSITION',
      });
    });

    it('rejects a duplicate transition (calling arrived twice)', async () => {
      const { worker, requestId } = await acceptedRequest();
      await quickWorkService.markArrived(requestId, worker.id);
      await expect(quickWorkService.markArrived(requestId, worker.id)).rejects.toMatchObject({
        code: 'QUICK_WORK_INVALID_TRANSITION',
      });
    });

    it('rejects a transition attempted by someone other than the matched worker', async () => {
      const { requestId } = await acceptedRequest();
      const impostor = await createTestUser('seeker');
      userIds.push(impostor.id);
      await expect(quickWorkService.markArrived(requestId, impostor.id)).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('rejects an implausible final price (more than 5x the estimate)', async () => {
      const { worker, requestId } = await acceptedRequest();
      await quickWorkService.markArrived(requestId, worker.id);
      await quickWorkService.startWork(requestId, worker.id);
      await expect(
        quickWorkService.completeWork(requestId, worker.id, { finalPrice: 50000 * 10 }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('price approval', () => {
    async function paymentPendingRequest() {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'payment_pending',
        matchedWorkerId: worker.id,
        finalPrice: 30000,
      });
      quickWorkRequestIds.push(row.id);
      return { employer, worker, requestId: row.id };
    }

    it('lets the employer approve the price', async () => {
      const { employer, requestId } = await paymentPendingRequest();
      const approved = await quickWorkService.approvePrice(requestId, employer.id);
      expect(approved.priceApprovedAt).not.toBeNull();
    });

    it('is idempotent — approving twice does not error', async () => {
      const { employer, requestId } = await paymentPendingRequest();
      await quickWorkService.approvePrice(requestId, employer.id);
      const second = await quickWorkService.approvePrice(requestId, employer.id);
      expect(second.priceApprovedAt).not.toBeNull();
    });

    it('rejects approval from the worker (not the employer)', async () => {
      const { worker, requestId } = await paymentPendingRequest();
      await expect(quickWorkService.approvePrice(requestId, worker.id)).rejects.toMatchObject({
        code: 'AUTH_FORBIDDEN',
      });
    });

    it('rejects approval when the request is not in payment_pending', async () => {
      const { employer, serviceId } = await employerAndService();
      const row = await createTestQuickWorkRequest(employer.id, serviceId, { status: 'posted' });
      quickWorkRequestIds.push(row.id);
      await expect(quickWorkService.approvePrice(row.id, employer.id)).rejects.toMatchObject({
        code: 'QUICK_WORK_INVALID_TRANSITION',
      });
    });
  });

  describe('cancellation', () => {
    it('allows a free cancel before acceptance (no reason required)', async () => {
      const { employer, serviceId } = await employerAndService();
      const row = await createTestQuickWorkRequest(employer.id, serviceId, { status: 'posted' });
      quickWorkRequestIds.push(row.id);
      const cancelled = await quickWorkService.cancel(row.id, employer.id, null);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledBy).toBe('employer');
    });

    it('requires a reason to cancel once accepted', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'accepted',
        matchedWorkerId: worker.id,
        acceptedAt: new Date(),
      });
      quickWorkRequestIds.push(row.id);
      await expect(quickWorkService.cancel(row.id, employer.id, null)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      const cancelled = await quickWorkService.cancel(row.id, employer.id, 'Changed my mind');
      expect(cancelled.status).toBe('cancelled');
    });

    it('refuses a plain cancel once work is in progress', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const row = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'in_progress',
        matchedWorkerId: worker.id,
      });
      quickWorkRequestIds.push(row.id);
      await expect(quickWorkService.cancel(row.id, employer.id, 'reason')).rejects.toMatchObject({
        code: 'QUICK_WORK_INVALID_TRANSITION',
      });
    });
  });

  describe('dispute', () => {
    it('allows either party to raise a dispute once payment is pending, but not before', async () => {
      const { employer, serviceId } = await employerAndService();
      const worker = await createTestUser('seeker');
      userIds.push(worker.id);
      const inProgress = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'in_progress',
        matchedWorkerId: worker.id,
      });
      quickWorkRequestIds.push(inProgress.id);
      await expect(
        quickWorkService.raiseDispute(inProgress.id, employer.id, 'too early'),
      ).rejects.toMatchObject({ code: 'QUICK_WORK_INVALID_TRANSITION' });

      const pendingPayment = await createTestQuickWorkRequest(employer.id, serviceId, {
        status: 'payment_pending',
        matchedWorkerId: worker.id,
        finalPrice: 20000,
      });
      quickWorkRequestIds.push(pendingPayment.id);
      const disputed = await quickWorkService.raiseDispute(pendingPayment.id, worker.id, 'Price seems wrong');
      expect(disputed.status).toBe('disputed');
      expect(disputed.disputeReason).toBe('Price seems wrong');
    });
  });
});
