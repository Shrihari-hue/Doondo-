/**
 * One-off: enable the PostGIS extension on the target Postgres database.
 * Run once per environment before the first `pnpm db:migrate`
 * (`pnpm db:enable-postgis`). Idempotent — safe to re-run.
 *
 * Needed ahead of Phase 2 (Job/User/Availability/etc. geo columns), but
 * cheap to enable now so it isn't a blocker later.
 */

import '../config/env';
import postgres from 'postgres';
import { env } from '@/config/env';

async function main() {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
    console.log('postgis extension enabled');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
