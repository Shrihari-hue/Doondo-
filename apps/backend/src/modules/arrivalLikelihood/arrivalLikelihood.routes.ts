/**
 * /arrival-likelihood router. Mounted at /api/v1/arrival-likelihood.
 *
 *   GET /arrival-likelihood/:applicationId — will-they-show-up score for
 *       one applicant, scoped to the employer who owns the application.
 *
 * Employer-only. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { computeArrivalLikelihood } from './arrivalLikelihood.service';

const router = Router();

const paramsSchema = z.object({
  params: z.object({
    applicationId: z.string().refine((v) => Types.ObjectId.isValid(v), {
      message: 'Invalid application id',
    }),
  }),
});

router.get(
  '/:applicationId',
  requireAuth,
  requireRole('employer'),
  validate(paramsSchema),
  async (req, res, next) => {
    try {
      const data = await computeArrivalLikelihood(
        req.params.applicationId!,
        req.user!.id,
      );
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
