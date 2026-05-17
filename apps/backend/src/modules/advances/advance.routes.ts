/**
 * /me/advances — seeker requests + history.
 *
 *   POST   /me/advances             — create a new request (capped at ₹5,000)
 *   GET    /me/advances             — list mine (newest first)
 *   PATCH  /me/advances/:id/cancel  — seeker cancels while pending
 *
 * Approval / payout transitions are ops-only and happen via direct
 * Mongo writes for now — no admin UI yet.
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { AdvanceRequestModel, type AdvanceRequest } from './advance.model';

const router = Router();

function toPublic(r: AdvanceRequest & { _id: unknown }) {
  return {
    id: (r._id as unknown as Types.ObjectId).toString(),
    amountPaise: r.amountPaise,
    currency: r.currency,
    reason: r.reason,
    status: r.status,
    applicationId: r.applicationId ? r.applicationId.toString() : null,
    repayBy: r.repayBy ? r.repayBy.toISOString() : null,
    opsNote: r.opsNote ?? null,
    createdAt: (r as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
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
    const created = await AdvanceRequestModel.create({
      seekerId: new Types.ObjectId(req.user!.id),
      amountPaise: Math.round(amount),
      reason: (body.reason ?? '').slice(0, 400),
      applicationId: body.applicationId ? new Types.ObjectId(body.applicationId) : null,
      repayBy: body.repayBy ? new Date(body.repayBy) : null,
    });
    res.json({ advance: toPublic(created.toObject() as AdvanceRequest & { _id: unknown }) });
  } catch (err) {
    next(err);
  }
});

router.get('/advances', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const rows = await AdvanceRequestModel.find({
      seekerId: new Types.ObjectId(req.user!.id),
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({
      advances: rows.map((r) => toPublic(r as AdvanceRequest & { _id: unknown })),
    });
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
      const row = await AdvanceRequestModel.findOne({
        _id: req.params.id,
        seekerId: new Types.ObjectId(req.user!.id),
      });
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (row.status !== 'requested') {
        res.status(400).json({ error: `Cannot cancel — already ${row.status}.` });
        return;
      }
      row.status = 'cancelled';
      await row.save();
      res.json({
        advance: toPublic(row.toObject() as AdvanceRequest & { _id: unknown }),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
