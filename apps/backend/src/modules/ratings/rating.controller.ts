/**
 * Ratings controller — request → service → response envelope.
 */

import type { Request, Response, NextFunction } from 'express';
import * as service from './rating.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { applicationId, score, comment } = req.body as {
      applicationId: string;
      score: number;
      comment?: string;
    };

    const rating = await service.createRating({
      reviewerId: userId,
      applicationId,
      score,
      comment,
    });

    res.status(201).json({
      ok: true,
      data: { rating },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function listForUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.params.id!;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const [ratings, summary] = await Promise.all([
      service.listForUser({ revieweeId: userId, limit }),
      service.summarizeForUser(userId),
    ]);

    res.json({
      ok: true,
      data: { ratings, summary },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function listMyUnrated(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const unrated = await service.listMyUnrated(userId, limit);

    res.json({
      ok: true,
      data: { unrated },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
