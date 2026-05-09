/**
 * /verification router. Mounted at /api/v1/verification.
 *
 * All endpoints require an authenticated user. The phone-OTP endpoints are
 * additionally rate-limited per IP to slow down SMS-flood attacks (the
 * backend never sends an SMS without going through these endpoints).
 *
 * Route order doesn't matter here — none of the static paths shadow each
 * other and we don't have any /:id segments — but we still register the
 * "narrowest" status read first as a habit.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './verification.controller';
import {
  startPhoneSchema,
  uploadSelfieSchema,
  verifyPhoneSchema,
} from './verification.schemas';

const router = Router();

// Per-IP rate limit on the OTP-issue endpoint. Each call costs an SMS, so
// we cap aggressively — a real user needs at most 1–2 per minute (resend
// after a typo). The verify endpoint also gets a tighter cap so brute-
// force attempts cost more than they pay back.
const otpIssueLimiter = rateLimit({
  windowMs: 60_000,
  max: env.OTP_SEND_PER_MINUTE,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw errors.rateLimited('Too many code requests. Try again in a minute.');
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: () => {
    throw errors.rateLimited('Too many verification attempts.');
  },
});

router.get('/status', requireAuth, controller.getStatus);

router.post(
  '/phone/start',
  requireAuth,
  otpIssueLimiter,
  validate(startPhoneSchema),
  controller.startPhone,
);

router.post(
  '/phone/verify',
  requireAuth,
  otpVerifyLimiter,
  validate(verifyPhoneSchema),
  controller.verifyPhone,
);

router.post(
  '/selfie',
  requireAuth,
  validate(uploadSelfieSchema),
  controller.uploadSelfie,
);

export default router;
