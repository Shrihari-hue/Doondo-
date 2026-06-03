/**
 * /my-job router. Mounted at /api/v1/my-job. Seeker-only.
 *
 *   GET /my-job/attendance?month=YYYY-MM        — worker's worked days/hours
 *   GET /my-job/payslip?employerId=&month=      — one employer's month (PDF source)
 *
 * The active-employers list, payment status, schedule, employer trust
 * panel and ratings all reuse existing endpoints; only these two
 * worker-scoped rollups are new.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getWorkerAttendance, getWorkerPayslip } from './workerJob.service';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const monthStr = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
  .optional();

router.get(
  '/attendance',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ query: z.object({ month: monthStr }) })),
  async (req, res, next) => {
    try {
      const data = await getWorkerAttendance(req.user!.id, (req.query as { month?: string }).month);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/payslip',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ query: z.object({ employerId: objectId, month: monthStr }) })),
  async (req, res, next) => {
    try {
      const q = req.query as { employerId: string; month?: string };
      const data = await getWorkerPayslip(req.user!.id, q.employerId, q.month);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
