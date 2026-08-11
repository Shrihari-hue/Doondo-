/**
 * /work-proof router. Mounted at /api/v1/work-proof.
 *
 *   GET  /work-proof/:applicationId         — read the proof (either party)
 *   POST /work-proof/:applicationId         — worker submits a photo
 *   POST /work-proof/:applicationId/review  — employer approves/rejects
 *
 * Role is checked per route; ownership (membership on the application) is
 * enforced in the service. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { submitProof, reviewProof, getProof } from './workProof.service';

const router = Router();

const idParam = z.object({
  params: z.object({
    applicationId: z.string().uuid('Invalid application id'),
  }),
});

router.get(
  '/:applicationId',
  requireAuth,
  validate(idParam),
  async (req, res, next) => {
    try {
      const data = await getProof(req.user!.id, req.params.applicationId!);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:applicationId',
  requireAuth,
  requireRole('seeker'),
  validate(idParam),
  async (req, res, next) => {
    try {
      const photoDataUrl = (req.body as { photoDataUrl?: string })?.photoDataUrl ?? '';
      const data = await submitProof(req.user!.id, req.params.applicationId!, photoDataUrl);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:applicationId/review',
  requireAuth,
  requireRole('employer'),
  validate(idParam),
  async (req, res, next) => {
    try {
      const approve = (req.body as { approve?: unknown })?.approve;
      if (typeof approve !== 'boolean') {
        res.status(400).json({ error: 'approve must be a boolean' });
        return;
      }
      const data = await reviewProof(req.user!.id, req.params.applicationId!, approve);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
