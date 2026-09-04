/**
 * /payments — UPI intent creation + mark-paid.
 *
 *   POST  /payments/intent             — employer creates an intent
 *   POST  /payments/:id/mark-paid      — employer confirms after paying
 *   POST  /payments/:id/cancel         — employer cancels a pending intent
 *   GET   /payments/mine               — both sides see their own history
 *
 * Every response here uses the standard `{ ok, data, requestId }` /
 * `{ ok:false, error }` envelope `apiRequest` (mobile) expects — this file
 * previously returned raw `{ intent }` / `{ error }` shapes on every route
 * except `/receipt`, which meant `apiRequest` treated every payment
 * call (success AND failure) as a malformed response and threw
 * `UNKNOWN_ERROR` regardless of what the server actually did. Found live
 * while wiring Quick Work payments; fixed for both Jobs and Quick Work
 * since it's the same route file.
 */
import { Router } from 'express';
import { and, desc, eq, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { requireAuth, requireRole } from '@/middleware/auth';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { paymentIntents, quickWorkRequests, users, walletTransactions, type PaymentIntentStatus } from '@/db/schema';
import { markPaid as markQuickWorkPaid } from '@/modules/quickWork/quickWork.service';
import { logger } from '@/lib/logger';
import type { Request, Response } from 'express';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaymentIntentRow = typeof paymentIntents.$inferSelect;

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

function toPublic(p: PaymentIntentRow) {
  return {
    id: p.id,
    employerId: p.employerId,
    seekerId: p.seekerId,
    applicationId: p.applicationId,
    quickWorkRequestId: p.quickWorkRequestId,
    amountPaise: p.amountPaise,
    currency: p.currency,
    seekerVpa: p.seekerVpa,
    upiUri: p.upiUri,
    ref: p.ref,
    status: p.status,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
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
      quickWorkRequestId?: string;
      amountPaise?: number;
      note?: string;
    };

    let seekerId = body.seekerId;
    let amount = Number(body.amountPaise);
    let quickWorkRequestId: string | null = null;

    // Quick Work — employer-plan.md §17: seekerId and the amount are
    // NEVER trusted from the client here. Both are derived server-side
    // from the request row (matchedWorkerId, finalPrice) — a customer's
    // app cannot name its own price or redirect payment to someone else.
    if (body.quickWorkRequestId) {
      const [qw] = await getDb()
        .select()
        .from(quickWorkRequests)
        .where(eq(quickWorkRequests.id, body.quickWorkRequestId))
        .limit(1);
      if (!qw) throw errors.notFound('Quick Work request not found.');
      if (qw.employerId !== req.user!.id) throw errors.forbidden();
      if (qw.status !== 'payment_pending') {
        throw errors.conflict(`This request is ${qw.status}, not ready for payment.`);
      }
      if (!qw.matchedWorkerId || qw.finalPrice == null) {
        throw errors.conflict('This request has no final price to pay yet.');
      }
      // Gap #4 — price approval: the employer must explicitly approve the
      // worker's submitted finalPrice (POST /:id/approve-price) before any
      // payment intent can be created for it. This is the actual
      // enforcement point — "approving" on its own moves no money, it just
      // unlocks this check.
      if (!qw.priceApprovedAt) throw errors.quickWorkPriceNotApproved();
      seekerId = qw.matchedWorkerId;
      amount = qw.finalPrice;
      quickWorkRequestId = qw.id;
    }

    if (!seekerId || !Number.isFinite(amount)) {
      throw errors.validation({ seekerId, amountPaise: body.amountPaise }, 'seekerId and amountPaise are required.');
    }
    if (amount < 100 || amount > 10_000_000) {
      throw errors.validation({ amountPaise: amount }, 'Amount out of range.');
    }
    const [seeker] = await getDb()
      .select({ name: users.name, upiVpa: users.upiVpa })
      .from(users)
      .where(eq(users.id, seekerId))
      .limit(1);
    if (!seeker) throw errors.notFound('Worker not found.');
    const vpa = seeker.upiVpa;
    if (!vpa) {
      throw errors.conflict("Worker hasn't added a UPI ID yet. Ask them to add one in Profile → Edit profile.");
    }
    const ref = `DDP${randomBytes(5).toString('hex').toUpperCase()}`;
    const upiUri = buildUpiUri({
      vpa,
      name: seeker.name ?? 'Worker',
      amountInr: amount / 100,
      ref,
      note: (body.note ?? 'Doondo wage').slice(0, 80),
    });
    const [created] = await getDb()
      .insert(paymentIntents)
      .values({
        employerId: req.user!.id,
        seekerId,
        applicationId: quickWorkRequestId ? null : (body.applicationId ?? null),
        quickWorkRequestId,
        amountPaise: Math.round(amount),
        seekerVpa: vpa.toLowerCase(),
        upiUri,
        ref,
        status: 'pending',
      })
      .returning();
    ok(req, res, 201, { intent: toPublic(created!) });
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
      const db = getDb();
      const [p] = await db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.id, req.params.id!), eq(paymentIntents.employerId, req.user!.id)))
        .limit(1);
      if (!p) throw errors.notFound();
      if (p.status !== 'pending' && p.status !== 'in_progress') {
        throw errors.conflict(`Already ${p.status}.`);
      }
      const paidAt = new Date();
      const [updated] = await db
        .update(paymentIntents)
        .set({ status: 'paid', paidAt })
        .where(eq(paymentIntents.id, p.id))
        .returning();
      // Record a wallet credit on the worker's side so the payment shows
      // up in their earnings ledger. onConflictDoNothing — wallet_transactions
      // has a partial unique index on (userId, applicationId, kind:
      // hire_payment) so re-marking a paid intent twice is a no-op, not a 500.
      // Quick Work payments use their own `quick_work_payment` kind so
      // they're distinguishable in the ledger, but land in the exact same
      // EarningsScreen list — no separate wallet UI (seeker-plan.md §19).
      try {
        await db
          .insert(walletTransactions)
          .values({
            userId: p.seekerId,
            amount: p.amountPaise,
            currency: p.currency,
            kind: p.quickWorkRequestId ? 'quick_work_payment' : 'hire_payment',
            status: 'settled',
            description: p.quickWorkRequestId
              ? `Quick Work payment from customer · ref ${p.ref}`
              : `UPI payment from employer · ref ${p.ref}`,
            applicationId: p.applicationId,
            quickWorkRequestId: p.quickWorkRequestId,
            settledAt: paidAt,
          })
          .onConflictDoNothing();
      } catch {
        // Duplicate or transient — payment intent itself is still marked paid.
      }

      if (p.quickWorkRequestId) {
        try {
          await markQuickWorkPaid(p.quickWorkRequestId);
        } catch (err) {
          logger.warn({ err, quickWorkRequestId: p.quickWorkRequestId }, 'quick work PAID transition failed after payment');
        }
      }

      ok(req, res, 200, { intent: toPublic(updated!) });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/cancel', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const db = getDb();
    const [p] = await db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.id, req.params.id!), eq(paymentIntents.employerId, req.user!.id)))
      .limit(1);
    if (!p) throw errors.notFound();
    if (p.status === 'paid') throw errors.conflict('Already paid.');
    const [updated] = await db
      .update(paymentIntents)
      .set({ status: 'cancelled' as PaymentIntentStatus })
      .where(eq(paymentIntents.id, p.id))
      .returning();
    ok(req, res, 200, { intent: toPublic(updated!) });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const uid = req.user!.id;
    const rows = await getDb()
      .select()
      .from(paymentIntents)
      .where(or(eq(paymentIntents.employerId, uid), eq(paymentIntents.seekerId, uid)))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(40);
    ok(req, res, 200, { intents: rows.map(toPublic) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /payments/:id/receipt — a clean, GST-friendly payment receipt for a
 * settled payment. Small employers have never had a paper trail for the
 * cash/UPI wages they pay; this is the per-transaction record they can
 * keep for their books.
 *
 * Either party on the payment can pull their own receipt. The receipt is
 * only available once the payment is `paid` — there is nothing to receipt
 * before money has moved. The payer block carries the employer's company
 * name and GSTIN (when on file) so the document is usable as a books
 * entry; it is explicitly a payment record, not a tax invoice.
 */
router.get('/:id/receipt', requireAuth, async (req, res, next) => {
  try {
    if (!req.params.id || !UUID_RE.test(req.params.id)) throw errors.validation({ id: req.params.id }, 'Invalid payment id.');
    const uid = req.user!.id;
    const db = getDb();
    const [p] = await db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.id, req.params.id), or(eq(paymentIntents.employerId, uid), eq(paymentIntents.seekerId, uid))))
      .limit(1);
    if (!p) throw errors.notFound();
    if (p.status !== 'paid' || !p.paidAt) {
      throw errors.conflict('Receipt is available once the payment is marked paid.');
    }

    const [[employer], [seeker]] = await Promise.all([
      db
        .select({ name: users.name, companyName: users.companyName, gstin: users.gstin, employerLocation: users.employerLocation })
        .from(users)
        .where(eq(users.id, p.employerId))
        .limit(1),
      db.select({ name: users.name }).from(users).where(eq(users.id, p.seekerId)).limit(1),
    ]);

    const cityLine = employer?.employerLocation
      ? [employer.employerLocation.area, employer.employerLocation.city].filter(Boolean).join(', ')
      : null;

    const receipt = {
      receiptNo: p.ref,
      issuedAt: p.paidAt.toISOString(),
      payer: {
        name: employer?.companyName || employer?.name || 'Employer',
        gstin: employer?.gstin ?? null,
        location: cityLine || null,
      },
      payee: {
        name: seeker?.name ?? 'Worker',
        upiVpa: p.seekerVpa,
      },
      amountPaise: p.amountPaise,
      currency: p.currency,
      method: 'UPI',
      reference: p.ref,
      /** Plain-language line so the document isn't mistaken for a tax invoice. */
      disclaimer: 'This is a payment record, not a tax invoice.',
    };

    ok(req, res, 200, { receipt });
  } catch (err) {
    next(err);
  }
});

export default router;
