/**
 * /me/alerts HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as alertService from './alert.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const alerts = await alertService.listForUser(req.user.id);
    ok(req, res, 200, { alerts });
  } catch (err) {
    next(err);
  }
}

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const alert = await alertService.createForUser(req.user.id, req.body);
    ok(req, res, 201, { alert });
  } catch (err) {
    next(err);
  }
}

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const alert = await alertService.updateForUser(
      req.user.id,
      req.params.id!,
      req.body,
    );
    ok(req, res, 200, { alert });
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await alertService.deleteForUser(req.user.id, req.params.id!);
    ok(req, res, 200, { deleted: true });
  } catch (err) {
    next(err);
  }
}
