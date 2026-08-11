/**
 * Build the Express + Socket.IO app. Pure factory — boot logic
 * (connectPg, listen, signal handlers) lives in src/index.ts.
 */

import express, { type Express, type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
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
import { sentryRequestHandler, sentryErrorHandler } from '@/lib/errorTracking';

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

  // ─── Sentry request handler (must be first) ─────────────────────────────
  // Defensive — becomes a pass-through when @sentry/node isn't installed
  // or SENTRY_DSN isn't set, so this is safe in every environment.
  app.use(sentryRequestHandler());

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
  // Hire-Reel uploads can be up to ~56MB base64 (~40MB of raw video),
  // so /api/v1/reels gets its own larger JSON body parser BEFORE the
  // global one. body-parser detects that req.body is already parsed and
  // skips, so the route-scoped mount wins for reel uploads and the
  // smaller global cap still protects every other endpoint.
  app.use('/api/v1/reels', express.json({ limit: '60mb' }));
  app.use('/api/v1/reels', express.urlencoded({ extended: true, limit: '60mb' }));
  // 2mb fits the base64-encoded profile photo (~350KB raw → ~470KB encoded
  // + JSON overhead) with comfortable headroom.
  // 4mb fits a compressed chat image (~1MB raw → ~1.4MB base64) plus
  // future small attachments. Increase further if voice notes start
  // running over.
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4mb' }));
  app.use(generalLimiter);

  // ─── Static media — Hire Reels mock provider ────────────────────────────
  // The mock reel-storage provider writes uploads to REEL_STORAGE_DIR;
  // serving the same directory here makes those URLs actually playable
  // on a fresh checkout (no external CDN required). Helmet sets a strict
  // CORP by default which would block <video> from another origin — relax
  // just this mount so the mobile app can fetch the bytes. mkdirSync
  // keeps the static handler happy when no reels have been uploaded yet.
  if (env.REEL_STORAGE_PROVIDER === 'mock') {
    const reelDir = path.resolve(process.cwd(), env.REEL_STORAGE_DIR);
    fs.mkdirSync(reelDir, { recursive: true });
    app.use(
      '/media/reels',
      (_req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      },
      express.static(reelDir, {
        fallthrough: false,
        index: false,
        maxAge: '5m',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.mp4')) res.type('video/mp4');
          else if (filePath.endsWith('.mov')) res.type('video/quicktime');
          else if (filePath.endsWith('.webm')) res.type('video/webm');
        },
      }),
    );
    logger.info({ reelDir }, 'serving Hire Reels media from local disk');
  }

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
  // Sentry's error handler must come BEFORE our app's error handler so
  // it captures the exception before we serialise the response.
  app.use(sentryErrorHandler());
  app.use(errorHandler);

  // ─── Sockets ────────────────────────────────────────────────────────────
  const io = attachSockets(httpServer);

  return { app, httpServer, io };
}
