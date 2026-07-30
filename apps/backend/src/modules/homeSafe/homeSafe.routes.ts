/**
 * /home-safe router. Mounted at /api/v1/home-safe. Seeker-only.
 *
 *   GET  /home-safe/pending      — open "reached home safe?" prompts
 *   POST /home-safe/:id/confirm  — mark safe (pings Trust Circle if opted in)
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { listPending, confirmSafe } from './homeSafe.service';

const router = Router();

const uuid = z.string().uuid({ message: 'Invalid id' });

router.get('/pending', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const checks = await listPending(req.user!.id);
    res.json({ ok: true, data: { checks }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/confirm',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ id: uuid }) })),
  async (req, res, next) => {
    try {
      const check = await confirmSafe(req.user!.id, req.params.id!);
      res.json({ ok: true, data: { check }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
