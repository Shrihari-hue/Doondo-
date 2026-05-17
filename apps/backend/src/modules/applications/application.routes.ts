/**
 * Applications router. Mounted at /api/v1/applications.
 *
 * Route order matters: Express matches in registration order, so every
 * STATIC path (/me, /employer) must come before any /:id path. Otherwise
 * "/employer" gets captured by /:id as a literal string and the wrong
 * role check fires (the bug we hit shipping Phase 4).
 *
 * The "apply" endpoint is mounted under /api/v1/jobs/:id/apply for URL
 * symmetry with the rest of the jobs API; both routes are wired in
 * src/routes/v1.ts.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './application.controller';
import {
  applicationIdParamsSchema,
  listApplicationsQuerySchema,
  massApplySchema,
  scheduleInterviewSchema,
} from './application.schemas';

const router = Router();

// ─── Static paths first (or they'll be shadowed by /:id) ────────────────────

// Seeker — list my applications.
router.get(
  '/me',
  requireAuth,
  requireRole('seeker'),
  validate(listApplicationsQuerySchema),
  controller.listMine,
);

// Employer — aggregator across every job I've posted, newest first.
router.get(
  '/employer',
  requireAuth,
  requireRole('employer'),
  validate(listApplicationsQuerySchema),
  controller.listApplicantsForEmployer,
);

// Seeker — submit a batch of applications in one shot. Capped at 20/call.
// Lives under /applications/mass-apply (not /jobs/.../apply) because the
// payload spans multiple job IDs.
router.post(
  '/mass-apply',
  requireAuth,
  requireRole('seeker'),
  validate(massApplySchema),
  controller.massApply,
);

// ─── /:id routes — must come after static paths ─────────────────────────────

// Seeker reads a single application of theirs.
router.get(
  '/:id',
  requireAuth,
  requireRole('seeker'),
  validate(applicationIdParamsSchema),
  controller.detail,
);
router.post(
  '/:id/withdraw',
  requireAuth,
  requireRole('seeker'),
  validate(applicationIdParamsSchema),
  controller.withdraw,
);

// Employer state transitions.
router.post(
  '/:id/view',
  requireAuth,
  requireRole('employer'),
  validate(applicationIdParamsSchema),
  controller.markViewed,
);
router.post(
  '/:id/shortlist',
  requireAuth,
  requireRole('employer'),
  validate(applicationIdParamsSchema),
  controller.shortlist,
);
router.post(
  '/:id/reject',
  requireAuth,
  requireRole('employer'),
  validate(applicationIdParamsSchema),
  controller.reject,
);
router.post(
  '/:id/hire',
  requireAuth,
  requireRole('employer'),
  validate(applicationIdParamsSchema),
  controller.hire,
);

// Interview scheduling — upsert pattern. POST schedules/reschedules,
// DELETE cancels. Both are employer-only.
router.post(
  '/:id/interview',
  requireAuth,
  requireRole('employer'),
  validate(scheduleInterviewSchema),
  controller.scheduleInterview,
);
router.delete(
  '/:id/interview',
  requireAuth,
  requireRole('employer'),
  validate(applicationIdParamsSchema),
  controller.cancelInterview,
);

// Cash-paid confirmation — either side may call this. The service
// authorises based on whether the caller is the seeker or the employer
// on the application.
router.post(
  '/:id/payment-confirmed',
  requireAuth,
  validate(applicationIdParamsSchema),
  controller.confirmPayment,
);

export default router;
