/**
 * Moderation routes.
 *
 *   /blocks   (employer-only) — GET list, POST block, DELETE unblock
 *   /reports  (any auth)      — POST file a report
 *
 * Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { REPORT_REASONS } from './userReport.model';
import {
  blockWorker,
  unblockWorker,
  listBlocked,
  reportUser,
} from './moderation.service';

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid id',
});

export const blocksRouter = Router();

blocksRouter.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const blocked = await listBlocked(req.user!.id);
    res.json({ ok: true, data: { blocked }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

blocksRouter.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ body: z.object({ workerId: objectId }) })),
  async (req, res, next) => {
    try {
      await blockWorker(req.user!.id, (req.body as { workerId: string }).workerId);
      res.json({ ok: true, data: { blocked: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

blocksRouter.delete(
  '/:workerId',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ params: z.object({ workerId: objectId }) })),
  async (req, res, next) => {
    try {
      await unblockWorker(req.user!.id, req.params.workerId!);
      res.json({ ok: true, data: { blocked: false }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export const reportsRouter = Router();

reportsRouter.post(
  '/',
  requireAuth,
  validate(
    z.object({
      body: z.object({
        reportedUserId: objectId,
        reason: z.enum(REPORT_REASONS),
        note: z.string().max(1000).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as {
        reportedUserId: string;
        reason: (typeof REPORT_REASONS)[number];
        note?: string;
      };
      await reportUser({
        reporterId: req.user!.id,
        reportedUserId: body.reportedUserId,
        reason: body.reason,
        note: body.note,
      });
      res.json({ ok: true, data: { reported: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
