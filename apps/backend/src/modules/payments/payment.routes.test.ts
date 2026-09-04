import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { buildApp } from '@/server';
import { signAccessToken } from '@/lib/jwt';
import { getDb } from '@/db/client';
import { users, walletTransactions } from '@/db/schema';
import {
  cleanupTestData,
  closeDb,
  createTestQuickWorkRequest,
  createTestService,
  createTestUser,
  ensureDb,
} from '@/test/helpers';

describe('payment routes — Quick Work (supertest)', () => {
  const userIds: string[] = [];
  const quickWorkRequestIds: string[] = [];
  const serviceIds: string[] = [];
  const categoryIds: string[] = [];
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    ensureDb();
    app = buildApp().app;
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, quickWorkRequestIds, serviceIds, categoryIds });
    await closeDb();
  });

  function bearer(userId: string, role: 'seeker' | 'employer') {
    return `Bearer ${signAccessToken({ sub: userId, role })}`;
  }

  async function paymentPendingRequest(finalPrice: number) {
    const employer = await createTestUser('employer');
    const worker = await createTestUser('seeker');
    userIds.push(employer.id, worker.id);
    await getDb().update(users).set({ upiVpa: 'worker@upi' }).where(eq(users.id, worker.id));
    const { categoryId, serviceId } = await createTestService();
    categoryIds.push(categoryId);
    serviceIds.push(serviceId);
    const row = await createTestQuickWorkRequest(employer.id, serviceId, {
      status: 'payment_pending',
      matchedWorkerId: worker.id,
      finalPrice,
    });
    quickWorkRequestIds.push(row.id);
    return { employer, worker, requestId: row.id };
  }

  it('rejects creating a payment intent before the employer has approved the price', async () => {
    const { employer, requestId } = await paymentPendingRequest(35000);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', bearer(employer.id, 'employer'))
      .send({ quickWorkRequestId: requestId });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('QUICK_WORK_PRICE_NOT_APPROVED');
  });

  it('creates an intent with a server-derived amount (ignoring any client-supplied amount) once approved, and pays it', async () => {
    const { employer, worker, requestId } = await paymentPendingRequest(35000);

    const approveRes = await request(app)
      .post(`/api/v1/quick-work/requests/${requestId}/approve-price`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(approveRes.status).toBe(200);

    // Client tries to lowball the amount and redirect to itself — both
    // must be ignored; the server derives seekerId/amount from the row.
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', bearer(employer.id, 'employer'))
      .send({ quickWorkRequestId: requestId, amountPaise: 100, seekerId: employer.id });

    expect(intentRes.status).toBe(201);
    expect(intentRes.body.data.intent.amountPaise).toBe(35000);
    expect(intentRes.body.data.intent.seekerId).toBe(worker.id);

    const intentId = intentRes.body.data.intent.id as string;
    const markPaidRes = await request(app)
      .post(`/api/v1/payments/${intentId}/mark-paid`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(markPaidRes.status).toBe(200);
    expect(markPaidRes.body.data.intent.status).toBe('paid');

    // Duplicate mark-paid on the same intent must not double-credit —
    // it should fail cleanly, not silently succeed twice.
    const dupRes = await request(app)
      .post(`/api/v1/payments/${intentId}/mark-paid`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(dupRes.status).toBe(409);
  });

  it('credits the worker only once even if two intents are raised and both marked paid', async () => {
    const { employer, worker, requestId } = await paymentPendingRequest(25000);
    await request(app)
      .post(`/api/v1/quick-work/requests/${requestId}/approve-price`)
      .set('Authorization', bearer(employer.id, 'employer'));

    // Two intents raised on the same request before either is paid — the
    // status guard alone can't stop this, so the wallet's own unique index
    // has to (applicationId is NULL for Quick Work, so the Jobs-scoped
    // guard never fires; hence wallet_quick_work_payment_unique).
    const a = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', bearer(employer.id, 'employer'))
      .send({ quickWorkRequestId: requestId });
    const b = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', bearer(employer.id, 'employer'))
      .send({ quickWorkRequestId: requestId });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    await request(app)
      .post(`/api/v1/payments/${a.body.data.intent.id}/mark-paid`)
      .set('Authorization', bearer(employer.id, 'employer'));
    await request(app)
      .post(`/api/v1/payments/${b.body.data.intent.id}/mark-paid`)
      .set('Authorization', bearer(employer.id, 'employer'));

    const credits = await getDb()
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.quickWorkRequestId, requestId));
    expect(credits).toHaveLength(1);
    expect(credits[0]!.userId).toBe(worker.id);
    expect(credits[0]!.amount).toBe(25000);
  });

  it('rejects an intent request from someone other than the request\'s employer', async () => {
    const { requestId } = await paymentPendingRequest(20000);
    const stranger = await createTestUser('employer');
    userIds.push(stranger.id);

    const res = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', bearer(stranger.id, 'employer'))
      .send({ quickWorkRequestId: requestId });
    expect(res.status).toBe(403);
  });
});
