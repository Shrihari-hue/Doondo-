/**
 * /needs-you-now router. Mounted at /api/v1/needs-you-now.
 *
 *   GET /needs-you-now — prioritized action feed for the employer Home
 *   (waiting applicants, counter-offers, work proofs, en-route workers,
 *   expiring crew docs). Employer-only.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { getNeedsYouNow } from './needsYouNow.service';

const router = Router();

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const data = await getNeedsYouNow(req.user!.id);
    res.json({ ok: true, data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
