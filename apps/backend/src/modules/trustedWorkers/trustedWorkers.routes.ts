/**
 * /trusted-workers router. Mounted at /api/v1/trusted-workers.
 *
 *   GET /trusted-workers — workers highly rated by other employers in the
 *       caller's city. Employer-only. `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { findWorkersRatedByLocalEmployers } from './trustedWorkers.service';

const router = Router();

const querySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
});

router.get('/', requireAuth, requireRole('employer'), validate(querySchema), async (req, res, next) => {
  try {
    const limit = (req.query as unknown as { limit: number }).limit;
    const workers = await findWorkersRatedByLocalEmployers(req.user!.id, limit);
    res.json({ ok: true, data: { workers }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
