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
import { and, eq, sql } from 'drizzle-orm';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getDb } from '@/db/client';
import { favoriteEmployers } from '@/db/schema';

const router = Router();

const uuidId = z.string().uuid('Invalid employer id');

router.get('/me/count', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const [row] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(favoriteEmployers)
      .where(eq(favoriteEmployers.employerId, req.user!.id));
    res.json({ ok: true, data: { count: row?.count ?? 0 }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:employerId',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ employerId: uuidId }) })),
  async (req, res, next) => {
    try {
      const [row] = await getDb()
        .select({ id: favoriteEmployers.id })
        .from(favoriteEmployers)
        .where(
          and(
            eq(favoriteEmployers.workerId, req.user!.id),
            eq(favoriteEmployers.employerId, req.params.employerId!),
          ),
        )
        .limit(1);
      res.json({ ok: true, data: { favorited: Boolean(row) }, requestId: req.id });
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
      params: z.object({ employerId: uuidId }),
      body: z.object({ on: z.boolean() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const workerId = req.user!.id;
      const employerId = req.params.employerId!;
      const on = (req.body as { on: boolean }).on;
      if (on) {
        await getDb()
          .insert(favoriteEmployers)
          .values({ workerId, employerId })
          .onConflictDoNothing();
      } else {
        await getDb()
          .delete(favoriteEmployers)
          .where(and(eq(favoriteEmployers.workerId, workerId), eq(favoriteEmployers.employerId, employerId)));
      }
      res.json({ ok: true, data: { favorited: on }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
