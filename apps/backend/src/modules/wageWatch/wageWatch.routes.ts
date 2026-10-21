/**
 * /wage-watch router. Mounted at /api/v1/wage-watch. Seeker-only.
 *   GET /wage-watch — going rates + trend for my skills in my city
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { goingRatesForUser } from './wageWatch.service';

const router = Router();

router.get('/', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    res.json({ ok: true, data: await goingRatesForUser(req.user!.id), requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
