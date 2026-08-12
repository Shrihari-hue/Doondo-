/**
 * /squads router. Mounted at /api/v1/squads. Employer-only.
 *
 *   POST   /squads             — create a reusable worker group
 *   GET    /squads             — list my squads (members hydrated)
 *   DELETE /squads/:id         — remove a squad
 *   POST   /squads/:id/deploy  — fan a direct offer to every member for a job
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { createSquad, listSquads, deleteSquad, deploySquad } from './squad.service';

const router = Router();

const objectId = z.string().uuid('Invalid id');

router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      body: z.object({
        name: z.string().trim().min(1).max(60),
        workerIds: z.array(objectId).min(1).max(20),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { name: string; workerIds: string[] };
      const squad = await createSquad(req.user!.id, body.name, body.workerIds);
      res.status(201).json({ ok: true, data: { squad }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const squads = await listSquads(req.user!.id);
    res.json({ ok: true, data: { squads }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/:id',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      await deleteSquad(req.user!.id, req.params.id!);
      res.json({ ok: true, data: { deleted: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/deploy',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({ jobId: objectId }),
    }),
  ),
  async (req, res, next) => {
    try {
      const result = await deploySquad(req.user!.id, req.params.id!, (req.body as { jobId: string }).jobId);
      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
