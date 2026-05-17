/**
 * /me/insurance — opt-in / opt-out + status read.
 *
 *   GET    /me/insurance       — current subscription (or null)
 *   POST   /me/insurance       — opt in (Standard tier only for now)
 *   DELETE /me/insurance       — cancel
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import {
  InsuranceSubscriptionModel,
  type InsuranceSubscription,
} from './insurance.model';

const STANDARD_PREMIUM_PAISE = 4_900; // ₹49 / month

const router = Router();

function toPublic(s: InsuranceSubscription & { _id: unknown }) {
  return {
    id: (s._id as unknown as Types.ObjectId).toString(),
    tier: s.tier,
    monthlyPremiumPaise: s.monthlyPremiumPaise,
    status: s.status,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    lastPaidAt: s.lastPaidAt ? s.lastPaidAt.toISOString() : null,
    createdAt:
      (s as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

router.get('/insurance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const s = await InsuranceSubscriptionModel.findOne({
      seekerId: new Types.ObjectId(req.user!.id),
    }).lean();
    res.json({
      subscription: s ? toPublic(s as InsuranceSubscription & { _id: unknown }) : null,
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
    const seekerId = new Types.ObjectId(req.user!.id);
    let s = await InsuranceSubscriptionModel.findOne({ seekerId });
    if (s) {
      // Re-opt-in for a cancelled subscription resurrects it.
      if (s.status === 'cancelled') s.status = 'pending';
      await s.save();
    } else {
      s = await InsuranceSubscriptionModel.create({
        seekerId,
        tier: 'standard',
        monthlyPremiumPaise: STANDARD_PREMIUM_PAISE,
        status: 'pending',
      });
    }
    res.json({
      subscription: toPublic(s.toObject() as InsuranceSubscription & { _id: unknown }),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/insurance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const s = await InsuranceSubscriptionModel.findOne({
      seekerId: new Types.ObjectId(req.user!.id),
    });
    if (s) {
      s.status = 'cancelled';
      await s.save();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
