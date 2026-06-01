/**
 * /worker-notes router. Mounted at /api/v1/worker-notes.
 *
 *   GET    /worker-notes/:workerId — read this employer's note for a worker
 *   PUT    /worker-notes/:workerId — create or replace the note (upsert)
 *   DELETE /worker-notes/:workerId — clear the note
 *
 * Every route is employer-only and scoped to the authenticated employer:
 * an employer can only ever read or write *their own* private note about
 * a worker. The note is never exposed to the worker, so there is no
 * seeker-facing route here by design.
 *
 * The response envelope matches the rest of the v1 API
 * (`{ ok, data, requestId }`) so the mobile `apiRequest` unwraps it the
 * same way it does every other call.
 */

import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { WorkerNoteModel } from './workerNote.model';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid worker id',
});

const workerIdParams = z.object({ params: z.object({ workerId: objectId }) });

const putNoteSchema = z.object({
  params: z.object({ workerId: objectId }),
  body: z.object({ note: z.string().max(1000) }),
});

/** Shape returned to the client. `note` is '' when nothing is saved. */
function toPublic(workerId: string, note: string, updatedAt: Date | null) {
  return {
    workerId,
    note,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}

// ─── Read ───────────────────────────────────────────────────────────────────
router.get(
  '/:workerId',
  requireAuth,
  requireRole('employer'),
  validate(workerIdParams),
  async (req, res, next) => {
    try {
      const workerId = req.params.workerId!;
      const row = await WorkerNoteModel.findOne({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId(workerId),
      }).lean();
      res.json({
        ok: true,
        data: toPublic(
          workerId,
          row?.note ?? '',
          (row as { updatedAt?: Date } | null)?.updatedAt ?? null,
        ),
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Upsert ───────────────────────────────────────────────────────────────--
router.put(
  '/:workerId',
  requireAuth,
  requireRole('employer'),
  validate(putNoteSchema),
  async (req, res, next) => {
    try {
      const workerId = req.params.workerId!;
      const note = ((req.body as { note: string }).note ?? '').trim();
      const row = await WorkerNoteModel.findOneAndUpdate(
        {
          employerId: new Types.ObjectId(req.user!.id),
          workerId: new Types.ObjectId(workerId),
        },
        { $set: { note } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      res.json({
        ok: true,
        data: toPublic(
          workerId,
          row?.note ?? note,
          (row as { updatedAt?: Date } | null)?.updatedAt ?? new Date(),
        ),
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Clear ────────────────────────────────────────────────────────────────--
router.delete(
  '/:workerId',
  requireAuth,
  requireRole('employer'),
  validate(workerIdParams),
  async (req, res, next) => {
    try {
      const workerId = req.params.workerId!;
      await WorkerNoteModel.deleteOne({
        employerId: new Types.ObjectId(req.user!.id),
        workerId: new Types.ObjectId(workerId),
      });
      res.json({
        ok: true,
        data: toPublic(workerId, '', null),
        requestId: req.id,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
