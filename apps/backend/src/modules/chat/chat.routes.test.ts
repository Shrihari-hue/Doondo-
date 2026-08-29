import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/server';
import { signAccessToken } from '@/lib/jwt';
import {
  cleanupTestData,
  closeDb,
  createTestApplication,
  createTestJob,
  createTestUser,
  ensureDb,
} from '@/test/helpers';

describe('chat routes (supertest)', () => {
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const applicationIds: string[] = [];
  const conversationIds: string[] = [];
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    ensureDb();
    app = buildApp().app;
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, jobIds, applicationIds, conversationIds });
    await closeDb();
  });

  function bearer(userId: string, role: 'seeker' | 'employer') {
    return `Bearer ${signAccessToken({ sub: userId, role })}`;
  }

  it('POST /api/v1/conversations/from-application then send + list messages', async () => {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);
    const application = await createTestApplication(seeker.id, employer.id, job.id);
    applicationIds.push(application.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/from-application')
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({ applicationId: application.id });
    expect(startRes.status).toBe(200);
    const conversationId = startRes.body.data.conversationId as string;
    conversationIds.push(conversationId);

    const sendRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({ body: 'Hello from a test.' });
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.data.message.body).toBe('Hello from a test.');

    const listRes = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.messages).toHaveLength(1);

    const inboxRes = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(inboxRes.status).toBe(200);
    expect(
      inboxRes.body.data.conversations.some((c: { id: string }) => c.id === conversationId),
    ).toBe(true);
  });

  it('a non-participant gets 403 reading a conversation', async () => {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    const outsider = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id, outsider.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);
    const application = await createTestApplication(seeker.id, employer.id, job.id);
    applicationIds.push(application.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/from-application')
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({ applicationId: application.id });
    const conversationId = startRes.body.data.conversationId as string;
    conversationIds.push(conversationId);

    const res = await request(app)
      .get(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', bearer(outsider.id, 'seeker'));
    expect(res.status).toBe(403);
  });

  it('POST .../messages with an empty text body and no attachment fails validation', async () => {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);
    const application = await createTestApplication(seeker.id, employer.id, job.id);
    applicationIds.push(application.id);

    const startRes = await request(app)
      .post('/api/v1/conversations/from-application')
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({ applicationId: application.id });
    const conversationId = startRes.body.data.conversationId as string;
    conversationIds.push(conversationId);

    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
