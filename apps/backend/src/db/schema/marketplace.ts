import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { applications } from './applications';
import { jobs } from './jobs';
import { users } from './users';
import { quickWorkRequests } from './quickWork';

export const messageKindEnum = pgEnum('message_kind', ['text', 'image', 'voice', 'video', 'system']);
export const translationStatusEnum = pgEnum('translation_status', ['none', 'pending', 'done', 'failed']);
export const walletKindEnum = pgEnum('wallet_kind', ['hire_payment', 'adjustment', 'cash_log', 'qr_collection', 'payout', 'quick_work_payment']);
export const walletStatusEnum = pgEnum('wallet_status', ['pending', 'settled', 'reversed']);
export const referralStatusEnum = pgEnum('referral_status', ['pending', 'hired', 'reverted']);
export const homeSafeStatusEnum = pgEnum('home_safe_status', ['pending', 'safe']);
export const ratingRoleEnum = pgEnum('rating_role', ['employer', 'seeker']);
/** Role of the REVIEWEE on a rating — 'seeker' means a seeker received it. */
export type RatingRole = (typeof ratingRoleEnum.enumValues)[number];
export const notificationKindEnum = pgEnum('notification_kind', [
  'application_status', 'application_received', 'interview_scheduled', 'interview_rescheduled',
  'interview_cancelled', 'interview_reminder', 'new_message', 'rating_received',
  'verification_status', 'job_alert_match', 'morning_digest', 'application_ghosted',
  'skill_gap', 'doondo_score_changed', 'sos_alert', 'shift_checkin', 'shift_confirmation',
  'offer_made', 'offer_resolved', 'offer_expired', 'offer_countered', 'worker_on_the_way',
  'crew_shift', 'shift_backfilled', 'streak_milestone', 'referral_bonus', 'hired_nearby',
  'reengagement', 'hire_celebration', 'hiring_request', 'hiring_request_responded',
  'employer_interest', 'dispute_raised', 'dispute_update', 'job_escalated',
  'reached_home_safe', 'profile_viewed', 'system',
  'mentor_session_booked', 'mentor_session_cancelled',
  'cohort_invite', 'cohort_message',
  // Quick Work — employer-plan.md §23 / seeker-plan.md §27.
  'quick_work_offer_received', 'quick_work_offer_expiring', 'quick_work_offer_closed',
  'quick_work_matched', 'quick_work_worker_arriving', 'quick_work_worker_arrived',
  'quick_work_started', 'quick_work_completed', 'quick_work_price_approved',
  'quick_work_payment_pending', 'quick_work_paid', 'quick_work_cancelled',
  'quick_work_customer_cancelled', 'quick_work_expired', 'quick_work_no_worker_found',
  'quick_work_disputed',
  // Scheduled Work + no-show (gaps #1/#3) — added alongside the columns
  // in quickWork.ts's own migration; forgetting this Postgres-enum
  // extension is exactly the kind of bug the DB itself catches loudly
  // (invalid input value for enum) rather than silently, which is how it
  // was caught here.
  'quick_work_scheduled_confirmed', 'quick_work_scheduled_reminder', 'quick_work_no_show',
]);

