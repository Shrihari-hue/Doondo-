/**
 * /me/advances — seeker requests + history.
 *
 *   POST   /me/advances             — create a new request (capped at ₹5,000)
 *   GET    /me/advances             — list mine (newest first)
 *   PATCH  /me/advances/:id/cancel  — seeker cancels while pending
 *
 * Approval / payout transitions are ops-only and happen via direct
 * DB writes for now — no admin UI yet.
 */
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { advanceRequests } from '@/db/schema';
import { requireAuth, requireRole } from '@/middleware/auth';

const router = Router();

type AdvanceRow = typeof advanceRequests.$inferSelect;

function toPublic(r: AdvanceRow) {
  return {
    id: r.id,
    amountPaise: r.amountPaise,
    currency: r.currency,
    reason: r.reason,
    status: r.status,
    applicationId: r.applicationId,
    repayBy: r.repayBy ? r.repayBy.toISOString() : null,
    opsNote: r.opsNote ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.post('/advances', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      amountPaise?: number;
      reason?: string;
      applicationId?: string;
      repayBy?: string;
    };
    const amount = Number(body.amountPaise);
    if (!Number.isFinite(amount) || amount < 50_000 || amount > 500_000) {
      res.status(400).json({ error: 'Amount must be between ₹500 and ₹5,000.' });
      return;
    }
    const [created] = await getDb()
      .insert(advanceRequests)
      .values({
        seekerId: req.user!.id,
        amountPaise: Math.round(amount),
        reason: (body.reason ?? '').slice(0, 400),
        applicationId: body.applicationId ?? null,
        repayBy: body.repayBy ? new Date(body.repayBy) : null,
      })
      .returning();
    res.json({ advance: toPublic(created!) });
  } catch (err) {
    next(err);
  }
});

router.get('/advances', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const rows = await getDb()
      .select()
      .from(advanceRequests)
      .where(eq(advanceRequests.seekerId, req.user!.id))
      .orderBy(desc(advanceRequests.createdAt))
      .limit(20);
    res.json({ advances: rows.map(toPublic) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/advances/:id/cancel',
  requireAuth,
  requireRole('seeker'),
  async (req, res, next) => {
    try {
      const [row] = await getDb()
        .select()
        .from(advanceRequests)
        .where(
          and(eq(advanceRequests.id, req.params.id!), eq(advanceRequests.seekerId, req.user!.id)),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (row.status !== 'requested') {
        res.status(400).json({ error: `Cannot cancel — already ${row.status}.` });
        return;
      }
      const [updated] = await getDb()
        .update(advanceRequests)
        .set({ status: 'cancelled' })
        .where(eq(advanceRequests.id, row.id))
        .returning();
      res.json({ advance: toPublic(updated!) });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
