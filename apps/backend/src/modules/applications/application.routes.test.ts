import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '@/server';
import { signAccessToken } from '@/lib/jwt';
import {
  cleanupTestData,
  closeDb,
  createTestJob,
  createTestUser,
  ensureDb,
} from '@/test/helpers';

describe('application routes (supertest)', () => {
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const applicationIds: string[] = [];
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    ensureDb();
    app = buildApp().app;
  });

  afterAll(async () => {
    await cleanupTestData({ userIds, jobIds, applicationIds });
    await closeDb();
  });

  function bearer(userId: string, role: 'seeker' | 'employer') {
    return `Bearer ${signAccessToken({ sub: userId, role })}`;
  }

  it('POST /api/v1/jobs/:id/apply then GET /api/v1/applications/me lists it, and the employer can hire it', async () => {
    const employer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);

    const applyRes = await request(app)
      .post(`/api/v1/jobs/${job.id}/apply`)
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({ coverNote: 'I can start tomorrow.' });
    expect(applyRes.status).toBe(201);
    expect(applyRes.body.data.application.status).toBe('pending');
    const applicationId = applyRes.body.data.application.id as string;
    applicationIds.push(applicationId);

    const listRes = await request(app)
      .get('/api/v1/applications/me')
      .set('Authorization', bearer(seeker.id, 'seeker'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.applications.some((a: { id: string }) => a.id === applicationId)).toBe(
      true,
    );

    const shortlistRes = await request(app)
      .post(`/api/v1/applications/${applicationId}/shortlist`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(shortlistRes.status).toBe(200);
    expect(shortlistRes.body.data.application.status).toBe('shortlisted');

    const hireRes = await request(app)
      .post(`/api/v1/applications/${applicationId}/hire`)
      .set('Authorization', bearer(employer.id, 'employer'));
    expect(hireRes.status).toBe(200);
    expect(hireRes.body.data.application.status).toBe('hired');
  });

  it('POST /api/v1/jobs/:id/apply as an employer is rejected by role, not by validation', async () => {
    const employer = await createTestUser('employer');
    userIds.push(employer.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);

    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/apply`)
      .set('Authorization', bearer(employer.id, 'employer'))
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('POST /api/v1/applications/:id/shortlist by a non-owning employer returns 403', async () => {
    const employer = await createTestUser('employer');
    const otherEmployer = await createTestUser('employer');
    const seeker = await createTestUser('seeker');
    userIds.push(employer.id, otherEmployer.id, seeker.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);

    const applyRes = await request(app)
      .post(`/api/v1/jobs/${job.id}/apply`)
      .set('Authorization', bearer(seeker.id, 'seeker'))
      .send({});
    const applicationId = applyRes.body.data.application.id as string;
    applicationIds.push(applicationId);

    const res = await request(app)
      .post(`/api/v1/applications/${applicationId}/shortlist`)
      .set('Authorization', bearer(otherEmployer.id, 'employer'));
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/jobs/:id/apply without auth returns 401', async () => {
    const employer = await createTestUser('employer');
    userIds.push(employer.id);
    const job = await createTestJob(employer.id);
    jobIds.push(job.id);

    const res = await request(app).post(`/api/v1/jobs/${job.id}/apply`).send({});
    expect(res.status).toBe(401);
  });
});
