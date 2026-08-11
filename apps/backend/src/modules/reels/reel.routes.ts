/**
 * /reels router. Mounted at /api/v1/reels — Hire Reels.
 *
 *   POST   /reels              seeker records / replaces their intro reel
 *   GET    /reels/mine         seeker reads their own reel
 *   DELETE /reels              seeker removes their reel
 *   GET    /reels/feed         employer browses the worker discovery feed
 *   GET    /reels/seeker/:id   anyone reads a given worker's reel
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as reelService from './reel.service';

const router = Router();

const uploadSchema = z.object({
  body: z.object({
    /** Video as a base64 data URL. Coarse cap here; the service enforces the real bound. */
    videoDataUrl: z.string().min(1).max(60_000_000),
    mimeType: z.string().max(60).default('video/mp4'),
    durationSeconds: z.number().min(0).max(120),
    caption: z.string().trim().max(140).nullable().optional(),
  }),
});

router.post(
  '/',
  requireAuth,
  requireRole('seeker'),
  validate(uploadSchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        videoDataUrl: string;
        mimeType: string;
        durationSeconds: number;
        caption?: string | null;
      };
      const reel = await reelService.upsertReel({
        seekerId: req.user!.id,
        dataUrl: body.videoDataUrl,
        mimeType: body.mimeType,
        durationSeconds: body.durationSeconds,
        caption: body.caption ?? null,
      });
      res.status(201).json({ ok: true, data: { reel }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/mine', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const reel = await reelService.getMyReel(req.user!.id);
    res.json({ ok: true, data: { reel }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    await reelService.deleteReel(req.user!.id);
    res.json({ ok: true, data: { removed: true }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/feed',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .default({}),
    }),
  ),
  async (req, res, next) => {
    try {
      const limit = (req.query as { limit?: number }).limit ?? 20;
      const reels = await reelService.listReelFeed({ limit });
      res.json({ ok: true, data: { reels }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/seeker/:id',
  requireAuth,
  validate(
    z.object({
      params: z.object({
        id: z.string().uuid('Invalid id'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const reel = await reelService.getSeekerReel(req.params.id!);
      res.json({ ok: true, data: { reel }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
