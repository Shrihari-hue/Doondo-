/**
 * Applications controller — thin HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as applicationService from './application.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function apply(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.apply({
      seekerId: req.user.id,
      jobId: req.params.id!,
      coverNote: req.body?.coverNote ?? null,
    });
    ok(req, res, 201, { application });
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
    const applications = await applicationService.listMine(req.user.id, {
      status: q.status,
      limit: q.limit ?? 20,
    });
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.findById(req.user.id, req.params.id!);
    ok(req, res, 200, { application });
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
    const application = await applicationService.withdraw(req.user.id, req.params.id!);
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

// ─── Employer (Phase 3) ──────────────────────────────────────────────────────

function transitionHandler(next: 'viewed' | 'shortlisted' | 'rejected' | 'hired') {
  return async (req: Request, res: Response, n: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw errors.unauthorized();
      const application = await applicationService.transitionByEmployer(
        req.user.id,
        req.params.id!,
        next,
      );
      ok(req, res, 200, { application });
    } catch (err) {
      n(err);
    }
  };
}

export const markViewed = transitionHandler('viewed');
export const shortlist = transitionHandler('shortlisted');
export const reject = transitionHandler('rejected');
export const hire = transitionHandler('hired');

export async function listApplicantsForJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const applications = await applicationService.listApplicantsForJob(
      req.user.id,
      req.params.id!,
      { status: q.status, limit: q.limit ?? 50 },
    );
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}

export async function listApplicantsForEmployer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const applications = await applicationService.listApplicantsForEmployer(req.user.id, {
      status: q.status,
      limit: q.limit ?? 50,
    });
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}
