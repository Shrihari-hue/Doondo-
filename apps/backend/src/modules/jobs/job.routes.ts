/**
 * Jobs router. Mounted at /api/v1/jobs.
 *
 * Auth model:
 *   - GET /nearby and GET /:id are PUBLIC (browse without login). This
 *     mirrors V1's web behavior: discovery first, friction second.
 *   - Save/unsave/list-saved require auth.
 *
 * Apply lives on the applications router so its routes group together.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './job.controller';
import {
  createJobSchema,
  employerJobsQuerySchema,
  jobIdParamsSchema,
  nearbyQuerySchema,
  updateJobSchema,
} from './job.schemas';

const router = Router();

// ─── Public / seeker reads ──────────────────────────────────────────────────
router.get('/nearby', validate(nearbyQuerySchema), controller.nearby);
router.get('/saved', requireAuth, controller.listSaved);

// ─── Employer (Phase 3) ─────────────────────────────────────────────────────
// "/mine" must come before "/:id" so it isn't captured by the param route.
router.get(
  '/mine',
  requireAuth,
  requireRole('employer'),
  validate(employerJobsQuerySchema),
  controller.listMine,
);
router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(createJobSchema),
  controller.createJob,
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('employer'),
  validate(updateJobSchema),
  controller.updateJob,
);
router.post(
  '/:id/pause',
  requireAuth,
  requireRole('employer'),
  validate(jobIdParamsSchema),
  controller.pauseJob,
);
router.post(
  '/:id/reopen',
  requireAuth,
  requireRole('employer'),
  validate(jobIdParamsSchema),
  controller.reopenJob,
);
router.post(
  '/:id/close',
  requireAuth,
  requireRole('employer'),
  validate(jobIdParamsSchema),
  controller.closeJob,
);

// ─── Public detail + seeker save ────────────────────────────────────────────
router.get('/:id', validate(jobIdParamsSchema), controller.detail);
router.post('/:id/save', requireAuth, validate(jobIdParamsSchema), controller.save);
router.delete('/:id/save', requireAuth, validate(jobIdParamsSchema), controller.unsave);

export default router;
