/**
 * Structured logger. JSON in production, prettified in dev so logs are
 * actually readable in the terminal.
 *
 * Always log objects, not strings. `logger.info({ userId, ip }, 'login ok')`
 * gives us searchable fields. `logger.info('login ok userId=...')` does not.
 */

import pino from 'pino';
import { env, isProduction } from '@/config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'doondo-backend',
    env: env.NODE_ENV,
  },
  // In production: JSON to stdout (consumed by log shipping).
  // In dev: pino-pretty for human eyes.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
          singleLine: false,
        },
      },
  // Redact obvious secrets even if they accidentally end up in a log object.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
      '*.JWT_ACCESS_SECRET',
      '*.JWT_REFRESH_SECRET',
    ],
    censor: '[redacted]',
  },
});
