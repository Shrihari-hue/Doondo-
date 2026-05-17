/**
 * Backend error tracking — Sentry wrapper for the Express server.
 *
 * Defensive: if @sentry/node isn't installed or SENTRY_DSN isn't set,
 * everything becomes a no-op. Helpers + middleware are still exported
 * so app.ts can wire them unconditionally.
 *
 * PII redaction: same rules as the mobile side — req.user.id is OK,
 * email/phone/body content is not. We strip the request body before
 * sending so a misformatted apply payload can't leak details.
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';

interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  Handlers: {
    requestHandler: () => RequestHandler;
    errorHandler: () => ErrorRequestHandler;
  };
  captureException: (err: unknown, opts?: Record<string, unknown>) => void;
  captureMessage: (msg: string, opts?: Record<string, unknown>) => void;
  setUser: (user: { id?: string } | null) => void;
}

let sentry: SentryLike | null = null;
let enabled = false;

function tryInit(): void {
  if (enabled) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@sentry/node') as SentryLike;
    if (!mod?.init) return;
    mod.init({
      dsn,
      tracesSampleRate: 0.1,
      // Strip the request body so we never send raw passwords / OTPs / etc.
      beforeSend(event: Record<string, unknown>) {
        const req = event.request as Record<string, unknown> | undefined;
        if (req) delete req.data;
        return event;
      },
    });
    sentry = mod;
    enabled = true;
  } catch {
    enabled = false;
  }
}

tryInit();

export function sentryRequestHandler(): RequestHandler {
  if (enabled && sentry) return sentry.Handlers.requestHandler();
  return (_req, _res, next) => next();
}

export function sentryErrorHandler(): ErrorRequestHandler {
  if (enabled && sentry) return sentry.Handlers.errorHandler();
  // Pass through — Express will fall back to its default error handler
  // (or your existing one). This wrapper exists so app.ts can wire it
  // unconditionally without `if (sentry)` branches.
  return (err, _req, _res, next) => next(err);
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled || !sentry) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[error]', err, context);
    }
    return;
  }
  try {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}

export function captureMessage(msg: string, context?: Record<string, unknown>): void {
  if (!enabled || !sentry) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[note]', msg, context);
    }
    return;
  }
  try {
    sentry.captureMessage(msg, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}

export function isErrorTrackingEnabled(): boolean {
  return enabled;
}
