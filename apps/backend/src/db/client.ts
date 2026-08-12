/**
 * Postgres connection lifecycle (Drizzle + postgres.js).
 *
 * Mirrors the shape of src/config/db.ts's Mongo lifecycle so src/index.ts
 * can boot/shut down both stores side by side during the migration:
 * connectPg() is idempotent, disconnectPg() closes cleanly on SIGINT/SIGTERM.
 */

import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let client: postgres.Sql | null = null;
let dbInstance: Db | null = null;

export function connectPg(): Db {
  if (dbInstance) return dbInstance;

  client = postgres(env.DATABASE_URL, { max: 20 });
  dbInstance = drizzle(client, { schema });

  logger.info('postgres connected');
  return dbInstance;
}

export async function disconnectPg(): Promise<void> {
  if (!client) return;
  await client.end();
  client = null;
  dbInstance = null;
  logger.info('postgres disconnected');
}

/** Throws if connectPg() hasn't been called yet — same contract as Mongoose's connection accessor. */
export function getDb(): Db {
  if (!dbInstance) throw new Error('Postgres not connected — call connectPg() first');
  return dbInstance;
}
