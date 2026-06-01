/**
 * /travel-times router. Mounted at /api/v1/travel-times.
 *
 *   POST /travel-times — driving time/distance from an origin to a batch
 *       of worker locations. Employer-only.
 *
 * Body: { origin: {lat,lng}, destinations: [{id,lat,lng}] (≤ 100) }.
 * Always returns one result per destination (real route or straight-line
 * estimate, flagged). Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getTravelTimes } from './travelTime.service';

const router = Router();

const latLng = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

const bodySchema = z.object({
  body: z.object({
    origin: z.object(latLng),
    destinations: z
      .array(z.object({ id: z.string().max(64), ...latLng }))
      .min(1)
      .max(100),
  }),
});

router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(bodySchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        origin: { lat: number; lng: number };
        destinations: Array<{ id: string; lat: number; lng: number }>;
      };
      const results = await getTravelTimes(body.origin, body.destinations);
      res.json({ ok: true, data: { results }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
