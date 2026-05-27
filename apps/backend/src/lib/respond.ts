/**
 * HTTP response helpers — keep route handlers honest about the envelope.
 *
 * Every successful API response MUST take the shape:
 *
 *     { ok: true, data: <T>, requestId: <string> }
 *
 * and every error response MUST take the shape:
 *
 *     { ok: false, error: { code, message, details? }, requestId }
 *
 * The mobile client (`apps/mobile/src/api/client.ts`) validates `ok === true`
 * before unwrapping `.data`. If a route forgets the envelope, the client
 * surfaces "Unexpected response (status 200)" — a real bug we've shipped
 * more than once. Use `sendOk()` instead of `res.json(...)` directly and
 * the contract is enforced by TypeScript.
 *
 * For errors, prefer throwing an `AppError` (or calling `next(err)`) — the
 * error middleware formats them into the envelope automatically. `sendErr`
 * exists for the rare case where a handler needs to short-circuit a
 * response inline without involving `next`.
 */

import type { Response } from 'express';
import { AppError, type ErrorCode } from './errors';

/**
 * Send a success envelope.
 *
 *   sendOk(res, { friends });            // 200
 *   sendOk(res, { id: created.id }, 201) // 201
 */
export function sendOk<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({
    ok: true,
    data,
    requestId: res.req.id,
  });
}

/**
 * Send an error envelope inline. Prefer `throw new AppError(...)` or
 * `next(errors.validation(...))` — the error middleware will format the
 * envelope for you and log at the right severity. Only use `sendErr`
 * when you can't easily reach `next`, e.g. inside a low-level handler
 * registered outside the normal router pipeline.
 */
export function sendErr(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): Response {
  return res.status(status).json({
    ok: false,
    error: { code, message, details: details ?? null },
    requestId: res.req.id,
  });
}

/**
 * Convenience wrapper: send an AppError as an envelope. Useful if you've
 * already constructed one but don't want to throw.
 */
export function sendAppError(res: Response, err: AppError): Response {
  return sendErr(res, err.status, err.code, err.message, err.details);
}
