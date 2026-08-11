/**
 * HiringRequest HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './hiringRequest.service';
import type { HiringRequestStatus } from '@/db/schema';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** POST /hiring-requests — employer invites a worker to a job. */
export async function send(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.send({
      employerId: req.user.id,
      seekerId: req.body.seekerId as string,
      jobId: req.body.jobId as string,
      message: (req.body.message as string | null | undefined) ?? null,
    });
    ok(req, res, 201, { request });
  } catch (err) {
    next(err);
  }
}

/** GET /hiring-requests/received — the worker's inbox. */
export async function listReceived(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const status = (req.query as { status?: HiringRequestStatus }).status;
    const requests = await service.listForSeeker(req.user.id, status);
    ok(req, res, 200, { requests });
  } catch (err) {
    next(err);
  }
}

/** GET /hiring-requests/sent — the employer's sent list. */
export async function listSent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const requests = await service.listForEmployer(req.user.id);
    ok(req, res, 200, { requests });
  } catch (err) {
    next(err);
  }
}

/** POST /hiring-requests/:id/accept — worker accepts. */
export async function accept(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.respond({
      requestId: req.params.id as string,
      seekerId: req.user.id,
      action: 'accept',
    });
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /hiring-requests/:id/decline — worker declines. */
export async function decline(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.respond({
      requestId: req.params.id as string,
      seekerId: req.user.id,
      action: 'decline',
    });
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /hiring-requests/:id/withdraw — employer cancels a pending request. */
export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.withdraw({
      requestId: req.params.id as string,
      employerId: req.user.id,
    });
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}
