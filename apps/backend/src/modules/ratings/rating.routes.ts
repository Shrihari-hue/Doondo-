/**
 * Ratings routes.
 *
 * POST /api/v1/ratings              — create a rating (auth, any role)
 * GET  /api/v1/ratings/unrated      — list MY hired applications that I haven't rated yet
 * (Per-user reads live under /users/:id/ratings, mounted from v1.ts)
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './rating.controller';
import {
  createRatingBodySchema,
  myUnratedApplicationsQuerySchema,
} from './rating.schemas';

const router = Router();

router.post('/', requireAuth, validate(createRatingBodySchema), controller.create);
router.get(
  '/unrated',
  requireAuth,
  validate(myUnratedApplicationsQuerySchema),
  controller.listMyUnrated,
);

export default router;