// employer-plan.md §14 / seeker-plan.md — Quick Work reuses this exact
// chat system rather than building a second one: `jobId` relaxed to
// nullable, a nullable `quickWorkRequestId` added, CHECK enforces exactly
// one context per conversation row.
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
  quickWorkRequestId: uuid('quick_work_request_id').references(() => quickWorkRequests.id, { onDelete: 'restrict' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessagePreview: varchar('last_message_preview', { length: 200 }),
  lastSenderId: uuid('last_sender_id').references(() => users.id, { onDelete: 'restrict' }),
  unreadEmployer: integer('unread_employer').notNull().default(0),
  unreadSeeker: integer('unread_seeker').notNull().default(0),
  translationLangSeeker: varchar('translation_lang_seeker', { length: 5 }),
  translationLangEmployer: varchar('translation_lang_employer', { length: 5 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('conversations_pair_job_unique').on(t.employerId, t.seekerId, t.jobId),
  uniqueIndex('conversations_pair_quick_work_unique').on(t.employerId, t.seekerId, t.quickWorkRequestId),
  index('conversations_employer_last_message_idx').on(t.employerId, t.lastMessageAt),
  index('conversations_seeker_last_message_idx').on(t.seekerId, t.lastMessageAt),
  index('conversations_job_id_idx').on(t.jobId),
  index('conversations_quick_work_request_id_idx').on(t.quickWorkRequestId),
  check(
    'conversations_exactly_one_context_check',
    sql`(${t.jobId} IS NOT NULL AND ${t.quickWorkRequestId} IS NULL)
        OR (${t.jobId} IS NULL AND ${t.quickWorkRequestId} IS NOT NULL)`,
  ),
]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: messageKindEnum('kind').notNull().default('text'),
  body: varchar('body', { length: 4000 }).notNull().default(''),
  attachment: jsonb('attachment'),
  templateKey: varchar('template_key', { length: 80 }),
  transcript: varchar('transcript', { length: 4000 }),
  translation: jsonb('translation'),
  translationStatus: translationStatusEnum('translation_status').notNull().default('none'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('messages_conversation_created_idx').on(t.conversationId, t.createdAt), index('messages_sender_id_idx').on(t.senderId)]);

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  amount: integer('amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  kind: walletKindEnum('kind').notNull(),
  status: walletStatusEnum('status').notNull().default('pending'),
  description: varchar('description', { length: 240 }).notNull(),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  quickWorkRequestId: uuid('quick_work_request_id').references(() => quickWorkRequests.id, { onDelete: 'restrict' }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  grossPaise: integer('gross_paise'),
  feePaise: integer('fee_paise'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('wallet_transactions_user_created_idx').on(t.userId, t.createdAt),
  index('wallet_transactions_job_id_idx').on(t.jobId),
  index('wallet_transactions_application_id_idx').on(t.applicationId),
  index('wallet_transactions_quick_work_request_id_idx').on(t.quickWorkRequestId),
  uniqueIndex('wallet_hire_payment_unique').on(t.userId, t.applicationId, t.kind),
  // The Jobs guard above can't cover Quick Work: a Quick Work credit has
  // applicationId NULL, and Postgres never collides NULLs in a unique
  // index — so two payment intents raised on one request would BOTH
  // credit the worker. This is the exact mirror of that guard, scoped to
  // the Quick Work context column (and inert for non-Quick-Work rows,
  // whose quickWorkRequestId is itself NULL).
  uniqueIndex('wallet_quick_work_payment_unique').on(t.userId, t.quickWorkRequestId, t.kind),
]);

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  refereeId: uuid('referee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  status: referralStatusEnum('status').notNull().default('pending'),
  bonusPaise: integer('bonus_paise'),
  hiredAt: timestamp('hired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('referrals_pair_job_unique').on(t.referrerId, t.refereeId, t.jobId), index('referrals_referrer_created_idx').on(t.referrerId, t.createdAt), index('referrals_referee_job_status_idx').on(t.refereeId, t.jobId, t.status), index('referrals_application_id_idx').on(t.applicationId)]);

export const homeSafeChecks = pgTable('home_safe_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: homeSafeStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('home_safe_checks_seeker_status_started_idx').on(t.seekerId, t.status, t.startedAt), index('home_safe_checks_application_id_idx').on(t.applicationId), index('home_safe_checks_job_id_idx').on(t.jobId), index('home_safe_checks_employer_id_idx').on(t.employerId)]);

// One rating per (reviewer, application) — a party rates the other side
// once per job. `role` is the REVIEWEE's role: 'seeker' means a seeker
// received the rating. `anonymous` only hides the reviewer identity in the
// public view (see toPublicRating() in rating.service.ts) — reviewerId is
// always stored for abuse review and the (reviewerId, applicationId)
// uniqueness check.
//
// employer-plan.md §18's schema decision, resolved as Option A: applicationId
// + jobId relaxed to nullable, a nullable quickWorkRequestId added, and a
// CHECK enforces exactly one context per row (Jobs: both application+job
// set, Quick Work: neither) — one `ratings` table, one
// `summarizeForUsers()` aggregation continues to cover both, per the
// brief's explicit "reuse existing rating infrastructure" instruction.
export const ratings = pgTable('ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  revieweeId: uuid('reviewee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
  quickWorkRequestId: uuid('quick_work_request_id').references(() => quickWorkRequests.id, { onDelete: 'restrict' }),
  role: ratingRoleEnum('role').notNull(),
  score: integer('score').notNull(),
  comment: varchar('comment', { length: 500 }),
  tags: text('tags').array().notNull().default([]),
  anonymous: boolean('anonymous').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('ratings_reviewer_application_unique').on(t.reviewerId, t.applicationId),
  uniqueIndex('ratings_reviewer_quick_work_unique').on(t.reviewerId, t.quickWorkRequestId),
  index('ratings_reviewee_created_idx').on(t.revieweeId, t.createdAt),
  index('ratings_reviewee_role_idx').on(t.revieweeId, t.role),
  index('ratings_application_id_idx').on(t.applicationId),
  index('ratings_job_id_idx').on(t.jobId),
  index('ratings_quick_work_request_id_idx').on(t.quickWorkRequestId),
  check('ratings_score_check', sql`${t.score} BETWEEN 1 AND 5`),
  check(
    'ratings_exactly_one_context_check',
    sql`(${t.applicationId} IS NOT NULL AND ${t.jobId} IS NOT NULL AND ${t.quickWorkRequestId} IS NULL)
        OR (${t.applicationId} IS NULL AND ${t.jobId} IS NULL AND ${t.quickWorkRequestId} IS NOT NULL)`,
  ),
]);

export const blockedWorkers = pgTable('blocked_workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('blocked_workers_pair_unique').on(t.employerId, t.workerId), index('blocked_workers_employer_idx').on(t.employerId)]);

export const tailoredResumes = pgTable('tailored_resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  summary: text('summary').notNull(), pitch: text('pitch').notNull(),
  highlightedSkills: text('highlighted_skills').array().notNull().default([]),
  matchedSkills: text('matched_skills').array().notNull().default([]),
  workBlurbs: jsonb('work_blurbs').$type<Array<{ company: string; role: string; blurb: string }>>().notNull().default([]), provider: varchar('provider', { length: 32 }).notNull().default('mock'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('tailored_resumes_seeker_job_unique').on(t.seekerId, t.jobId), index('tailored_resumes_job_id_idx').on(t.jobId)]);

export const employerResponseSettings = pgTable('employer_response_settings', {
  id: uuid('id').primaryKey().defaultRandom(), employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  quietHoursEnabled: boolean('quiet_hours_enabled').notNull().default(false), quietStartHour: integer('quiet_start_hour').notNull().default(21), quietEndHour: integer('quiet_end_hour').notNull().default(7), autoReply: varchar('auto_reply', { length: 1000 }).notNull().default(''), smsApplicantAlerts: boolean('sms_applicant_alerts').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('employer_response_settings_employer_unique').on(t.employerId)]);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(), recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'restrict' }), kind: notificationKindEnum('kind').notNull(), title: varchar('title', { length: 160 }).notNull(), body: varchar('body', { length: 1000 }).notNull(), deeplink: jsonb('deeplink'), imageUrl: text('image_url'), readAt: timestamp('read_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('notifications_recipient_created_idx').on(t.recipientId, t.createdAt), index('notifications_recipient_unread_idx').on(t.recipientId, t.readAt)]);
