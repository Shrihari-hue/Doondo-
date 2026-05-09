/**
 * v1 router — composes every module router under /api/v1.
 *
 * As Phase 2+ adds modules (jobs, applications, employer, chat, wallet,
 * verification, training, safety), they get mounted here.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import authRouter from '@/modules/auth/auth.routes';
import jobsRouter from '@/modules/jobs/job.routes';
import applicationsRouter from '@/modules/applications/application.routes';
import meRouter from '@/modules/me/me.routes';
import chatRouter from '@/modules/chat/chat.routes';
import verificationRouter from '@/modules/verification/verification.routes';
import * as applicationsController from '@/modules/applications/application.controller';
import {
  applicantsForJobSchema,
  applyParamsSchema,
} from '@/modules/applications/application.schemas';

const v1 = Router();

v1.use('/auth', authRouter);
v1.use('/jobs', jobsRouter);
v1.use('/applications', applicationsRouter);
v1.use('/me', meRouter);
v1.use('/conversations', chatRouter);
v1.use('/verification', verificationRouter);

// Apply lives URL-wise under /jobs/:id/apply (the natural place a client
// looks for it) but its controller belongs to the applications module.
// We mount it here directly so both URL groups stay consistent.
v1.post(
  '/jobs/:id/apply',
  requireAuth,
  requireRole('seeker'),
  validate(applyParamsSchema),
  applicationsController.apply,
);

// Employer reads "applicants for this job" — same URL grouping reasoning.
v1.get(
  '/jobs/:id/applicants',
  requireAuth,
  requireRole('employer'),
  validate(applicantsForJobSchema),
  applicationsController.listApplicantsForJob,
);

// Future Phase 2+ mount points:
// v1.use('/wallet', walletRouter);       // Phase 6
// v1.use('/training', trainingRouter);   // Phase 6
// v1.use('/safety', safetyRouter);       // Phase 7

export default v1;
