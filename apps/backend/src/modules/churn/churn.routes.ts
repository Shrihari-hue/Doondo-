/**
 * /churn-risks router. Mounted at /api/v1/churn-risks. Employer-only.
 *
 *   GET /churn-risks — regulars who've gone quiet (win-back candidates).
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { getChurnRisks } from './churn.service';

const router = Router();

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const risks = await getChurnRisks(req.user!.id);
    res.json({ ok: true, data: { risks }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
