/**
 * Vitest setupFile — runs before any test file's own imports, which
 * matters because src/config/env.ts calls `dotenv/config` at import time
 * and dotenv never overrides a var that's already on process.env. Setting
 * these here (before anything imports env.ts) guarantees the test values
 * win over whatever a local .env has, without touching that file.
 */
process.env.NODE_ENV = 'test';
// The full test suite drives auth.routes and application.routes through
// supertest in the same process/IP — well past AUTH_RATE_LIMIT_MAX's
// production default (10/min). Raise the ceiling for tests only; the
// limiter itself is still exercised by its own dedicated test.
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '5000';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ?? '5000';
// Never boot cron jobs while running tests.
process.env.SCHEDULER_ENABLED = 'false';
