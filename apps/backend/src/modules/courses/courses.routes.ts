/**
 * Courses router. Mounted at /api/v1/courses + a small enrollments
 * sub-router at /api/v1/me/enrollments.
 *
 * Catalogue reads (list + detail) are public so unauthenticated
 * visitors can browse. Enrollment writes require auth + seeker role.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import * as controller from './courses.controller';

export const coursesRouter = Router();

// Public reads. requireAuth is intentionally omitted; the list handler
// reads req.user defensively to bias sort if signed in.
coursesRouter.get('/', controller.list);
coursesRouter.get('/:id', controller.detail);

// Seeker-only enrolment writes.
coursesRouter.post(
  '/:id/enroll',
  requireAuth,
  requireRole('seeker'),
  controller.enroll,
);
coursesRouter.post(
  '/:id/lessons/:lessonId/complete',
  requireAuth,
  requireRole('seeker'),
  controller.completeLesson,
);

// Mounted from /me — gives the seeker their own list of enrollments.
export const seekerEnrollmentsRouter = Router();
seekerEnrollmentsRouter.get(
  '/enrollments',
  requireAuth,
  requireRole('seeker'),
  controller.listMyEnrollments,
);
