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
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getDb } from '@/db/client';
import { crewDocuments, users } from '@/db/schema';

const router = Router();

const uuidId = z.string().uuid('Invalid id');

/** Days ahead to treat a document as "expiring soon". */
const EXPIRING_WINDOW_DAYS = 30;

type CrewDocumentRow = typeof crewDocuments.$inferSelect;

function toPublic(d: CrewDocumentRow) {
  return {
    id: d.id,
    workerId: d.workerId,
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
        workerId: uuidId,
        label: z.string().trim().min(1).max(80),
        expiresAt: z.coerce.date(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { workerId: string; label: string; expiresAt: Date };
      const [created] = await getDb()
        .insert(crewDocuments)
        .values({
          employerId: req.user!.id,
          workerId: body.workerId,
          label: body.label,
          expiresAt: body.expiresAt,
        })
        .returning();
      res.json({ ok: true, data: { document: toPublic(created!) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/expiring', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const horizon = new Date(Date.now() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await getDb()
      .select()
      .from(crewDocuments)
      .where(and(eq(crewDocuments.employerId, req.user!.id), lte(crewDocuments.expiresAt, horizon)))
      .orderBy(asc(crewDocuments.expiresAt))
      .limit(50);
    const workerIds = [...new Set(rows.map((r) => r.workerId))];
    const workers = workerIds.length
      ? await getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, workerIds))
      : [];
    const nameMap = new Map(workers.map((u) => [u.id, u.name]));
    const now = Date.now();
    res.json({
      ok: true,
      data: {
        documents: rows.map((r) => ({
          id: r.id,
          workerId: r.workerId,
          workerName: nameMap.get(r.workerId) ?? 'Worker',
          label: r.label,
          expiresAt: r.expiresAt.toISOString(),
          expired: r.expiresAt.getTime() < now,
        })),
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ query: z.object({ workerId: uuidId }) })),
  async (req, res, next) => {
    try {
      const rows = await getDb()
        .select()
        .from(crewDocuments)
        .where(
          and(
            eq(crewDocuments.employerId, req.user!.id),
            eq(crewDocuments.workerId, (req.query as { workerId: string }).workerId),
          ),
        )
        .orderBy(asc(crewDocuments.expiresAt));
      res.json({ ok: true, data: { documents: rows.map(toPublic) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('employer'),
  validate(z.object({ params: z.object({ id: uuidId }) })),
  async (req, res, next) => {
    try {
      await getDb()
        .delete(crewDocuments)
        .where(and(eq(crewDocuments.id, req.params.id!), eq(crewDocuments.employerId, req.user!.id)));
      res.json({ ok: true, data: { removed: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
