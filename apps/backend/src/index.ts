/**
 * Entry point.
 *
 * Order matters:
 *   1. Load + validate env (the import itself will exit on failure).
 *   2. Connect to MongoDB.
 *   3. Build the Express + Socket.IO app.
 *   4. Listen.
 *   5. Wire SIGTERM/SIGINT for graceful shutdown.
 */

import './config/env';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { connectDb, disconnectDb } from '@/config/db';
import { buildApp } from '@/server';
import { setIO } from '@/sockets/bus';
import { bootScheduler, stopScheduler } from '@/modules/scheduler';

async function main() {
  await connectDb();

  const { httpServer, io } = buildApp();

  // Make the IO instance available to services for emitting user events.
  setIO(io);

  // Boot scheduled jobs (morning digest, anti-ghost sweep). Must come
  // AFTER connectDb so per-tick queries can talk to Mongo. No-ops when
  // SCHEDULER_ENABLED=false (set in test / CI).
  bootScheduler();

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
