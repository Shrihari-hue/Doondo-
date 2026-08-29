import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { buildApp } from '@/server';
import { cleanupTestData, closeDb, ensureDb } from '@/test/helpers';

describe('auth routes (supertest)', () => {
  const userIds: string[] = [];
  let app: ReturnType<typeof buildApp>['app'];

  beforeAll(() => {
    ensureDb();
    app = buildApp().app;
  });

  afterAll(async () => {
    await cleanupTestData({ userIds });
    await closeDb();
  });

  function freshEmail(): string {
    return `route-test-${randomUUID()}@doondo-test.dev`;
  }

  it('POST /api/v1/auth/register creates a user', async () => {
    const email = freshEmail();
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Route Seeker',
      email,
      password: 'Secret123',
      role: 'seeker',
      phone: '+919876511001',
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    userIds.push(res.body.data.user.id);
  });

  it('POST /api/v1/auth/register rejects a weak password with the validation envelope', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Weak Password',
      email: freshEmail(),
      password: 'short',
      role: 'seeker',
      phone: '+919876511002',
    });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /api/v1/auth/login authenticates and GET /api/v1/auth/me works with the token', async () => {
    const email = freshEmail();
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Route Login',
      email,
      password: 'Secret123',
      role: 'seeker',
      phone: '+919876511003',
    });
    userIds.push(registerRes.body.data.user.id);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Secret123' });
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.tokens.accessToken as string;

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(email);
  });

  it('GET /api/v1/auth/me without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('POST /api/v1/auth/login with the wrong password returns 401', async () => {
    const email = freshEmail();
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Route Wrong Pass',
      email,
      password: 'Secret123',
      role: 'seeker',
      phone: '+919876511004',
    });
    userIds.push(registerRes.body.data.user.id);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'NopeNope1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh rotates the token pair', async () => {
    const email = freshEmail();
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Route Refresh',
      email,
      password: 'Secret123',
      role: 'seeker',
      phone: '+919876511005',
    });
    userIds.push(registerRes.body.data.user.id);
    const refreshToken = registerRes.body.data.tokens.refreshToken as string;

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken);
  });
});
