/**
 * /labor-budget router. Mounted at /api/v1/labor-budget.
 *
 *   GET /labor-budget — the employer's budget + live spend-to-date
 *   PUT /labor-budget — set / change the budget (period + amount)
 *
 * Employer-only. A budget is guidance, never a gate — there is no
 * endpoint that blocks spending. Standard `{ ok, data, requestId }`
 * envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { BUDGET_PERIODS, getLaborBudgetSummary, setLaborBudget } from './laborBudget.service';

const router = Router();

const putSchema = z.object({
  body: z.object({
    period: z.enum(BUDGET_PERIODS),
    /** Budget ceiling in paise. 0 is allowed (effectively clears the cap). */
    amountPaise: z.number().int().min(0).max(1_000_000_000),
  }),
});

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const data = await getLaborBudgetSummary(req.user!.id);
    res.json({ ok: true, data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(putSchema),
  async (req, res, next) => {
    try {
      const body = req.body as { period: 'week' | 'month'; amountPaise: number };
      const data = await setLaborBudget(req.user!.id, body.period, body.amountPaise);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
