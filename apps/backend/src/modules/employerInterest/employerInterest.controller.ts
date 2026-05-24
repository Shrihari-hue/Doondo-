/**
 * EmployerInterest HTTP layer — thin wrappers around the service.
 *
 * Routes are wired inline from v1.ts because they straddle two URL
 * spaces: the worker side lives under /employers/:id/interest and the
 * employer side under /me/interested-workers.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './employerInterest.service';
import type { EmployerInterestStatus } from './employerInterest.model';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** POST /employers/:id/interest — worker expresses interest in an employer. */
export async function express(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const interest = await service.express({
      seekerId: req.user.id,
      employerId: req.params.id as string,
      message: (req.body?.message as string | null | undefined) ?? null,
    });
    ok(req, res, 201, { interest });
  } catch (err) {
    next(err);
  }
}

/** DELETE /employers/:id/interest — worker withdraws their interest. */
export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await service.withdraw({
      seekerId: req.user.id,
      employerId: req.params.id as string,
    });
    ok(req, res, 200, { withdrawn: true });
  } catch (err) {
    next(err);
  }
}

/** GET /employers/:id/interest/mine — has the worker already expressed? */
export async function getMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const interest = await service.getMine({
      seekerId: req.user.id,
      employerId: req.params.id as string,
    });
    ok(req, res, 200, { interest });
  } catch (err) {
    next(err);
  }
}

/** GET /me/interested-workers — the employer's inbound list. */
export async function listForEmployer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const status = (req.query as { status?: EmployerInterestStatus }).status;
    const interests = await service.listForEmployer(req.user.id, status);
    ok(req, res, 200, { interests });
  } catch (err) {
    next(err);
  }
}

/** POST /me/interested-workers/:id/viewed — employer opens an interest row. */
export async function markViewed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const interest = await service.markViewed({
      interestId: req.params.id as string,
      employerId: req.user.id,
    });
    ok(req, res, 200, { interest });
  } catch (err) {
    next(err);
  }
}

/** POST /me/interested-workers/:id/archive — employer clears an interest row. */
export async function archive(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const interest = await service.archive({
      interestId: req.params.id as string,
      employerId: req.user.id,
    });
    ok(req, res, 200, { interest });
  } catch (err) {
    next(err);
  }
}
