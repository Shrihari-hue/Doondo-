/**
 * Worker Service Profile HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './workerServiceProfile.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** GET /me/quick-work-services */
export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const profiles = await service.listMine(req.user.id);
    ok(req, res, 200, { profiles });
  } catch (err) {
    next(err);
  }
}

/** POST /me/quick-work-services */
export async function setMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const profiles = await service.setMine(req.user.id, req.body.serviceIds as string[]);
    ok(req, res, 200, { profiles });
  } catch (err) {
    next(err);
  }
}
