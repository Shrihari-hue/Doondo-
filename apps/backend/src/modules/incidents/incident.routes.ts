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
import { and, desc, eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getDb } from '@/db/client';
import { incidentLogs } from '@/db/schema';

const router = Router();

const uuidId = z.string().uuid('Invalid id');

const MAX_PHOTO_CHARS = 600_000;

type IncidentLogRow = typeof incidentLogs.$inferSelect;

function toPublic(r: IncidentLogRow) {
  return {
    id: r.id,
    note: r.note,
    photoUrl: r.photoUrl ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(
    z.object({
      body: z.object({
        workerId: uuidId,
        applicationId: uuidId.optional(),
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
      const [created] = await getDb()
        .insert(incidentLogs)
        .values({
          employerId: req.user!.id,
          workerId: body.workerId,
          applicationId: body.applicationId ?? null,
          note: body.note,
          photoUrl: photo,
        })
        .returning();
      res.json({ ok: true, data: { incident: toPublic(created!) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ query: z.object({ workerId: uuidId }) })),
  async (req, res, next) => {
    try {
      const rows = await getDb()
        .select()
        .from(incidentLogs)
        .where(
          and(
            eq(incidentLogs.employerId, req.user!.id),
            eq(incidentLogs.workerId, (req.query as { workerId: string }).workerId),
          ),
        )
        .orderBy(desc(incidentLogs.createdAt))
        .limit(50);
      res.json({ ok: true, data: { incidents: rows.map(toPublic) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
