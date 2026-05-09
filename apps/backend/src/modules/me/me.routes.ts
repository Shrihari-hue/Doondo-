/**
 * /me router. Mounted at /api/v1/me.
 *
 * The seeker's GET /me lives in the auth router (auth.routes.ts → /auth/me)
 * since it returns identity. This router is for mutations on the
 * authenticated user's own record.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './me.controller';
import {
  pushTokenSchema,
  updateEmployerLocationSchema,
  updateLocationSchema,
  updateProfileSchema,
} from './me.schemas';

const router = Router();

router.patch(
  '/profile',
  requireAuth,
  validate(updateProfileSchema),
  controller.updateProfile,
);
router.post(
  '/location',
  requireAuth,
  validate(updateLocationSchema),
  controller.updateLocation,
);
router.post(
  '/employer-location',
  requireAuth,
  requireRole('employer'),
  validate(updateEmployerLocationSchema),
  controller.updateEmployerLocation,
);
router.post(
  '/push-token',
  requireAuth,
  validate(pushTokenSchema),
  controller.registerPushToken,
);
router.delete(
  '/push-token',
  requireAuth,
  validate(pushTokenSchema),
  controller.clearPushToken,
);

export default router;
