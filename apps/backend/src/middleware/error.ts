/**
 * Error middleware — the last line of defense.
 *
 * Translates AppError, ZodError, and unknown thrown values into the
 * standard response envelope. Logs at the right severity:
 *   - 4xx → warn (the client did something wrong)
 *   - 5xx → error (we did something wrong)
 *
 * Never lets a stack trace leak to a client in production.
 */

import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isProduction } from '@/config/env';

export const errorHandler: ErrorRequestHandler = (err, req: Request, res: Response, _next: NextFunction) => {
  const appErr = toAppError(err);

  const log = appErr.status >= 500 ? logger.error : logger.warn;
  log.call(
    logger,
    {
      requestId: req.id,
      err: {
        name: appErr.name,
        code: appErr.code,
        message: appErr.message,
        status: appErr.status,
        // `details` is where validation issues live — surfacing them in
        // the log saves a debugging round-trip when zod rejects a payload.
        details: appErr.details,
        stack: isProduction ? undefined : appErr.stack,
        cause: appErr.cause,
      },
      path: req.path,
      method: req.method,
    },
    'request failed',
  );

  res.status(appErr.status).json({
    ok: false,
    error: appErr.toJSON(),
    requestId: req.id,
  });
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return errors.validation(
      err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
    );
  }
  // Mongoose duplicate key
  if (isMongoDup(err)) {
    return errors.conflict('A record with that value already exists.');
  }
  // Unknown — wrap so we never leak details.
  return errors.internal(err);
}

function isMongoDup(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

/** 404 fallback — mounted after all routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(errors.notFound(`Route ${req.method} ${req.path} not found.`));
}
