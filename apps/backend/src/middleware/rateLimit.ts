/**
 * Rate limiters.
 *
 * Two flavours:
 *   - generalLimiter: applied globally. Loose limit per IP per minute.
 *   - authLimiter: applied to /auth/* endpoints. Tighter, to slow down
 *     credential stuffing and signup abuse.
 *
 * Both produce our standard error envelope on rejection.
 */

import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';
import { errors } from '@/lib/errors';

const buildHandler = (message: string) => (req: import('express').Request) => {
  // Surface as our standard error so the client always sees the same shape.
  throw errors.rateLimited(message);
  // (Throwing here is caught by express-async error handling because
  // express-rate-limit calls handler synchronously inside a try.)
};

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('Too many requests. Please slow down.'),
});

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler('Too many auth attempts. Try again in a minute.'),
});
