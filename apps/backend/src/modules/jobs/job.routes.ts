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
import { getPayStats } from './job.stats.controller';
import {
  createJobSchema,
  employerJobsQuerySchema,
  jobIdParamsSchema,
  nearbyQuerySchema,
  previewQuerySchema,
  thisWeekQuerySchema,
  todayQuerySchema,
  updateJobSchema,
} from './job.schemas';

const router = Router();

// ─── Public / seeker reads ──────────────────────────────────────────────────
router.get('/nearby', validate(nearbyQuerySchema), controller.nearby);
// "60-second first match" — public, unauthenticated. Shown to fresh
// role-pickers BEFORE signup so they see real jobs before being asked
// to commit. Must be registered before /:id to avoid the param route
// capturing the literal "preview" segment.
router.get('/preview', validate(previewQuerySchema), controller.preview);
// Distinct cities with active jobs — powers the Jobs-screen location
// picker (search jobs in a place other than where you physically are).
// Registered before /:id so it isn't captured by the param route.
router.get('/locations', requireAuth, controller.jobLocations);
// "Today" + "This week" feeds — same geo pipeline, different time/urgency
// filter. Listed above `/saved` so route ordering stays predictable.
router.get('/today', validate(todayQuerySchema), controller.today);
router.get('/this-week', validate(thisWeekQuerySchema), controller.thisWeek);
router.get('/saved', requireAuth, controller.listSaved);

// Pay statistics — public so the "typical pay" line renders even for
// unauthenticated browsers. Bounded by request validation in the handler.
router.get('/pay-stats', getPayStats);

// Personalised recommendations — seeker-only "for you" feed driven by
// resume + history. Defined inline because the service is heavy enough
// to warrant a dynamic import (avoids loading it on every cold start).
router.get(
  '/recommended',
  requireAuth,
  requireRole('seeker'),
  async (req, res, next) => {
    try {
      const { recommendFor } = await import('./recommendations.service');
      const jobs = await recommendFor(req.user!.id, { limit: 10 });
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  },
);

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
  '/:id/repost',
  requireAuth,
  requireRole('employer'),
  validate(jobIdParamsSchema),
  controller.repostJob,
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
