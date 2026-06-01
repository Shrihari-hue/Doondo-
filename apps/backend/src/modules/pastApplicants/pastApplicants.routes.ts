/**
 * /past-applicants router. Mounted at /api/v1/past-applicants.
 *
 *   GET /past-applicants?lat&lng&radius — workers who applied to this
 *       employer before and are broadcasting availability nearby now.
 *
 * Employer-only. Coordinates default to a wide radius because this is a
 * "who's around again" discovery surface, not a same-day-shift filter.
 * Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { findAvailablePastApplicants } from './pastApplicants.service';

const router = Router();

const querySchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().int().min(100).max(50_000).default(15_000),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

router.get(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(querySchema),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as {
        lat: number;
        lng: number;
        radius: number;
        limit: number;
      };
      const workers = await findAvailablePastApplicants({
        employerId: req.user!.id,
        lat: q.lat,
        lng: q.lng,
        radius: q.radius,
        limit: q.limit,
      });
      res.json({ ok: true, data: { workers }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
