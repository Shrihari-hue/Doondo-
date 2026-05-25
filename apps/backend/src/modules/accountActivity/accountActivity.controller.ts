/**
 * Account-activity HTTP layer — thin wrapper around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './accountActivity.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/**
 * POST /accounts/activity — activity summary for the caller's *other*
 * accounts on this device. The request must be authenticated (the active
 * account); the body carries the refresh tokens of the other accounts.
 */
export async function summary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const refreshTokens = (req.body.refreshTokens as string[]) ?? [];
    const summaries = await service.getActivitySummaries(refreshTokens);
    ok(req, res, 200, { summaries });
  } catch (err) {
    next(err);
  }
}
