/**
 * Validated env. Crashes loudly at boot if required vars are missing or
 * malformed — better to fail fast than to discover a missing JWT secret
 * three months in.
 *
 * Import this module once at the top of src/index.ts to load .env, then
 * import { env } anywhere else.
 */

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.string().url().or(z.string().startsWith('mongodb')),
  MONGODB_DB_NAME: z.string().default('doondo'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(11),

  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // ─── OTP provider for phone verification (Phase 5) ────────────────────
  // 'console' — log the OTP to stdout (dev only). BYO storage via OtpChallenge.
  // 'twilio'  — Twilio Verify v2 (recommended). Twilio generates, sends,
  //              and verifies the code; we never see the plaintext.
  // 'msg91'   — MSG91's transactional SMS API + our local OtpChallenge store.
  SMS_PROVIDER: z.enum(['console', 'twilio', 'msg91']).default('console'),

  // Twilio Verify (https://www.twilio.com/docs/verify)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

  // MSG91 (https://msg91.com)
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().default('DOONDO'),
  /** Default country code prepended when a phone has no leading "+". */
  PHONE_DEFAULT_COUNTRY: z.string().default('+91'),
  /** OTP attempts allowed per challenge before it's invalidated. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** OTP TTL in seconds. */
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  /** Per-phone rate limit on /verification/phone/start (per minute). */
  OTP_SEND_PER_MINUTE: z.coerce.number().int().positive().default(2),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Invalid environment variables:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCopy .env.example to .env and fill in the missing values.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
