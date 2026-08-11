/**
 * /payments — UPI intent creation + mark-paid.
 *
 *   POST  /payments/intent             — employer creates an intent
 *   POST  /payments/:id/mark-paid      — employer confirms after paying
 *   POST  /payments/:id/cancel         — employer cancels a pending intent
 *   GET   /payments/mine               — both sides see their own history
 */
import { Router } from 'express';
import { and, desc, eq, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { requireAuth, requireRole } from '@/middleware/auth';
import { getDb } from '@/db/client';
import { paymentIntents, users, walletTransactions, type PaymentIntentStatus } from '@/db/schema';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PaymentIntentRow = typeof paymentIntents.$inferSelect;

function toPublic(p: PaymentIntentRow) {
  return {
    id: p.id,
    employerId: p.employerId,
    seekerId: p.seekerId,
    applicationId: p.applicationId,
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
    const [seeker] = await getDb()
      .select({ name: users.name, upiVpa: users.upiVpa })
      .from(users)
      .where(eq(users.id, body.seekerId))
      .limit(1);
    if (!seeker) {
      res.status(404).json({ error: 'Worker not found' });
      return;
    }
    const vpa = seeker.upiVpa;
    if (!vpa) {
      res.status(400).json({
        error: "Worker hasn't added a UPI ID yet. Ask them to add one in Profile → Edit profile.",
      });
      return;
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
        seekerId: body.seekerId,
        applicationId: body.applicationId ?? null,
        amountPaise: Math.round(amount),
        seekerVpa: vpa.toLowerCase(),
        upiUri,
        ref,
        status: 'pending',
      })
      .returning();
    res.json({ intent: toPublic(created!) });
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
      if (!p) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (p.status !== 'pending' && p.status !== 'in_progress') {
        res.status(400).json({ error: `Already ${p.status}.` });
        return;
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
      try {
        await db
          .insert(walletTransactions)
          .values({
            userId: p.seekerId,
            amount: p.amountPaise,
            currency: p.currency,
            kind: 'hire_payment',
            status: 'settled',
            description: `UPI payment from employer · ref ${p.ref}`,
            applicationId: p.applicationId,
            settledAt: paidAt,
          })
          .onConflictDoNothing();
      } catch {
        // Duplicate or transient — payment intent itself is still marked paid.
      }
      res.json({ intent: toPublic(updated!) });
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
    if (!p) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (p.status === 'paid') {
      res.status(400).json({ error: 'Already paid.' });
      return;
    }
    const [updated] = await db
      .update(paymentIntents)
      .set({ status: 'cancelled' as PaymentIntentStatus })
      .where(eq(paymentIntents.id, p.id))
      .returning();
    res.json({ intent: toPublic(updated!) });
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
    res.json({ intents: rows.map(toPublic) });
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
 *
 * Uses the standard `{ ok, data, requestId }` envelope so the mobile
 * `apiRequest` unwraps it like every other call.
 */
router.get('/:id/receipt', requireAuth, async (req, res, next) => {
  try {
    if (!req.params.id || !UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid payment id' });
      return;
    }
    const uid = req.user!.id;
    const db = getDb();
    const [p] = await db
      .select()
      .from(paymentIntents)
      .where(and(eq(paymentIntents.id, req.params.id), or(eq(paymentIntents.employerId, uid), eq(paymentIntents.seekerId, uid))))
      .limit(1);
    if (!p) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (p.status !== 'paid' || !p.paidAt) {
      res.status(400).json({ error: 'Receipt is available once the payment is marked paid.' });
      return;
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

    res.json({ ok: true, data: { receipt }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

export default router;
