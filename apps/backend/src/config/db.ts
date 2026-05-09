/**
 * MongoDB connection lifecycle.
 *
 * connectDb() is idempotent — call it once during server boot. It attaches
 * Mongoose event listeners that surface connection issues in the logger,
 * and registers process-exit hooks to close cleanly on SIGINT/SIGTERM.
 */

import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '@/lib/logger';

mongoose.set('strictQuery', true);

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  connecting = mongoose
    .connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 8_000,
      maxPoolSize: 20,
    })
    .then((m) => {
      logger.info({ db: env.MONGODB_DB_NAME }, 'mongodb connected');
      return m;
    })
    .catch((err) => {
      connecting = null;
      logger.fatal({ err }, 'mongodb connection failed');
      throw err;
    });

  mongoose.connection.on('disconnected', () => {
    logger.warn('mongodb disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('mongodb reconnected');
  });

  return connecting;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  connecting = null;
  logger.info('mongodb disconnected');
}
