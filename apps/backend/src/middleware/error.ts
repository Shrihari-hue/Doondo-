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
  // Mongoose duplicate key — try to surface the most useful AppError
  // we can. The two common cases for Doondo are:
  //   1. (email, role) compound index collision  → AUTH_EMAIL_TAKEN
  //   2. legacy email_1 unique index collision   → AUTH_EMAIL_TAKEN, but
  //      also a signal that migrate:user-indexes hasn't been run yet —
  //      we log loudly so the operator notices.
  if (isMongoDup(err)) {
    const meta = mongoDupMeta(err);
    if (meta.involvesEmail) {
      if (meta.isLegacyEmailOnly) {
        // Scream into the logs — this is almost certainly the stale
        // email_1 index left over from before the dual-account change.
        logger.error(
          {
            indexName: meta.indexName,
            hint: 'Run `pnpm --filter @doondo/backend migrate:user-indexes` to drop the stale unique email index.',
          },
          'duplicate-key on legacy single-field email index — migration needed',
        );
      }
      return errors.emailTaken();
    }
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

/**
 * Inspect a MongoServerError E11000 payload to decide whether it's an
 * email collision (so we can surface AUTH_EMAIL_TAKEN) and whether the
 * offending index is the legacy single-field `email` unique (so we can
 * log a migration hint for the operator).
 */
function mongoDupMeta(err: unknown): {
  involvesEmail: boolean;
  isLegacyEmailOnly: boolean;
  indexName: string | null;
} {
  const e = err as {
    message?: string;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    index?: string;
  };
  // `keyPattern` is the most reliable signal — Mongo populates it with
  // the offending index's key spec. e.g. { email: 1 } for the legacy
  // index, { email: 1, role: 1 } for the new compound.
  const keys = e.keyPattern ? Object.keys(e.keyPattern) : [];
  const involvesEmail = keys.includes('email') || /index:\s*email_/.test(e.message ?? '');
  const isLegacyEmailOnly =
    involvesEmail &&
    (keys.length === 1 ||
      // Fallback for older mongo drivers that don't populate keyPattern —
      // try to read the index name out of the error message.
      /index:\s*email_(-?1)\b/.test(e.message ?? ''));
  // Index name is sometimes on `.index`, sometimes only in the message.
  const indexName =
    e.index ??
    (e.message?.match(/index:\s*([^\s]+)/)?.[1] ?? null);
  return { involvesEmail, isLegacyEmailOnly, indexName };
}

/** 404 fallback — mounted after all routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(errors.notFound(`Route ${req.method} ${req.path} not found.`));
}
