/**
 * Chat controller — thin HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as chatService from './chat.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function listMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const conversations = await chatService.listMine(req.user.id, { limit: 100 });
    ok(req, res, 200, { conversations });
  } catch (err) {
    next(err);
  }
}

export async function ensureFromApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const applicationId = req.body.applicationId as string;
    const conversation = await chatService.ensureConversationFromApplication(
      req.user.id,
      applicationId,
    );
    ok(req, res, 200, { conversationId: conversation.id });
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
    if (!req.user) throw errors.unauthorized();
    const conversation = await chatService.findById(req.user.id, req.params.id!);
    ok(req, res, 200, { conversation });
  } catch (err) {
    next(err);
  }
}

export async function listMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { before?: string; limit?: number };
    const result = await chatService.listMessages(req.user.id, req.params.id!, {
      before: q.before,
      limit: q.limit ?? 50,
    });
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const message = await chatService.sendMessage(
      req.user.id,
      req.params.id!,
      {
        body: req.body.body as string | undefined,
        kind: req.body.kind as 'text' | 'image' | 'voice' | 'video' | undefined,
        attachment: req.body.attachment ?? null,
        templateKey: req.body.templateKey as string | undefined,
      },
    );
    ok(req, res, 201, { message });
  } catch (err) {
    next(err);
  }
}

export async function markRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const conversation = await chatService.markRead(req.user.id, req.params.id!);
    ok(req, res, 200, { conversation });
  } catch (err) {
    next(err);
  }
}

export async function retranslate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const result = await chatService.retranslateMessage(
      req.user.id,
      req.params.id!,
      req.params.messageId!,
    );
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}
