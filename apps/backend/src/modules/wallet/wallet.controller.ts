/**
 * Wallet controller — read-only endpoint for the seeker's earnings.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors, AppError } from '@/lib/errors';
import * as walletService from './wallet.service';

export async function listMyEarnings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const [transactions, summary] = await Promise.all([
      walletService.listForUser(req.user.id, limit),
      walletService.summarize(req.user.id),
    ]);
    res.json({
      ok: true,
      data: { transactions, summary },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function logCashEarning(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = req.body as {
      amount?: number;
      description?: string;
      workedOn?: string;
    };
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'amount must be a positive number (paise)',
        status: 400,
      });
    }
    if (!body.description || body.description.trim().length === 0) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'description is required',
        status: 400,
      });
    }
    const transaction = await walletService.recordCashLog({
      userId: req.user.id,
      amount: Math.round(body.amount),
      description: body.description,
      workedOn: body.workedOn,
    });
    res.status(201).json({ ok: true, data: { transaction }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function deleteCashEarning(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const id = req.params.id;
    if (!id) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'id is required',
        status: 400,
      });
    }
    const deleted = await walletService.deleteCashLog(req.user.id, id);
    res.json({ ok: true, data: { deleted }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}
