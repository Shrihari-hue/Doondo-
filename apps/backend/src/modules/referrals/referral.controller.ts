/**
 * Referrals HTTP layer — seeker reads of their own referrals.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './referral.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function listMyReferrals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const [referrals, summary] = await Promise.all([
      service.listForReferrer(req.user.id),
      service.summarizeForReferrer(req.user.id),
    ]);
    ok(req, res, 200, { referrals, summary });
  } catch (err) {
    next(err);
  }
}
