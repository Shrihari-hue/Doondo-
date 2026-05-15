/**
 * Job Alerts router — mounted under /me as a sub-router so the URLs are
 * /api/v1/me/alerts. Seeker-only since alerts are a seeker concept.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './alert.controller';
import {
  alertIdParamsSchema,
  createAlertSchema,
  updateAlertSchema,
} from './alert.schemas';

const router = Router();

router.get('/alerts', requireAuth, requireRole('seeker'), controller.list);

router.post(
  '/alerts',
  requireAuth,
  requireRole('seeker'),
  validate(createAlertSchema),
  controller.create,
);

router.patch(
  '/alerts/:id',
  requireAuth,
  requireRole('seeker'),
  validate(updateAlertSchema),
  controller.update,
);

router.delete(
  '/alerts/:id',
  requireAuth,
  requireRole('seeker'),
  validate(alertIdParamsSchema),
  controller.remove,
);

export default router;
