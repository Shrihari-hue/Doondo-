/**
 * /masked-call router. Mounted at /api/v1/masked-call.
 *
 * Two-sided — both parties on a hire can place a privacy-preserving call,
 * so it's gated by requireAuth and the caller's role decides direction.
 *
 *   POST /masked-call  { applicationId } — start a call to the other party
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { initiateCall, type PartyRole } from './maskedCall.service';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

function partyRole(role: string | undefined): PartyRole {
  if (role === 'employer' || role === 'seeker') return role;
  throw Object.assign(new Error('Only employers and workers can place calls'), { status: 403 });
}

router.post(
  '/',
  requireAuth,
  validate(z.object({ body: z.object({ applicationId: objectId }) })),
  async (req, res, next) => {
    try {
      const call = await initiateCall({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        applicationId: (req.body as { applicationId: string }).applicationId,
      });
      res.json({ ok: true, data: { call }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
