/**
 * /me controller — thin HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as meService from './me.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await meService.updateProfile(req.user.id, req.body);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}

export async function updateLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await meService.updateLocation(req.user.id, req.body);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}

export async function registerPushToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await meService.registerPushToken(req.user.id, req.body.token as string);
    ok(req, res, 200, { registered: true });
  } catch (err) {
    next(err);
  }
}

export async function clearPushToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await meService.clearPushToken(req.user.id, req.body.token as string);
    ok(req, res, 200, { cleared: true });
  } catch (err) {
    next(err);
  }
}

export async function updateEmployerLocation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await meService.updateEmployerLocation(req.user.id, req.body);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}

export async function uploadResume(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await meService.uploadResume(req.user.id, req.body);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}

export async function removeResume(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await meService.removeResume(req.user.id);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}
