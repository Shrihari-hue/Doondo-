/**
 * Jobs controller — thin HTTP layer over the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as jobService from './job.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function nearby(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // req.query is already validated and coerced by validate middleware.
    const result = await jobService.findNearby(req.query as never);
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function jobLocations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const locations = await jobService.listJobLocations(q);
    ok(req, res, 200, { locations });
  } catch (err) {
    next(err);
  }
}

export async function today(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobService.findToday(req.query as never);
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Preview — public, returns up to 5 jobs for the unauthenticated
 * role-picker flow ("60-second first match"). Body delegates to the
 * service which handles trade bias + verified employer boost.
 */
export async function preview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await jobService.findFirstMatch(req.query as never);
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function thisWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobService.findThisWeek(req.query as never);
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await jobService.findById(req.params.id!);
    ok(req, res, 200, { job });
  } catch (err) {
    next(err);
  }
}

export async function save(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await jobService.saveJob(req.user.id, req.params.id!);
    ok(req, res, 200, { saved: true });
  } catch (err) {
    next(err);
  }
}

export async function unsave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    await jobService.unsaveJob(req.user.id, req.params.id!);
    ok(req, res, 200, { saved: false });
  } catch (err) {
    next(err);
  }
}

export async function listSaved(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const jobs = await jobService.listSaved(req.user.id);
    ok(req, res, 200, { jobs });
  } catch (err) {
    next(err);
  }
}

// ─── Employer (Phase 3) ──────────────────────────────────────────────────────

export async function createJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const job = await jobService.createJob(req.user.id, req.body);
    ok(req, res, 201, { job });
  } catch (err) {
    next(err);
  }
}

export async function updateJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const job = await jobService.updateJob(req.user.id, req.params.id!, req.body);
    ok(req, res, 200, { job });
  } catch (err) {
    next(err);
  }
}

export async function pauseJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const job = await jobService.transitionJobStatus(req.user.id, req.params.id!, 'paused');
    ok(req, res, 200, { job });
  } catch (err) {
    next(err);
  }
}

export async function reopenJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const job = await jobService.transitionJobStatus(req.user.id, req.params.id!, 'active');
    ok(req, res, 200, { job });
  } catch (err) {
    next(err);
  }
}

export async function closeJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const job = await jobService.transitionJobStatus(req.user.id, req.params.id!, 'expired');
    ok(req, res, 200, { job });
  } catch (err) {
    next(err);
  }
}

export async function listMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const jobs = await jobService.listMine(req.user.id, {
      status: q.status,
      limit: q.limit ?? 50,
    });
    ok(req, res, 200, { jobs });
  } catch (err) {
    next(err);
  }
}
