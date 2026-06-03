/**
 * /collect router. Mounted at /api/v1/collect. Seeker-only.
 *
 *   GET/PUT/DELETE /collect/bank          — payout bank account
 *   GET/POST       /collect/qr            — list / create collection QRs
 *   POST           /collect/qr/:ref/simulate-payment — dev stand-in for the
 *                                            PSP webhook (credits the wallet)
 *   GET            /collect/balance        — withdrawable balance
 *   POST           /collect/withdraw       — withdraw to the bank account
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { COLLECT_QR_KINDS } from './collect.model';
import {
  getBankAccount,
  setBankAccount,
  removeBankAccount,
  createQr,
  listQrs,
  recordPayment,
} from './collect.service';
import { getWithdrawableBalance, requestWithdrawal } from '@/modules/wallet/wallet.service';

const router = Router();

// ─── Bank account ─────────────────────────────────────────────────────────

router.get('/bank', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const bank = await getBankAccount(req.user!.id);
    res.json({ ok: true, data: { bank }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/bank',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        holderName: z.string().trim().min(2).max(120),
        accountNumber: z.string().trim().regex(/^\d{6,18}$/, 'Enter a valid account number'),
        ifsc: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid IFSC'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const bank = await setBankAccount(req.user!.id, req.body);
      res.json({ ok: true, data: { bank }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/bank', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    await removeBankAccount(req.user!.id);
    res.json({ ok: true, data: { removed: true }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Collection QRs ─────────────────────────────────────────────────────────

router.get('/qr', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const qrs = await listQrs(req.user!.id);
    res.json({ ok: true, data: { qrs }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/qr',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        kind: z.enum(COLLECT_QR_KINDS),
        amountPaise: z.number().int().min(100).max(10_000_000).nullable().optional(),
        applicationId: z
          .string()
          .regex(/^[0-9a-fA-F]{24}$/)
          .nullable()
          .optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const qr = await createQr(req.user!.id, req.body);
      res.status(201).json({ ok: true, data: { qr }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// Dev stand-in for the PSP webhook. Authenticated as the worker so the
// demo can credit their own wallet; a real deploy replaces this with a
// signed aggregator webhook.
router.post(
  '/qr/:ref/simulate-payment',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({ ref: z.string().min(4).max(64) }),
      body: z.object({
        amountPaise: z.number().int().min(100).max(10_000_000),
        payerName: z.string().trim().max(80).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { amountPaise: number; payerName?: string };
      const result = await recordPayment({
        ref: req.params.ref!,
        amountPaise: body.amountPaise,
        payerName: body.payerName,
      });
      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Balance + withdraw ─────────────────────────────────────────────────────

router.get('/balance', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const balancePaise = await getWithdrawableBalance(req.user!.id);
    res.json({ ok: true, data: { balancePaise }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/withdraw',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ body: z.object({ amountPaise: z.number().int().min(100) }) })),
  async (req, res, next) => {
    try {
      const txn = await requestWithdrawal({
        userId: req.user!.id,
        amountPaise: (req.body as { amountPaise: number }).amountPaise,
      });
      res.json({ ok: true, data: { transaction: txn }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
