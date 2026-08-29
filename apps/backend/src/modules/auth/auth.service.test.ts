import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '@/lib/errors';
import { cleanupTestData, closeDb, ensureDb } from '@/test/helpers';
import * as authService from './auth.service';

describe('auth.service', () => {
  const userIds: string[] = [];

  beforeAll(() => {
    ensureDb();
  });

  afterAll(async () => {
    await cleanupTestData({ userIds });
    await closeDb();
  });

  function freshEmail(): string {
    return `auth-test-${randomUUID()}@doondo-test.dev`;
  }

  describe('register', () => {
    it('creates a user and returns an access + refresh token pair', async () => {
      const email = freshEmail();
      const result = await authService.register({
        name: 'Ravi Kumar',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500001',
      });
      userIds.push(result.user.id);

      expect(result.user.email).toBe(email);
      expect(result.user.role).toBe('seeker');
      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(result.tokens.refreshToken).toEqual(expect.any(String));
    });

    it('rejects a duplicate (email, role) pair with AUTH_EMAIL_TAKEN', async () => {
      const email = freshEmail();
      const first = await authService.register({
        name: 'Dup User',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500002',
      });
      userIds.push(first.user.id);

      await expect(
        authService.register({
          name: 'Dup User Again',
          email,
          password: 'Secret123',
          role: 'seeker',
          phone: '+919876500003',
        }),
      ).rejects.toMatchObject({ code: 'AUTH_EMAIL_TAKEN' });
    });

    it('allows the same email to register once per role (seeker + employer)', async () => {
      const email = freshEmail();
      const seeker = await authService.register({
        name: 'Two Hats',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500004',
      });
      userIds.push(seeker.user.id);

      const employer = await authService.register({
        name: 'Two Hats',
        email,
        password: 'Secret123',
        role: 'employer',
        phone: '+919876500005',
      });
      userIds.push(employer.user.id);

      expect(employer.user.id).not.toBe(seeker.user.id);
      // Registering the second role links the two accounts bidirectionally.
      expect(employer.user.linkedAccountIds).toContain(seeker.user.id);
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      const email = freshEmail();
      const registered = await authService.register({
        name: 'Login Happy',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500006',
      });
      userIds.push(registered.user.id);

      const result = await authService.login({ email, password: 'Secret123' });
      if ('needsRoleChoice' in result) throw new Error('unexpected role choice');
      expect(result.user.id).toBe(registered.user.id);
      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password with AUTH_INVALID_CREDENTIALS', async () => {
      const email = freshEmail();
      const registered = await authService.register({
        name: 'Login Sad',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500007',
      });
      userIds.push(registered.user.id);

      await expect(
        authService.login({ email, password: 'WrongPassword1' }),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    });

    it('rejects an unknown email the same way as a wrong password (no enumeration)', async () => {
      await expect(
        authService.login({ email: freshEmail(), password: 'WhoKnows1' }),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    });

    it('returns needsRoleChoice when one email holds both roles and none is specified', async () => {
      const email = freshEmail();
      const seeker = await authService.register({
        name: 'Multi Role',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500008',
      });
      userIds.push(seeker.user.id);
      const employer = await authService.register({
        name: 'Multi Role',
        email,
        password: 'Secret123',
        role: 'employer',
        phone: '+919876500009',
      });
      userIds.push(employer.user.id);

      const result = await authService.login({ email, password: 'Secret123' });
      expect('needsRoleChoice' in result && result.needsRoleChoice).toBe(true);
      if (!('needsRoleChoice' in result)) throw new Error('expected role choice');
      expect(result.availableRoles.sort()).toEqual(['employer', 'seeker']);

      // Submitting with the role picked resolves to that specific account.
      const resolved = await authService.login({ email, password: 'Secret123', role: 'employer' });
      if ('needsRoleChoice' in resolved) throw new Error('unexpected role choice on second call');
      expect(resolved.user.id).toBe(employer.user.id);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and keeps the access token valid', async () => {
      const email = freshEmail();
      const registered = await authService.register({
        name: 'Refresh Case',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500010',
      });
      userIds.push(registered.user.id);

      const rotated = await authService.refresh(registered.tokens.refreshToken);
      expect(rotated.accessToken).toEqual(expect.any(String));
      expect(rotated.refreshToken).not.toBe(registered.tokens.refreshToken);
    });

    it('detects reuse of an already-rotated refresh token and revokes the family', async () => {
      const email = freshEmail();
      const registered = await authService.register({
        name: 'Reuse Case',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500011',
      });
      userIds.push(registered.user.id);

      const rotated = await authService.refresh(registered.tokens.refreshToken);

      // Reusing the ORIGINAL (now-revoked) token must throw AUTH_REFRESH_REUSED
      // and burn the whole family, including the token we just rotated to —
      // which then also reads as "reuse of a revoked token" on its own next
      // use (revokedAt is what the reuse check looks at either way; the
      // family-compromise revocation doesn't get a separate error code).
      await expect(authService.refresh(registered.tokens.refreshToken)).rejects.toMatchObject({
        code: 'AUTH_REFRESH_REUSED',
      });
      await expect(authService.refresh(rotated.refreshToken)).rejects.toMatchObject({
        code: 'AUTH_REFRESH_REUSED',
      });
    });

    it('rejects a syntactically invalid refresh token', async () => {
      await expect(authService.refresh('not-a-real-jwt')).rejects.toThrow(AppError);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it can no longer be used', async () => {
      const email = freshEmail();
      const registered = await authService.register({
        name: 'Logout Case',
        email,
        password: 'Secret123',
        role: 'seeker',
        phone: '+919876500012',
      });
      userIds.push(registered.user.id);

      await authService.logout(registered.tokens.refreshToken);

      await expect(authService.refresh(registered.tokens.refreshToken)).rejects.toMatchObject({
        code: 'AUTH_REFRESH_REUSED',
      });
    });
  });
});
