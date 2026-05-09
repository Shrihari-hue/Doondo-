/**
 * Auth router. Mounted at /api/v1/auth in src/routes/v1.ts.
 *
 * All write endpoints get the auth-tightened rate limiter so brute-force
 * attempts are slowed even before reaching the service.
 */

import { Router } from 'express';
import { authLimiter } from '@/middleware/rateLimit';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './auth.controller';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from './auth.schemas';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, validate(refreshSchema), controller.refresh);
router.post('/logout', validate(logoutSchema), controller.logout);
router.get('/me', requireAuth, controller.me);

export default router;
