/**
 * Auth router. Mounted at /api/v1/auth in src/routes/v1.ts.
 *
 * All write endpoints get the auth-tightened rate limiter so brute-force
 * attempts are slowed even before reaching the service.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { authLimiter } from '@/middleware/rateLimit';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './auth.controller';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} from './auth.schemas';

const router = Router();

// Tighter per-IP limit on the reset OTP entry point — each call can cost
// an SMS, and the call is unauthenticated. Mirrors the OTP-issue limit on
// the verification router so attackers can't bypass it by jumping flows.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60_000,
  max: env.OTP_SEND_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw errors.rateLimited('Too many reset requests. Try again in a minute.');
  },
});

// Brute-force defense on code verification. Each wrong code already burns
// an OTP attempt, but cap incoming requests too so a botnet can't churn
// across many IPs.
const verifyResetCodeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw errors.rateLimited('Too many verification attempts.');
  },
});

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', validate(logoutSchema), controller.logout);
router.get('/me', requireAuth, controller.me);

// ─── Password reset (unauthenticated) ─────────────────────────────────────
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword,
);
router.post(
  '/verify-reset-code',
  verifyResetCodeLimiter,
  validate(verifyResetCodeSchema),
  controller.verifyResetCode,
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  controller.resetPassword,
);

export default router;
