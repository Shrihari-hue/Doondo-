/**
 * /me/insurance — opt-in / opt-out + status read.
 *
 *   GET    /me/insurance       — current subscription (or null)
 *   POST   /me/insurance       — opt in (Standard tier only for now)
 *   DELETE /me/insurance       — cancel
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '@/middleware/auth';
import { getDb } from '@/db/client';
import { insuranceSubscriptions } from '@/db/schema';

const STANDARD_PREMIUM_PAISE = 4_900; // ₹49 / month

const router = Router();

type InsuranceRow = typeof insuranceSubscriptions.$inferSelect;

function toPublic(s: InsuranceRow) {
  return {
    id: s.id,
    tier: s.tier,
    monthlyPremiumPaise: s.monthlyPremiumPaise,
    status: s.status,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    lastPaidAt: s.lastPaidAt ? s.lastPaidAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get('/insurance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const [s] = await getDb()
      .select()
      .from(insuranceSubscriptions)
      .where(eq(insuranceSubscriptions.seekerId, req.user!.id))
      .limit(1);
    res.json({
      subscription: s ? toPublic(s) : null,
      tier: {
        name: 'standard',
        monthlyPremiumPaise: STANDARD_PREMIUM_PAISE,
        deathCoverPaise: 200_00_000,
        hospitalCashPerDayPaise: 50_000,
        hospitalCashMaxDaysPerYear: 30,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/insurance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const seekerId = req.user!.id;
    const [existing] = await getDb()
      .select()
      .from(insuranceSubscriptions)
      .where(eq(insuranceSubscriptions.seekerId, seekerId))
      .limit(1);
    let s: InsuranceRow;
    if (existing) {
      // Re-opt-in for a cancelled subscription resurrects it.
      if (existing.status === 'cancelled') {
        const [updated] = await getDb()
          .update(insuranceSubscriptions)
          .set({ status: 'pending' })
          .where(eq(insuranceSubscriptions.id, existing.id))
          .returning();
        s = updated!;
      } else {
        s = existing;
      }
    } else {
      const [created] = await getDb()
        .insert(insuranceSubscriptions)
        .values({
          seekerId,
          tier: 'standard',
          monthlyPremiumPaise: STANDARD_PREMIUM_PAISE,
          status: 'pending',
        })
        .returning();
      s = created!;
    }
    res.json({ subscription: toPublic(s) });
  } catch (err) {
    next(err);
  }
});

router.delete('/insurance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    await getDb()
      .update(insuranceSubscriptions)
      .set({ status: 'cancelled' })
      .where(eq(insuranceSubscriptions.seekerId, req.user!.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
