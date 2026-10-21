/**
 * /rejection-explainer router. Mounted at /api/v1/rejection-explainer. Seeker-only.
 *
 *   GET /rejection-explainer/:applicationId — explanation + next steps + similar jobs
 */
import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getRejectionExplainer } from './rejectionExplainer.service';

const router = Router();
const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

router.get(
  '/:applicationId',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ applicationId: objectId }) })),
  async (req, res, next) => {
    try {
      const explainer = await getRejectionExplainer(req.user!.id, req.params.applicationId!);
      res.json({ ok: true, data: { explainer }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
