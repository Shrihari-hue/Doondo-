/**
 * Wage flags router. Mounted at /api/v1/wage-flags. Seeker-only —
 * flagging a job's wage practices, and the reporter's own history.
 * The public aggregate lives at GET /users/:id/wage-flags-summary
 * (routes/v1.ts), not here — deliberately separate from "my flags".
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as service from './wageFlag.service';

const router = Router();

const WAGE_FLAG_REASONS = ['below_promised_wage', 'late_payment', 'unpaid_overtime', 'wage_theft', 'other'] as const;
const PAY_PERIODS = ['hour', 'day', 'week', 'month', 'fixed'] as const;

router.post(
  '/',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        jobId: z.string().uuid('Invalid id'),
        reason: z.enum(WAGE_FLAG_REASONS),
        promisedWageAmount: z.number().int().positive().optional(),
        actualWageAmount: z.number().int().nonnegative().optional(),
        wagePeriod: z.enum(PAY_PERIODS).optional(),
        note: z.string().trim().max(500).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const flag = await service.createWageFlag(req.user!.id, req.body as service.CreateWageFlagInput);
      res.status(201).json({ ok: true, data: { flag }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/mine', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const flags = await service.listMine(req.user!.id);
    res.json({ ok: true, data: { flags }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
