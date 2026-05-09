/**
 * Build the Express + Socket.IO app. Pure factory — boot logic
 * (connectDb, listen, signal handlers) lives in src/index.ts.
 */

import express, { type Express, type Request, type Response } from 'express';
import http from 'node:http';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';

import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { requestId } from '@/middleware/requestId';
import { errorHandler, notFoundHandler } from '@/middleware/error';
import { generalLimiter } from '@/middleware/rateLimit';
import v1 from '@/routes/v1';
import { attachSockets } from '@/sockets';

export interface BuiltApp {
  app: Express;
  httpServer: http.Server;
  io: ReturnType<typeof attachSockets>;
}

export function buildApp(): BuiltApp {
  const app = express();
  const httpServer = http.createServer(app);

  // Trust the first proxy hop in production (so req.ip is the real client IP).
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  // ─── Global middleware ──────────────────────────────────────────────────
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as Request).id }),
      autoLogging: {
        ignore: (req) => req.url === '/healthz',
      },
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true,
      credentials: true,
    }),
  );
  app.use(compression());
  // 2mb fits the base64-encoded profile photo (~350KB raw → ~470KB encoded
  // + JSON overhead) with comfortable headroom.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(generalLimiter);

  // ─── Health ─────────────────────────────────────────────────────────────
  app.get('/healthz', (req: Request, res: Response) => {
    res.json({
      ok: true,
      data: {
        uptime: process.uptime(),
        env: env.NODE_ENV,
        version: '0.1.0',
      },
      requestId: req.id,
    });
  });

  // ─── API ────────────────────────────────────────────────────────────────
  app.use('/api/v1', v1);

  // ─── 404 + error handler (must be last) ─────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ─── Sockets ────────────────────────────────────────────────────────────
  const io = attachSockets(httpServer);

  return { app, httpServer, io };
}
