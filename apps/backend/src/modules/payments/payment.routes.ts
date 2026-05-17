/**
 * /payments — UPI intent creation + mark-paid.
 *
 *   POST  /payments/intent             — employer creates an intent
 *   POST  /payments/:id/mark-paid      — employer confirms after paying
 *   POST  /payments/:id/cancel         — employer cancels a pending intent
 *   GET   /payments/mine               — both sides see their own history
 */
import { Router } from 'express';
import { Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { requireAuth, requireRole } from '@/middleware/auth';
import {
  PaymentIntentModel,
  type PaymentIntent,
} from './payment.model';
import { UserModel } from '@/modules/users/user.model';
import { WalletTransactionModel } from '@/modules/wallet/wallet.model';

const router = Router();

function toPublic(p: PaymentIntent & { _id: unknown }) {
  return {
    id: (p._id as Types.ObjectId).toString(),
    employerId: (p.employerId as Types.ObjectId).toString(),
    seekerId: (p.seekerId as Types.ObjectId).toString(),
    applicationId: p.applicationId ? p.applicationId.toString() : null,
    amountPaise: p.amountPaise,
    currency: p.currency,
    seekerVpa: p.seekerVpa,
    upiUri: p.upiUri,
    ref: p.ref,
    status: p.status,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt:
      (p as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/**
 * Build the UPI deep-link string per the spec. Apps like Google Pay,
 * PhonePe, Paytm, BHIM all honour this format.
 *
 *   upi://pay?pa=<vpa>&pn=<payee>&am=<amount>&tn=<note>&cu=INR&tr=<ref>
 */
function buildUpiUri(opts: {
  vpa: string;
  name: string;
  amountInr: number;
  ref: string;
  note: string;
}): string {
  const params = new URLSearchParams();
  params.set('pa', opts.vpa);
  params.set('pn', opts.name);
  params.set('am', opts.amountInr.toFixed(2));
  params.set('tn', opts.note);
  params.set('cu', 'INR');
  params.set('tr', opts.ref);
  return `upi://pay?${params.toString()}`;
}

router.post('/intent', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      seekerId?: string;
      applicationId?: string;
      amountPaise?: number;
      note?: string;
    };
    if (!body.seekerId || !body.amountPaise) {
      res.status(400).json({ error: 'seekerId and amountPaise are required' });
      return;
    }
    const amount = Number(body.amountPaise);
    if (!Number.isFinite(amount) || amount < 100 || amount > 10_000_000) {
      res.status(400).json({ error: 'Amount out of range.' });
      return;
    }
    const seeker = await UserModel.findById(body.seekerId)
      .select('name upiVpa phone')
      .lean();
    if (!seeker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    const vpa = (seeker as { upiVpa?: string | null }).upiVpa;
    if (!vpa) {
      res.status(400).json({
        error: "Worker hasn't added a UPI ID yet. Ask them to add one in Profile → Edit profile.",
      });
      return;
    }
    const ref = `DDP${randomBytes(5).toString('hex').toUpperCase()}`;
    const upiUri = buildUpiUri({
      vpa,
      name: ((seeker as { name?: string }).name as string | undefined) ?? 'Worker',
      amountInr: amount / 100,
      ref,
      note: (body.note ?? 'Doondo wage').slice(0, 80),
    });
    const created = await PaymentIntentModel.create({
      employerId: new Types.ObjectId(req.user!.id),
      seekerId: new Types.ObjectId(body.seekerId),
      applicationId: body.applicationId ? new Types.ObjectId(body.applicationId) : null,
      amountPaise: Math.round(amount),
      seekerVpa: vpa.toLowerCase(),
      upiUri,
      ref,
      status: 'pending',
    });
    res.json({ intent: toPublic(created.toObject() as PaymentIntent & { _id: unknown }) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/mark-paid',
  requireAuth,
  requireRole('employer'),
  async (req, res, next) => {
    try {
      const p = await PaymentIntentModel.findOne({
        _id: req.params.id,
        employerId: new Types.ObjectId(req.user!.id),
      });
      if (!p) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (p.status !== 'pending' && p.status !== 'in_progress') {
        res.status(400).json({ error: `Already ${p.status}.` });
        return;
      }
      p.status = 'paid';
      p.paidAt = new Date();
      await p.save();
      // Record a wallet credit on the worker's side so the payment shows
      // up in their earnings ledger.
      await WalletTransactionModel.create({
        userId: p.seekerId,
        amount: p.amountPaise,
        currency: p.currency,
        kind: 'hire_payment',
        status: 'settled',
        description: `UPI payment from employer · ref ${p.ref}`,
        applicationId: p.applicationId,
        settledAt: p.paidAt,
      } as Parameters<typeof WalletTransactionModel.create>[0]);
      res.json({ intent: toPublic(p.toObject() as PaymentIntent & { _id: unknown }) });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/cancel', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const p = await PaymentIntentModel.findOne({
      _id: req.params.id,
      employerId: new Types.ObjectId(req.user!.id),
    });
    if (!p) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (p.status === 'paid') {
      res.status(400).json({ error: 'Already paid.' });
      return;
    }
    p.status = 'cancelled';
    await p.save();
    res.json({ intent: toPublic(p.toObject() as PaymentIntent & { _id: unknown }) });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const uid = new Types.ObjectId(req.user!.id);
    const rows = await PaymentIntentModel.find({
      $or: [{ employerId: uid }, { seekerId: uid }],
    })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    res.json({
      intents: rows.map((r) => toPublic(r as PaymentIntent & { _id: unknown })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
