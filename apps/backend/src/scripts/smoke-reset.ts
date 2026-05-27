/**
 * Smoke test for the password-reset flow.
 *
 * Boots an in-memory Mongo, injects a fake OTP provider with a known code,
 * then walks through register → login → forgot-password → verify-reset-code
 * → reset-password and asserts the security properties we actually care
 * about:
 *
 *   - the canonical phone is what lands on the user record
 *   - a valid reset token can be exchanged for a new password
 *   - logging in with the new password succeeds
 *   - logging in with the old password fails
 *   - every refresh token outstanding at reset time is revoked
 *   - the reset token can't be replayed for a second reset
 *   - a wrong OTP is rejected
 *
 * Usage:
 *   pnpm --filter @doondo/backend exec tsx src/scripts/smoke-reset.ts
 *
 * The whole run is self-contained — no local Mongo, no real Twilio, no
 * side effects on a developer machine. Safe to run any time.
 */

import './env-loader';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { errors } from '@/lib/errors';
import * as authService from '@/modules/auth/auth.service';
import {
  __setOtpProviderForTests,
  type OtpProvider,
} from '@/modules/verification/sms';

const KNOWN_CODE = '123456';
const WRONG_CODE = '000000';

// Deterministic OTP provider — `verifyOtp` accepts exactly KNOWN_CODE and
// rejects everything else with the same error real providers throw. Lets
// us exercise both the happy path and the wrong-code branch without
// touching Twilio.
const fakeProvider: OtpProvider = {
  async sendOtp() {
    // No-op — the test supplies the code directly.
  },
  async verifyOtp(_userId, _phone, code) {
    if (code.trim() !== KNOWN_CODE) throw errors.otpInvalid();
    return true as const;
  },
};

async function main(): Promise<void> {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'doondo_smoke' });
  __setOtpProviderForTests(fakeProvider);

  try {
    await runChecks();
    console.log('\n🎉  All password-reset smoke checks passed.');
  } finally {
    __setOtpProviderForTests(null);
    await mongoose.disconnect();
    await mongo.stop();
  }
}

async function runChecks(): Promise<void> {
  // ─── 1. Register a fresh user with a phone ─────────────────────────────
  const email = 'smoke@doondo.dev';
  const oldPassword = 'oldPass123';
  const newPassword = 'newPass456';
  const rawPhone = '9876543210'; // Bare digits — backend should canonicalise.

  const reg = await authService.register({
    name: 'Smoke User',
    email,
    password: oldPassword,
    role: 'seeker',
    phone: rawPhone,
  });
  assert(reg.user.phone === '+919876543210', 'phone is canonicalised at register');
  const oldRefreshToken = reg.tokens.refreshToken;
  console.log('✓ register stores canonical phone');

  // ─── 2. Baseline login works with the original password ──────────────
  await authService.login({ email, password: oldPassword });
  console.log('✓ baseline login with original password works');

  // ─── 3. Forgot-password issues an OTP (we mocked the sender) ─────────
  const fp = await authService.requestPasswordReset({ phone: rawPhone });
  assert(fp.phone === '+919876543210', 'forgot-password returns canonical phone');
  console.log('✓ forgot-password accepted');

  // Unknown phone should also return success (anti-enumeration). It must
  // NOT crash, and must NOT leak any "user not found" signal.
  const unknown = await authService.requestPasswordReset({
    phone: '+919999999999',
  });
  assert(unknown.phone === '+919999999999', 'unknown phone returns same shape');
  console.log('✓ forgot-password is enumeration-safe');

  // ─── 4. Wrong code is rejected ────────────────────────────────────────
  await expectError(
    () =>
      authService.verifyResetCode({
        phone: rawPhone,
        code: WRONG_CODE,
      }),
    'VERIFICATION_OTP_INVALID',
    'wrong OTP rejected',
  );

  // ─── 5. Correct code mints a reset token ──────────────────────────────
  const vr = await authService.verifyResetCode({
    phone: rawPhone,
    code: KNOWN_CODE,
  });
  assert(vr.resetToken.length > 20, 'reset token issued');
  assert(vr.expiresIn === '15m', 'reset token TTL hint correct');
  console.log('✓ verify-reset-code mints a reset token');

  // ─── 6. Reset the password ────────────────────────────────────────────
  await authService.resetPassword({
    resetToken: vr.resetToken,
    newPassword,
  });
  console.log('✓ reset-password succeeded');

  // ─── 7. Outstanding refresh tokens are revoked ───────────────────────
  await expectError(
    () => authService.refresh(oldRefreshToken),
    ['AUTH_REFRESH_REVOKED', 'AUTH_REFRESH_REUSED'],
    'old refresh token revoked',
  );

  // ─── 8. Old password no longer works ─────────────────────────────────
  await expectError(
    () => authService.login({ email, password: oldPassword }),
    'AUTH_INVALID_CREDENTIALS',
    'old password rejected',
  );

  // ─── 9. New password works ───────────────────────────────────────────
  const newLogin = await authService.login({ email, password: newPassword });
  // login() now returns LoginResult = AuthSuccess | LoginNeedsRoleChoice.
  // This smoke script always sets up a single-account user, so the
  // ambiguous branch must not trigger — narrow with an explicit guard.
  if ('needsRoleChoice' in newLogin) {
    throw new Error(
      'FAIL: new-password login unexpectedly returned a role-choice envelope',
    );
  }
  assert(newLogin.user.email === email, 'new-password login returns user');
  console.log('✓ login with new password works');

  // ─── 10. Reset token reuse rejected ──────────────────────────────────
  await expectError(
    () =>
      authService.resetPassword({
        resetToken: vr.resetToken,
        newPassword: 'shouldNotWork789',
      }),
    'AUTH_RESET_TOKEN_INVALID',
    'reset-token reuse rejected',
  );
}

// ─── Test helpers ──────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function expectError(
  fn: () => Promise<unknown>,
  expectedCode: string | string[],
  label: string,
): Promise<void> {
  const codes = Array.isArray(expectedCode) ? expectedCode : [expectedCode];
  try {
    await fn();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code && codes.includes(code)) {
      console.log(`✓ ${label} (${code})`);
      return;
    }
    throw new Error(
      `FAIL: ${label} — expected ${codes.join(' | ')}, got ${code ?? err}`,
    );
  }
  throw new Error(`FAIL: ${label} — expected throw, got success`);
}

main().catch((err) => {
  console.error('\n❌  Smoke test failed:\n', err);
  process.exit(1);
});
