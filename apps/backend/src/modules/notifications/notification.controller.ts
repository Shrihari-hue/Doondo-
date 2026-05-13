/**
 * Notifications controller.
 */

import type { Request, Response, NextFunction } from 'express';
import * as service from './notification.service';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const result = await service.list({ recipientId: userId, limit, before });
    res.json({ ok: true, data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const count = await service.unreadCount(userId);
    res.json({ ok: true, data: { count }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const id = req.params.id!;
    await service.markRead(id, userId);
    res.json({ ok: true, data: { id }, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const result = await service.markAllRead(userId);
    res.json({ ok: true, data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
}
