/**
 * Entry point.
 *
 * Order matters:
 *   1. Load + validate env (the import itself will exit on failure).
 *   2. Connect to MongoDB and Postgres.
 *   3. Build the Express + Socket.IO app.
 *   4. Listen.
 *   5. Wire SIGTERM/SIGINT for graceful shutdown.
 *
 * Both DBs are wired side by side during the Mongo → Postgres migration:
 * auth/users (Phase 1) now runs on Postgres via Drizzle, while every other
 * module still runs on Mongo until Phase 2 ports the rest. See
 * apps/backend's migration plan for the phase breakdown.
 */

import './config/env';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { connectDb, disconnectDb } from '@/config/db';
import { connectPg, disconnectPg } from '@/db/client';
import { buildApp } from '@/server';
import { setIO } from '@/sockets/bus';
import { bootScheduler, stopScheduler } from '@/modules/scheduler';

async function main() {
  // The backend is in a staged Mongo → Postgres migration. Keep serving
  // PostgreSQL-backed modules when the legacy Mongo service is unavailable;
  // Mongo-backed routes will still fail at request time until their modules
  // are migrated. Cron tasks remain disabled in this mode because they are
  // currently Mongo-backed.
  let mongoAvailable = false;
  try {
    await connectDb();
    mongoAvailable = true;
  } catch (err) {
    logger.warn({ err }, 'mongodb unavailable; starting PostgreSQL-backed routes only');
  }
  connectPg();

  const { httpServer, io } = buildApp();

  // Make the IO instance available to services for emitting user events.
  setIO(io);

  // Scheduled tasks are currently Mongo-backed. Do not register them when
  // Mongo is unavailable, otherwise background failures would be continuous.
  if (mongoAvailable) bootScheduler();
  else logger.warn('scheduler disabled because mongodb is unavailable');

  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      `🟠 Doondo API listening on http://localhost:${env.PORT}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutdown signal received');
    stopScheduler();
    httpServer.close(() => logger.info('http server closed'));
    io.close(() => logger.info('socket.io closed'));
    await disconnectDb();
    await disconnectPg();
    setTimeout(() => process.exit(0), 200).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start server');
  process.exit(1);
});
