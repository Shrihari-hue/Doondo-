/**
 * /shift-coach router. Mounted at /api/v1/shift-coach. Seeker-only.
 *   POST /shift-coach/ask { applicationId, question } — answer during an active shift
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { askCoach } from './shiftCoach.service';

const router = Router();
router.post(
  '/ask',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ body: z.object({ applicationId: z.string().min(1), question: z.string().trim().min(2).max(500) }) })),
  async (req, res, next) => {
    try {
      const answer = await askCoach(req.user!.id, req.body.applicationId, req.body.question);
      res.json({ ok: true, data: answer, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
export default router;
