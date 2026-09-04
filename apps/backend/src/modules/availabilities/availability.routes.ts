/**
 * Availability router — mounted twice from v1.ts:
 *   - /me/availability   (seeker reads + mutates own beacon)
 *   - /availabilities    (employer reads nearby)
 *
 * Splitting the URL space cleanly between owner-scoped and lookup
 * routes makes the auth model obvious at a glance.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './availability.controller';
import {
  nearbyAvailabilitiesQuerySchema,
  pauseAvailabilitySchema,
  upsertAvailabilitySchema,
} from './availability.schemas';

// Seeker-side routes mounted under /me/availability.
export const seekerAvailabilityRouter = Router();
seekerAvailabilityRouter.get(
  '/availability',
  requireAuth,
  requireRole('seeker'),
  controller.getMine,
);
seekerAvailabilityRouter.post(
  '/availability',
  requireAuth,
  requireRole('seeker'),
  validate(upsertAvailabilitySchema),
  controller.publish,
);
seekerAvailabilityRouter.delete(
  '/availability',
  requireAuth,
  requireRole('seeker'),
  controller.withdraw,
);
// seeker-plan.md §7.1 — pause/resume new Quick Work offers without withdrawing the beacon.
seekerAvailabilityRouter.patch(
  '/availability/pause',
  requireAuth,
  requireRole('seeker'),
  validate(pauseAvailabilitySchema),
  controller.pause,
);

// Employer-side reads mounted under /availabilities.
export const availabilitiesRouter = Router();
availabilitiesRouter.get(
  '/nearby',
  requireAuth,
  requireRole('employer'),
  validate(nearbyAvailabilitiesQuerySchema),
  controller.nearby,
);
