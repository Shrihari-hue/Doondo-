/**
 * /statement router. Mounted at /api/v1/statement.
 *
 *   GET /statement?month=YYYY-MM — consolidated month-end roll-up per
 *   worker (shifts, hours, days, settled pay) + totals. Defaults to the
 *   current month. Employer-only. The mobile turns this into a PDF.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getMonthlyStatement } from './statement.service';

const router = Router();

const querySchema = z.object({
  query: z.object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
      .optional(),
  }),
});

router.get('/', requireAuth, requireRole('employer'), validate(querySchema), async (req, res, next) => {
  try {
    const month = (req.query as { month?: string }).month;
    const data = await getMonthlyStatement(req.user!.id, month);
    res.json({ ok: true, data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
