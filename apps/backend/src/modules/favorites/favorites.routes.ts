/**
 * /employer-favorites router. Mounted at /api/v1/employer-favorites.
 *
 *   GET /employer-favorites/me/count        — employer: how many favourited me
 *   GET /employer-favorites/:employerId     — seeker: have I favourited them?
 *   PUT /employer-favorites/:employerId      — seeker: set favourite { on }
 *
 * `me/count` is registered before `/:employerId` so "me" isn't captured as
 * an id. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { FavoriteEmployerModel } from './favoriteEmployer.model';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid employer id',
});

router.get('/me/count', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const count = await FavoriteEmployerModel.countDocuments({
      employerId: new Types.ObjectId(req.user!.id),
    });
    res.json({ ok: true, data: { count }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:employerId',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ employerId: objectId }) })),
  async (req, res, next) => {
    try {
      const hit = await FavoriteEmployerModel.exists({
        workerId: new Types.ObjectId(req.user!.id),
        employerId: new Types.ObjectId(req.params.employerId!),
      });
      res.json({ ok: true, data: { favorited: !!hit }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:employerId',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ employerId: objectId }),
      body: z.object({ on: z.boolean() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const workerId = new Types.ObjectId(req.user!.id);
      const employerId = new Types.ObjectId(req.params.employerId!);
      if ((req.body as { on: boolean }).on) {
        await FavoriteEmployerModel.updateOne(
          { workerId, employerId },
          { $setOnInsert: { workerId, employerId } },
          { upsert: true },
        );
      } else {
        await FavoriteEmployerModel.deleteOne({ workerId, employerId });
      }
      res.json({
        ok: true,
        data: { favorited: (req.body as { on: boolean }).on },
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
