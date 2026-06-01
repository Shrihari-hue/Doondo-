/**
 * /incidents router. Mounted at /api/v1/incidents. Employer-only.
 *
 *   POST /incidents              — log an incident about a worker
 *   GET  /incidents?workerId=... — list this employer's incidents for a worker
 *
 * Strictly private to the employer who wrote them. Standard envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { IncidentLogModel, type IncidentLog } from './incident.model';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid id',
});

const MAX_PHOTO_CHARS = 600_000;

function toPublic(r: IncidentLog & { _id: unknown }) {
  return {
    id: (r._id as Types.ObjectId).toString(),
    note: r.note,
    photoUrl: r.photoUrl ?? null,
    createdAt: (r as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      body: z.object({
        workerId: objectId,
        applicationId: objectId.optional(),
        note: z.string().trim().min(1).max(500),
        photoDataUrl: z.string().max(MAX_PHOTO_CHARS).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as {
        workerId: string;
        applicationId?: string;
        note: string;
        photoDataUrl?: string;
      };
      const photo =
        typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image/')
          ? body.photoDataUrl
          : null;
      const created = await IncidentLogModel.create({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId(body.workerId),
        applicationId: body.applicationId ? new Types.ObjectId(body.applicationId) : null,
        note: body.note,
        photoUrl: photo,
      });
      res.json({
        ok: true,
        data: { incident: toPublic(created.toObject() as IncidentLog & { _id: unknown }) },
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ query: z.object({ workerId: objectId }) })),
  async (req, res, next) => {
    try {
      const rows = await IncidentLogModel.find({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId((req.query as { workerId: string }).workerId),
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      res.json({
        ok: true,
        data: { incidents: rows.map((r) => toPublic(r as IncidentLog & { _id: unknown })) },
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
