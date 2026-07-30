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
} from 'drizzle-orm/pg-core';
import { applications } from './applications';
import { jobs } from './jobs';
import { users } from './users';

export const messageKindEnum = pgEnum('message_kind', ['text', 'image', 'voice', 'video', 'system']);
export const translationStatusEnum = pgEnum('translation_status', ['none', 'pending', 'done', 'failed']);
export const walletKindEnum = pgEnum('wallet_kind', ['hire_payment', 'adjustment', 'cash_log', 'qr_collection', 'payout']);
export const walletStatusEnum = pgEnum('wallet_status', ['pending', 'settled', 'reversed']);
export const referralStatusEnum = pgEnum('referral_status', ['pending', 'hired', 'reverted']);
export const homeSafeStatusEnum = pgEnum('home_safe_status', ['pending', 'safe']);
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
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
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
  index('conversations_employer_last_message_idx').on(t.employerId, t.lastMessageAt),
  index('conversations_seeker_last_message_idx').on(t.seekerId, t.lastMessageAt),
  index('conversations_job_id_idx').on(t.jobId),
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
  settledAt: timestamp('settled_at', { withTimezone: true }),
  grossPaise: integer('gross_paise'),
  feePaise: integer('fee_paise'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('wallet_transactions_user_created_idx').on(t.userId, t.createdAt),
  index('wallet_transactions_job_id_idx').on(t.jobId),
  index('wallet_transactions_application_id_idx').on(t.applicationId),
  uniqueIndex('wallet_hire_payment_unique').on(t.userId, t.applicationId, t.kind),
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
  workBlurbs: jsonb('work_blurbs').notNull().default([]), provider: varchar('provider', { length: 32 }).notNull().default('mock'),
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
