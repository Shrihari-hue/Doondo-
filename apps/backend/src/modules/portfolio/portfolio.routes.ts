/**
 * /portfolio router. Mounted at /api/v1/portfolio — "Look Inside".
 *
 *   GET    /portfolio/summaries?ids=a,b,c   public: which employers have a tour
 *   GET    /portfolio/mine                   employer: read own portfolio
 *   PUT    /portfolio/mine                   employer: edit text / order / pins
 *   POST   /portfolio/mine/photos            employer: upload a photo
 *   DELETE /portfolio/mine/photos/:photoId   employer: remove a photo
 *   POST   /portfolio/mine/team/:id/photo    employer: set a team member photo
 *   POST   /portfolio/mine/video             employer: upload the workplace video
 *   DELETE /portfolio/mine/video             employer: remove the video
 *   GET    /portfolio/:employerId            public: the Look Inside payload
 *
 * Literal paths are registered before `/:employerId`.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { PHOTO_KINDS } from './portfolio.model';
import * as service from './portfolio.service';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const dataUrl = (max: number) =>
  z
    .string()
    .min(20)
    .max(max)
    .regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, 'Must be a base64 data URL');

router.get(
  '/summaries',
  validate(z.object({ query: z.object({ ids: z.string().max(2000) }) })),
  async (req, res, next) => {
    try {
      const ids = String(req.query.ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const summaries = await service.getSummaries(ids);
      res.json({ ok: true, data: { summaries }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/mine', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const portfolio = await service.getMine(req.user!.id);
    res.json({ ok: true, data: { portfolio }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  body: z.object({
    about: z.string().trim().max(600).nullable().optional(),
    perks: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    faqs: z
      .array(z.object({ id: z.string().max(40).optional(), q: z.string().trim().min(2).max(160), a: z.string().trim().min(1).max(600) }))
      .max(10)
      .optional(),
    team: z
      .array(
        z.object({
          id: z.string().max(40).optional(),
          name: z.string().trim().min(1).max(60),
          role: z.string().trim().min(1).max(60),
          tenure: z.string().trim().max(40).nullable().optional(),
        }),
      )
      .max(12)
      .optional(),
    photos: z
      .array(
        z.object({
          id: objectId,
          kind: z.enum(PHOTO_KINDS),
          caption: z.string().trim().max(80).nullable().optional(),
          pins: z
            .array(
              z.object({
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                jobId: objectId.nullable().optional(),
                label: z.string().trim().min(1).max(60),
              }),
            )
            .max(6)
            .optional(),
        }),
      )
      .max(12)
      .optional(),
  }),
});

router.put('/mine', requireAuth, requireRole('employer'), validate(patchSchema), async (req, res, next) => {
  try {
    const portfolio = await service.updateMine(req.user!.id, req.body as service.PortfolioPatch);
    res.json({ ok: true, data: { portfolio }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/mine/photos',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      body: z.object({
        dataUrl: dataUrl(2_100_000),
        mimeType: z.string().trim().max(40),
        kind: z.enum(PHOTO_KINDS).default('other'),
        caption: z.string().trim().max(80).nullable().optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const portfolio = await service.addPhoto(req.user!.id, req.body);
      res.status(201).json({ ok: true, data: { portfolio }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/mine/photos/:photoId',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ params: z.object({ photoId: objectId }) })),
  async (req, res, next) => {
    try {
      const portfolio = await service.removePhoto(req.user!.id, req.params.photoId!);
      res.json({ ok: true, data: { portfolio }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/mine/team/:memberId/photo',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      params: z.object({ memberId: objectId }),
      body: z.object({ dataUrl: dataUrl(2_100_000), mimeType: z.string().trim().max(40) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const portfolio = await service.setTeamPhoto(req.user!.id, req.params.memberId!, req.body);
      res.json({ ok: true, data: { portfolio }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/mine/video',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      body: z.object({
        dataUrl: dataUrl(58_000_000),
        mimeType: z.string().trim().max(40).default('video/mp4'),
        durationSeconds: z.number().min(0).max(120),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const portfolio = await service.setVideo(req.user!.id, req.body);
      res.status(201).json({ ok: true, data: { portfolio }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/mine/video', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const portfolio = await service.removeVideo(req.user!.id);
    res.json({ ok: true, data: { portfolio }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:employerId',
  validate(z.object({ params: z.object({ employerId: objectId }) })),
  async (req, res, next) => {
    try {
      const data = await service.getPublic(req.params.employerId!);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
