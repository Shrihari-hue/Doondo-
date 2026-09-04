/**
 * Quick Work Offers HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as offers from './quickWorkOffers.service';
import * as requests from './quickWork.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** GET /quick-work/offers/incoming */
export async function listIncoming(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const list = await offers.listIncoming(req.user.id);
    ok(req, res, 200, { offers: list });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/offers/:id/accept */
export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await offers.acceptOffer(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/offers/:id/decline */
export async function decline(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await offers.declineOffer(req.params.id as string, req.user.id);
    ok(req, res, 200, { declined: true });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/retry-matching */
export async function retryMatching(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await requests.retryMatching(req.params.id as string, req.user.id);
    ok(req, res, 200, { retried: true });
  } catch (err) {
    next(err);
  }
}
