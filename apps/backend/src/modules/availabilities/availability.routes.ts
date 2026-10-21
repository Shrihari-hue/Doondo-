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

// Employer-side reads mounted under /availabilities.
export const availabilitiesRouter = Router();
availabilitiesRouter.get(
  '/nearby',
  requireAuth,
  requireRole('employer'),
  validate(nearbyAvailabilitiesQuerySchema),
  controller.nearby,
);

// Predictive availability — "usually free" windows.
seekerAvailabilityRouter.get('/availability/prediction', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const { predictAvailability } = await import('./availabilityPrediction.service');
    res.json({ ok: true, data: { prediction: await predictAvailability(req.user!.id) }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
availabilitiesRouter.get('/prediction/:seekerId', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const { predictAvailability } = await import('./availabilityPrediction.service');
    res.json({ ok: true, data: { prediction: await predictAvailability(req.params.seekerId!) }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
