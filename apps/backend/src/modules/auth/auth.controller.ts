/**
 * Auth controllers — thin HTTP layer. Each handler:
 *   1. Pulls the validated input from req.body / req.user.
 *   2. Calls the service.
 *   3. Sends the standard envelope.
 *
 * Errors propagate via next(err) and land in the global error middleware.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as authService from './auth.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

function clientContext(req: Request) {
  return {
    ip: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  };
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.register(req.body, clientContext(req));
    ok(req, res, 201, result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body, clientContext(req));
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tokens = await authService.refresh(req.body.refreshToken, clientContext(req));
    ok(req, res, 200, { tokens });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout(req.body.refreshToken);
    ok(req, res, 200, { success: true });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await authService.getMe(req.user.id);
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}
