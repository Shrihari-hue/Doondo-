/**
 * Wallet controller — read-only endpoint for the seeker's earnings.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
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
