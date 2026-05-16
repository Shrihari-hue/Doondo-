/**
 * Availability HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './availability.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function publish(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const availability = await service.publish({
      seekerId: req.user.id,
      ...req.body,
    });
    ok(req, res, 201, { availability });
  } catch (err) {
    next(err);
  }
}

export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await service.withdraw(req.user.id);
    ok(req, res, 200, { withdrawn: true });
  } catch (err) {
    next(err);
  }
}

export async function getMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const availability = await service.getMine(req.user.id);
    ok(req, res, 200, { availability });
  } catch (err) {
    next(err);
  }
}

export async function nearby(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const availabilities = await service.findNearby(req.query as never);
    ok(req, res, 200, { availabilities });
  } catch (err) {
    next(err);
  }
}
