/**
 * Ratings controller — request → service → response envelope.
 */

import type { Request, Response, NextFunction } from 'express';
import * as service from './rating.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { applicationId, quickWorkRequestId, score, comment, tags, anonymous } = req.body as {
      applicationId?: string;
      quickWorkRequestId?: string;
      score: number;
      comment?: string;
      tags?: string[];
      anonymous?: boolean;
    };

    const rating = quickWorkRequestId
      ? await service.createQuickWorkRating({
          reviewerId: userId,
          quickWorkRequestId,
          score,
          comment,
          tags,
          anonymous,
        })
      : await service.createRating({
          reviewerId: userId,
          applicationId: applicationId!,
          score,
          comment,
          tags,
          anonymous,
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

/**
 * Aggregated tag summary for a user — "Workers say…" style trust
 * signals on the EmployerDetail screen. Public so unauthenticated
 * browsers see the same info that drives the seeker's decision.
 *
 * `role` query param selects which catalog to roll up against:
 *   - 'employer' (default) → tags seekers used to review THIS user as
 *     an employer (paid on time, safe site, etc).
 *   - 'seeker' → tags employers used to review THIS user as a seeker
 *     (punctual, hardworking, etc).
 */
export async function tagSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.params.id!;
    const roleRaw = (req.query.role as string | undefined) ?? 'employer';
    const role: 'employer' | 'seeker' = roleRaw === 'seeker' ? 'seeker' : 'employer';
    const summary = await service.summarizeTagsForUser(userId, role);
    res.json({ ok: true, data: summary, requestId: req.id });
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
