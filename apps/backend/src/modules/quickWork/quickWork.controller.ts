/**
 * Quick Work HTTP layer — thin wrappers around the service.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as service from './quickWork.service';
import * as mediaService from './quickWorkMedia.service';
import * as noShowService from './quickWorkNoShow.service';
import type { QuickWorkStatus } from '@/db/schema';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

/** POST /quick-work/requests */
export async function createDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.createDraft(req.user.id, req.body);
    ok(req, res, 201, { request });
  } catch (err) {
    next(err);
  }
}

/** PATCH /quick-work/requests/:id */
export async function updateDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.updateDraft(req.params.id as string, req.user.id, req.body);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** GET /quick-work/requests/:id */
export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.getById(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** GET /quick-work/requests/mine?role=worker&status= */
export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const { role, status } = req.query as { role?: string; status?: QuickWorkStatus };
    const requests =
      role === 'worker'
        ? await service.listForWorker(req.user.id, status)
        : await service.listForEmployer(req.user.id, status);
    ok(req, res, 200, { requests });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/post */
export async function post(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.post(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/cancel */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const reason = (req.body as { reason?: string | null }).reason ?? null;
    const request = await service.cancel(req.params.id as string, req.user.id, reason);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/arriving (worker) */
export async function arriving(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const { lat, lng } = req.body as { lat?: number; lng?: number };
    const request = await service.markArriving(req.params.id as string, req.user.id, lat, lng);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/arrived (worker) */
export async function arrived(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.markArrived(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/start (worker) */
export async function start(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.startWork(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/complete (worker) */
export async function complete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const { completionPhotoUrl, completionNotes, finalPrice } = req.body as {
      completionPhotoUrl?: string | null;
      completionNotes?: string | null;
      finalPrice?: number | null;
    };
    const request = await service.completeWork(req.params.id as string, req.user.id, {
      completionPhotoUrl,
      completionNotes,
      finalPrice,
    });
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/dispute */
export async function dispute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const { reason } = req.body as { reason: string };
    const request = await service.raiseDispute(req.params.id as string, req.user.id, reason);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/approve-price (employer) */
export async function approvePrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await service.approvePrice(req.params.id as string, req.user.id);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/report-no-show (worker — customer didn't show) */
export async function reportNoShow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const { reason } = req.body as { reason: string };
    const request = await noShowService.reportCustomerNoShow(req.params.id as string, req.user.id, reason);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** POST /quick-work/requests/:id/media (employer, draft only) */
export async function uploadMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await mediaService.uploadMedia(req.params.id as string, req.user.id, req.body);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}

/** DELETE /quick-work/requests/:id/media (employer, draft only) */
export async function removeMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const request = await mediaService.removeMedia(req.params.id as string, req.user.id, req.body);
    ok(req, res, 200, { request });
  } catch (err) {
    next(err);
  }
}
