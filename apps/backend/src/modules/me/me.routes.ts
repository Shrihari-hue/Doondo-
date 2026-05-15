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
import walletRouter from '@/modules/wallet/wallet.routes';
import {
  pushTokenSchema,
  updateEmployerLocationSchema,
  updateLocationSchema,
  updateProfileSchema,
  updateWorkHistorySchema,
  uploadResumeSchema,
} from './me.schemas';

const router = Router();

// Earnings ledger — lives under /me because that's where seeker-facing
// account data sits. Sub-router stays small + isolated from /me's own
// profile mutations.
router.use('/', walletRouter);

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

// Resume — seeker-only because employers don't have a resume of their own.
// Replace by re-POSTing; remove via DELETE.
router.post(
  '/resume',
  requireAuth,
  requireRole('seeker'),
  validate(uploadResumeSchema),
  controller.uploadResume,
);
router.delete('/resume', requireAuth, requireRole('seeker'), controller.removeResume);

// Resume Builder — replace the seeker's work history with the supplied list.
// PUT semantics: array on the wire is the array stored. Empty array clears.
router.put(
  '/work-history',
  requireAuth,
  requireRole('seeker'),
  validate(updateWorkHistorySchema),
  controller.updateWorkHistory,
);

export default router;
