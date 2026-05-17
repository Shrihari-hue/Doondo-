/**
 * Endorsement HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { errors, AppError } from '@/lib/errors';
import * as service from './endorsement.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

function assertObjectId(id: string | undefined, label: string): string {
  if (!id || !Types.ObjectId.isValid(id)) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      message: `Invalid ${label}`,
      status: 400,
    });
  }
  return id;
}

/** Employer endorses a seeker for a specific trade. */
export async function endorseSeeker(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const seekerId = assertObjectId(req.params.id, 'seeker id');
    const body = req.body as { trade?: string; applicationId?: string };
    if (!body.trade || typeof body.trade !== 'string') {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'trade is required',
        status: 400,
      });
    }
    const endorsement = await service.endorse({
      endorserId: req.user.id,
      seekerId,
      trade: body.trade,
      applicationId: body.applicationId,
    });
    ok(req, res, 201, { endorsement });
  } catch (err) {
    next(err);
  }
}

/** Anyone can read a seeker's endorsement summary — drives the badge. */
export async function listForSeeker(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const seekerId = assertObjectId(req.params.id, 'seeker id');
    const endorsements = await service.summarizeForSeeker(seekerId);
    ok(req, res, 200, { endorsements });
  } catch (err) {
    next(err);
  }
}

/** Employer marks one of the seeker's work photos as verified. */
export async function verifySeekerPhoto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const seekerId = assertObjectId(req.params.id, 'seeker id');
    const body = req.body as { photoIndex?: number; applicationId?: string };
    if (typeof body.photoIndex !== 'number' || body.photoIndex < 0 || body.photoIndex > 9) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'photoIndex must be 0..9',
        status: 400,
      });
    }
    const verification = await service.verifyPhoto({
      employerId: req.user.id,
      seekerId,
      photoIndex: body.photoIndex,
      applicationId: body.applicationId,
    });
    ok(req, res, 201, { verification });
  } catch (err) {
    next(err);
  }
}

/** Per-photo verification counts for a seeker. */
export async function listPhotoVerifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const seekerId = assertObjectId(req.params.id, 'seeker id');
    const verifications = await service.summarizePhotoVerifications(seekerId);
    ok(req, res, 200, { verifications });
  } catch (err) {
    next(err);
  }
}
