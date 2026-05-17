import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { errors, AppError } from '@/lib/errors';
import * as service from './skillTests.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tests = service.listTests();
    ok(req, res, 200, { tests });
  } catch (err) {
    next(err);
  }
}

export async function detail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const test = service.getTest(req.params.id!);
    ok(req, res, 200, { test });
  } catch (err) {
    next(err);
  }
}

export async function submitAttempt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = req.body as { answers?: number[] };
    if (!Array.isArray(body.answers)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'answers must be an array of option indices',
        status: 400,
      });
    }
    const attempt = await service.submitAttempt({
      seekerId: req.user.id,
      testId: req.params.id!,
      answers: body.answers,
    });
    ok(req, res, 201, { attempt });
  } catch (err) {
    next(err);
  }
}

export async function listMyAttempts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const attempts = await service.listMyAttempts(req.user.id);
    ok(req, res, 200, { attempts });
  } catch (err) {
    next(err);
  }
}

export async function listPassedForSeeker(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid seeker id',
        status: 400,
      });
    }
    const passedTestIds = await service.listPassedTests(id);
    ok(req, res, 200, { passedTestIds });
  } catch (err) {
    next(err);
  }
}
