/**
 * /crew-documents router. Mounted at /api/v1/crew-documents. Employer-only.
 *
 *   POST   /crew-documents            — add a tracked document
 *   GET    /crew-documents?workerId=  — list a worker's documents
 *   GET    /crew-documents/expiring   — docs expiring soon / expired (all crew)
 *   DELETE /crew-documents/:id        — remove one
 *
 * Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { CrewDocumentModel, type CrewDocument } from './crewDocument.model';
import { UserModel } from '@/modules/users/user.model';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

/** Days ahead to treat a document as "expiring soon". */
const EXPIRING_WINDOW_DAYS = 30;

function toPublic(d: CrewDocument & { _id: unknown }) {
  return {
    id: (d._id as Types.ObjectId).toString(),
    workerId: (d.workerId as unknown as Types.ObjectId).toString(),
    label: d.label,
    expiresAt: d.expiresAt.toISOString(),
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
        label: z.string().trim().min(1).max(80),
        expiresAt: z.coerce.date(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { workerId: string; label: string; expiresAt: Date };
      const created = await CrewDocumentModel.create({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId(body.workerId),
        label: body.label,
        expiresAt: body.expiresAt,
      });
      res.json({
        ok: true,
        data: { document: toPublic(created.toObject() as CrewDocument & { _id: unknown }) },
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/expiring',
  requireAuth,
  requireRole('employer'),
  async (req, res, next) => {
    try {
      const horizon = new Date(Date.now() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const rows = await CrewDocumentModel.find({
        employerId: new Types.ObjectId(req.user!.id),
        expiresAt: { $lte: horizon },
      })
        .sort({ expiresAt: 1 })
        .limit(50)
        .lean();
      const workerIds = [...new Set(rows.map((r) => (r.workerId as unknown as Types.ObjectId).toString()))];
      const users = await UserModel.find({ _id: { $in: workerIds } }).select('name').lean();
      const nameMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), (u as { name?: string }).name ?? 'Worker']));
      const now = Date.now();
      res.json({
        ok: true,
        data: {
          documents: rows.map((r) => {
            const wid = (r.workerId as unknown as Types.ObjectId).toString();
            return {
              id: (r._id as Types.ObjectId).toString(),
              workerId: wid,
              workerName: nameMap.get(wid) ?? 'Worker',
              label: r.label,
              expiresAt: r.expiresAt.toISOString(),
              expired: r.expiresAt.getTime() < now,
            };
          }),
        },
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
      const rows = await CrewDocumentModel.find({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId((req.query as { workerId: string }).workerId),
      })
        .sort({ expiresAt: 1 })
        .lean();
      res.json({
        ok: true,
        data: { documents: rows.map((r) => toPublic(r as CrewDocument & { _id: unknown })) },
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      await CrewDocumentModel.deleteOne({
        _id: new Types.ObjectId(req.params.id!),
        employerId: new Types.ObjectId(req.user!.id),
      });
      res.json({ ok: true, data: { removed: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
