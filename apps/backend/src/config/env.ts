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
  // Auth: either AccountSid + AuthToken (legacy) OR ApiKeySid + ApiKeySecret
  // (recommended — scopeable and rotatable). When both are configured the
  // API key wins. The Account SID is still required either way because
  // Twilio's URL paths include it.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),

  // ─── Twilio WhatsApp (Messaging API) ──────────────────────────────────
  // Reuses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN above.
  //
  // TWILIO_WHATSAPP_FROM — the WhatsApp-enabled sender, "whatsapp:+E164".
  //   Sandbox: whatsapp:+14155238886
  //   Production: your approved WhatsApp Business sender.
  //
  // TWILIO_WHATSAPP_ENABLED — master switch. When false, sendTemplate /
  //   sendText calls are no-ops that log + return. Lets you ship without
  //   blowing $$ on accidental sends in CI / staging.
  //
  // TWILIO_WHATSAPP_WEBHOOK_PATH — the URL path Twilio will POST inbound
  //   messages to (configured in the Twilio console). Defaults to the
  //   v1 router path; override only if you mount it elsewhere.
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_WHATSAPP_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  TWILIO_WHATSAPP_WEBHOOK_PATH: z.string().default('/api/v1/whatsapp/webhook'),
  /**
   * Toggle Twilio's X-Twilio-Signature validation on inbound webhooks.
   * Default true (always validate in prod). Turn off only when you're
   * pointing the webhook at a tunnel (ngrok) without a stable URL.
   */
  TWILIO_WEBHOOK_VALIDATE: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),

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

  // ─── Scheduler (Phase 2 post-MVP additions) ───────────────────────────
  /** Master switch for all crons. Set to "false" in test/CI to skip boot. */
  SCHEDULER_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Cron expression for the morning digest. Default 01:30 UTC = 07:00 IST,
   * which matches the "open the app with chai" window for most Indian
   * users. Use 6-field cron if you need second-level precision.
   */
  DIGEST_CRON: z.string().default('30 1 * * *'),
  /**
   * Cron for the anti-ghost sweep. Default top-of-hour every hour; the
   * sweep itself is cheap (indexed query + small fan-out) so hourly is
   * fine.
   */
  GHOST_SWEEP_CRON: z.string().default('0 * * * *'),
  /**
   * Hours an employer has to move an application past `pending` before
   * the sweep flags it as ghosted. Default 72h (3 days) — tight enough
   * that seekers don't wait forever, loose enough that a busy employer
   * with weekend gaps isn't unfairly punished.
   */
  GHOST_SLA_HOURS: z.coerce.number().int().positive().default(72),

  // ─── Profile extraction (one-photo profile) ───────────────────────────
  /**
   * 'anthropic' calls the Anthropic Messages API with the supplied
   * image; 'mock' returns a deterministic stub so the mobile UX can be
   * tested without a real key. Default 'mock' in development so a
   * fresh checkout works end-to-end without configuration; production
   * deploys must set this to 'anthropic' explicitly.
   */
  PROFILE_EXTRACT_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),
  /** Anthropic API key (required when PROFILE_EXTRACT_PROVIDER=anthropic). */
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Model to use for vision extraction. Default a recent Sonnet — good
   * vision quality at a reasonable cost. Override per environment.
   */
  ANTHROPIC_VISION_MODEL: z.string().default('claude-sonnet-4-6'),
  /**
   * Cron for the interview-reminder sweep. Default every 15 min on the
   * quarter-hour — cheap (small indexed query) and gives any rescheduled
   * interview at most a 15-minute reminder lag.
   */
  INTERVIEW_REMINDER_CRON: z.string().default('*/15 * * * *'),
  /**
   * Minutes before the scheduled interview to send the reminder push.
   * Default 60 — long enough that the worker can finish a current task
   * and head to the interview, short enough that the reminder is fresh
   * in mind.
   */
  INTERVIEW_REMINDER_LEAD_MINUTES: z.coerce.number().int().positive().default(60),

  // ─── Dormant-user re-engagement sweep ─────────────────────────────────
  /**
   * Cron for the re-engagement sweep. Default 03:00 UTC = 08:30 IST —
   * after the morning digest (07:00 IST) so a dormant user gets one
   * clean nudge, not two pings in the same window. Runs once daily;
   * the cooldown + attempt caps below keep it from pestering anyone.
   */
  REENGAGEMENT_CRON: z.string().default('0 3 * * *'),
  /**
   * Days since last login before a user counts as dormant. Default 14 —
   * long enough to be a real lapse (not a quiet week), short enough that
   * the win-back nudge still feels timely.
   */
  REENGAGEMENT_DORMANT_DAYS: z.coerce.number().int().positive().default(14),
  /**
   * Minimum days between two re-engagement pushes to the same user.
   * Default 7 — a dormant user who ignores the first nudge gets at most
   * one more per week, never a daily drip.
   */
  REENGAGEMENT_COOLDOWN_DAYS: z.coerce.number().int().positive().default(7),
  /**
   * Hard cap on re-engagement pushes within one dormancy spell. Default
   * 3 — after three ignored nudges we stop until the user comes back.
   * The counter resets to 0 on login (see auth.service) so a user who
   * returns and lapses again gets a fresh budget.
   */
  REENGAGEMENT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // ─── Voice-note transcription ─────────────────────────────────────────
  /**
   * 'openai' sends chat voice notes to OpenAI's audio-transcription
   * (Whisper) endpoint; 'mock' returns a deterministic stub so the chat
   * UX works on a fresh checkout with no API key. Default 'mock' in
   * development — production deploys that want real transcripts must set
   * this to 'openai' explicitly and supply OPENAI_API_KEY.
   */
  TRANSCRIPTION_PROVIDER: z.enum(['openai', 'mock']).default('mock'),
  /** OpenAI API key (required when TRANSCRIPTION_PROVIDER=openai). */
  OPENAI_API_KEY: z.string().optional(),
  /** Transcription model. Default Whisper v1 — solid multilingual STT. */
  TRANSCRIPTION_MODEL: z.string().default('whisper-1'),

  // ─── Skill-document OCR ───────────────────────────────────────────────
  /**
   * 'anthropic' reads uploaded skill-proof documents (certificates,
   * licences) with the Anthropic Messages API to pull out title / issuer
   * / date; 'mock' returns a plausible skill-derived stub so the feature
   * works on a fresh checkout. Default 'mock'. Shares ANTHROPIC_API_KEY
   * and ANTHROPIC_VISION_MODEL with the one-photo-profile extractor.
   */
  DOCUMENT_EXTRACT_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),

  // ─── In-chat translation ──────────────────────────────────────────────
  /**
   * 'anthropic' translates chat messages via the Anthropic Messages API;
   * 'mock' returns a deterministic, clearly-labelled preview so the chat
   * UX works on a fresh checkout with no API key. Default 'mock' in
   * development — production deploys that want real translations must set
   * this to 'anthropic' explicitly and supply ANTHROPIC_API_KEY.
   */
  TRANSLATION_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),
  /**
   * Model used for text generation (chat translation + Smart Resume
   * rewrites). Default a recent Sonnet — strong multilingual quality at a
   * reasonable cost. Shares ANTHROPIC_API_KEY with the vision provider.
   */
  ANTHROPIC_TEXT_MODEL: z.string().default('claude-sonnet-4-6'),

  // ─── Smart Resume — per-job AI resume rewrite ─────────────────────────
  /**
   * 'anthropic' rewrites the worker's resume to target a specific job via
   * the Anthropic Messages API; 'mock' returns a deterministic tailored
   * draft so the flow works on a fresh checkout. Default 'mock'.
   */
  RESUME_REWRITE_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),

  // ─── Doondo Score — shareable signed credential ───────────────────────
  /**
   * HMAC secret used to sign the QR-shareable Doondo Score credential.
   * Defaults to the JWT access secret so a fresh checkout works without
   * extra configuration; production deploys should set a dedicated value.
   */
  DOONDO_SCORE_SECRET: z.string().optional(),
  /**
   * Public base URL the score QR points at — the verification page is
   * served at `${PUBLIC_BASE_URL}/api/v1/score/verify/:token`. Defaults
   * to the local dev server.
   */
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),

  // ─── Hire Reels — worker intro-video storage ──────────────────────────
  /**
   * Where a worker's intro-reel video is stored. 'mock' returns a
   * deterministic placeholder URL so the feature works on a fresh
   * checkout with no media host; 'http' POSTs the clip to REEL_UPLOAD_URL
   * (whatever CDN / uploader the deploy runs) and uses the URL it returns.
   * Default 'mock' — a production deploy sets this to 'http'.
   */
  REEL_STORAGE_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  /** Upload endpoint (required when REEL_STORAGE_PROVIDER=http). */
  REEL_UPLOAD_URL: z.string().url().optional(),
  /** Optional bearer token sent with the upload request. */
  REEL_UPLOAD_TOKEN: z.string().optional(),

  // ─── File storage — skill-proof documents (certificates, licences) ────
  /**
   * Where uploaded skill-proof documents live. 'mock' returns a
   * deterministic placeholder URL so the feature works on a fresh
   * checkout with no media host; 'http' POSTs the file to
   * FILE_UPLOAD_URL (whatever CDN / uploader the deploy runs) and uses
   * the URL it returns. Default 'mock' — production sets this to 'http'.
   */
  FILE_STORAGE_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  /** Upload endpoint (required when FILE_STORAGE_PROVIDER=http). */
  FILE_UPLOAD_URL: z.string().url().optional(),
  /** Optional bearer token sent with the file-upload request. */
  FILE_UPLOAD_TOKEN: z.string().optional(),
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
