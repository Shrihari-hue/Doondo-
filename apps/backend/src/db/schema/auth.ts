/**
 * Postgres port of RefreshToken + OtpChallenge (src/modules/users/
 * refreshToken.model.ts, src/modules/verification/otpChallenge.model.ts).
 *
 * Mongo's TTL indexes (auto-delete past `expiresAt`) have no Postgres
 * equivalent — expiry stays enforced in app logic (already the pattern:
 * every read checks `expiresAt` explicitly), and a periodic cleanup job
 * (Phase 1's scheduler wiring) deletes expired rows. That's a cleanup
 * optimization only, never a correctness boundary.
 */

import { pgTable, uuid, varchar, timestamp, boolean, integer, text, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    // = the JWT's `jti`. The app generates this (randomUUID()) before
    // insert — no defaultRandom(), since the id must match the token
    // that's already been signed by the time we write the row.
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    ip: varchar('ip', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_family_id_idx').on(t.familyId),
    index('refresh_tokens_expires_at_idx').on(t.expiresAt),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phone: varchar('phone', { length: 30 }).notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumed: boolean('consumed').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('otp_challenges_user_phone_consumed_idx').on(t.userId, t.phone, t.consumed),
    index('otp_challenges_expires_at_idx').on(t.expiresAt),
  ],
);
