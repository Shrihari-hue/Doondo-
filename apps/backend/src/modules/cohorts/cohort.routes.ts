/**
 * Cohorts router. Mounted at /api/v1/cohorts. Seeker-only (peer course
 * groups) — see cohort.service.ts for the model.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as service from './cohort.service';

const router = Router();
const objectId = z.string().uuid('Invalid id');

router.get('/', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const cohortsList = await service.listMine(req.user!.id);
    res.json({ ok: true, data: { cohorts: cohortsList }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        courseId: z.string().trim().min(1).max(80),
        name: z.string().trim().max(80).optional(),
        inviteUserIds: z.array(objectId).min(1).max(4),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { courseId: string; name?: string; inviteUserIds: string[] };
      const cohort = await service.createCohort(req.user!.id, body);
      res.status(201).json({ ok: true, data: { cohort }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      const cohort = await service.findById(req.user!.id, req.params.id!);
      res.json({ ok: true, data: { cohort }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/invite',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({ inviteUserIds: z.array(objectId).min(1).max(4) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const cohort = await service.inviteMembers(
        req.user!.id,
        req.params.id!,
        (req.body as { inviteUserIds: string[] }).inviteUserIds,
      );
      res.json({ ok: true, data: { cohort }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/respond',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({ accept: z.boolean() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const cohort = await service.respondToInvite(
        req.user!.id,
        req.params.id!,
        (req.body as { accept: boolean }).accept,
      );
      res.json({ ok: true, data: { cohort }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/messages',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ id: objectId }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }).default({}),
    }),
  ),
  async (req, res, next) => {
    try {
      const limit = (req.query as unknown as { limit: number }).limit;
      const messages = await service.listMessages(req.user!.id, req.params.id!, { limit });
      res.json({ ok: true, data: { messages }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/messages',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({
        body: z.string().trim().max(4000).optional(),
        kind: z.enum(['text', 'image']).optional(),
        attachment: z
          .object({ dataUrl: z.string(), mimeType: z.string(), sizeBytes: z.number() })
          .nullable()
          .optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const message = await service.sendMessage(req.user!.id, req.params.id!, req.body as service.SendCohortMessageInput);
      res.status(201).json({ ok: true, data: { message }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/read',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      await service.markRead(req.user!.id, req.params.id!);
      res.json({ ok: true, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
