/**
 * /roster router. Mounted at /api/v1/roster.
 *
 *   GET /roster — the employer's recurring shifts + who's filling each.
 *   Employer-only. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { getWeeklyRoster } from './roster.service';

const router = Router();

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const entries = await getWeeklyRoster(req.user!.id);
    res.json({ ok: true, data: { entries }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
