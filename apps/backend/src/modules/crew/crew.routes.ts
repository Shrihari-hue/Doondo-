/**
 * /crew router. Mounted at /api/v1/crew.
 *
 *   GET    /crew          — list saved crew workers
 *   POST   /crew/import   — import phone contacts, match to Doondo workers
 *   DELETE /crew/:workerId — remove a worker from the crew
 *
 * Employer-only. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { listCrew, importContacts, removeFromCrew, rehireCrewMember } from './crew.service';

const router = Router();

const importSchema = z.object({
  body: z.object({
    contacts: z
      .array(
        z.object({
          name: z.string().max(120).default(''),
          phone: z.string().min(4).max(40),
        }),
      )
      .min(1)
      .max(500),
  }),
});

const workerIdParams = z.object({
  params: z.object({
    workerId: z.string().uuid('Invalid worker id'),
  }),
});

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const workers = await listCrew(req.user!.id);
    res.json({ ok: true, data: { workers }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/import',
  requireAuth,
  requireRole('employer'),
  validate(importSchema),
  async (req, res, next) => {
    try {
      const body = req.body as { contacts: Array<{ name: string; phone: string }> };
      const result = await importContacts(req.user!.id, body.contacts);
      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

const rehireSchema = z.object({
  params: z.object({
    workerId: z.string().uuid('Invalid worker id'),
  }),
  body: z.object({
    jobId: z.string().uuid('Invalid job id'),
    ttlHours: z.number().int().min(1).max(168).optional(),
  }),
});

router.post(
  '/:workerId/rehire',
  requireAuth,
  requireRole('employer'),
  validate(rehireSchema),
  async (req, res, next) => {
    try {
      const body = req.body as { jobId: string; ttlHours?: number };
      const application = await rehireCrewMember(
        req.user!.id,
        req.params.workerId!,
        body.jobId,
        body.ttlHours,
      );
      res.json({ ok: true, data: { application }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:workerId',
  requireAuth,
  requireRole('employer'),
  validate(workerIdParams),
  async (req, res, next) => {
    try {
      await removeFromCrew(req.user!.id, req.params.workerId!);
      res.json({ ok: true, data: { removed: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
