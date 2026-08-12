/**
 * Verification controller — HTTP layer over verification.service.
 * Mirrors the patterns used by /me and /jobs: thin handlers that delegate
 * to the service and respond through the standard `ok` envelope.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { users } from '@/db/schema/users';
import { toPublicUser } from '@/modules/users/user.serializers';
import * as service from './verification.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function getStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(users.id, req.user.id) });
    if (!user) throw errors.notFound('User not found');
    // Reuse PublicUser since it already exposes status, phoneVerified,
    // verifiedAt, and isVerified — clients can branch off any of them.
    ok(req, res, 200, { user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function startPhone(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const result = await service.startPhoneVerification(
      req.user.id,
      req.body.phone as string,
    );
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function verifyPhone(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await service.confirmPhoneVerification(
      req.user.id,
      req.body.phone as string,
      req.body.code as string,
    );
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}

export async function uploadSelfie(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await service.submitSelfieAndFinalise(
      req.user.id,
      req.body.selfieUrl as string,
    );
    ok(req, res, 200, { user });
  } catch (err) {
    next(err);
  }
}
