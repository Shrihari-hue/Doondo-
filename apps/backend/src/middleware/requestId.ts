/**
 * requestId middleware — attaches a short ID to every request and echoes
 * it back as `x-request-id`. The logger picks it up so every log line
 * for a given request can be traced together.
 *
 * If the client already sent an `x-request-id` (e.g. from the mobile app),
 * we honor it. Otherwise we generate one.
 */

import type { Request, Response, NextFunction } from 'express';
import { newRequestId } from '@/lib/ids';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 64 ? incoming : newRequestId();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
