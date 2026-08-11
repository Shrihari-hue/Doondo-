/**
 * Postgres ports of the remaining Mongoose collections — Phase 1 of the
 * "finish the Mongo → Postgres migration" pass (advances, alerts,
 * availabilities, collect, community, courses/enrollments, crewDocuments,
 * disputes, employerInterest, endorsements, favorites, hiringRequests,
 * incidents, insurance, maskedCall, mentors, me/profileView, payments,
 * siteBriefing). Same conventions as marketplace.ts: uuid PKs, FKs to
 * users/jobs/applications with onDelete 'restrict', jsonb for embedded
 * Mongo subdocuments, timestamptz for dates.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { geometry } from 'drizzle-orm/pg-core';
import { applications } from './applications';
import { jobs, jobTypeEnum } from './jobs';
import { users } from './users';

// ─── Shared enums ───────────────────────────────────────────────────────────

/** 'employer' | 'seeker' — reused by disputes and masked-call sessions. */
export const partyRoleEnum = pgEnum('party_role', ['employer', 'seeker']);
export type PartyRole = (typeof partyRoleEnum.enumValues)[number];

// ─── advances ───────────────────────────────────────────────────────────────

export const advanceStatusEnum = pgEnum('advance_status', [
  'requested', 'approved', 'paid', 'repaid', 'declined', 'cancelled',
]);
export type AdvanceStatus = (typeof advanceStatusEnum.enumValues)[number];

export const advanceRequests = pgTable('advance_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  amountPaise: integer('amount_paise').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  reason: varchar('reason', { length: 400 }).notNull().default(''),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  status: advanceStatusEnum('status').notNull().default('requested'),
  repayBy: timestamp('repay_by', { withTimezone: true }),
  opsNote: varchar('ops_note', { length: 400 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('advance_requests_seeker_status_created_idx').on(t.seekerId, t.status, t.createdAt),
  check('advance_requests_amount_check', sql`${t.amountPaise} BETWEEN 50000 AND 500000`),
]);

// ─── alerts ─────────────────────────────────────────────────────────────────

export const jobAlerts = pgTable('job_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 80 }).notNull(),
  query: varchar('query', { length: 120 }),
  city: varchar('city', { length: 80 }),
  jobTypes: jobTypeEnum('job_types').array().notNull().default([]),
  urgentOnly: boolean('urgent_only').notNull().default(false),
  radiusKm: real('radius_km'),
  coordinates: jsonb('coordinates').$type<[number, number] | null>(),
  enabled: boolean('enabled').notNull().default(true),
  lastMatchedJobId: uuid('last_matched_job_id').references(() => jobs.id, { onDelete: 'restrict' }),
  lastMatchedAt: timestamp('last_matched_at', { withTimezone: true }),
  matchCount: integer('match_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('job_alerts_enabled_city_idx').on(t.enabled, t.city),
  index('job_alerts_seeker_id_idx').on(t.seekerId),
]);

// ─── availabilities ─────────────────────────────────────────────────────────

export interface RecurringPatternJson { days: number[]; startTime: string; endTime: string }

export const availabilities = pgTable('availabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  tradesAvailable: text('trades_available').array().notNull().default([]),
  jobTypes: jobTypeEnum('job_types').array().notNull().default([]),
  city: varchar('city', { length: 80 }),
  area: varchar('area', { length: 80 }),
  geo: geometry('geo', { type: 'point', mode: 'xy' }).notNull(),
  // Mongo TTL-deleted docs once `until` passed. Postgres has no native TTL —
  // reads filter on `until > now()` instead (see availability.service.ts);
  // rows aren't physically reclaimed automatically.
  until: timestamp('until', { withTimezone: true }).notNull(),
  recurringPattern: jsonb('recurring_pattern').$type<RecurringPatternJson | null>(),
  note: varchar('note', { length: 240 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('availabilities_seeker_unique').on(t.seekerId),
  index('availabilities_geo_gist_idx').using('gist', t.geo),
  index('availabilities_until_idx').on(t.until),
]);

// ─── collect ────────────────────────────────────────────────────────────────

export const COLLECT_QR_KINDS = ['open', 'fixed'] as const;
export const collectQrKindEnum = pgEnum('collect_qr_kind', COLLECT_QR_KINDS);
export type CollectQrKind = (typeof collectQrKindEnum.enumValues)[number];

export const collectQrs = pgTable('collect_qrs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: collectQrKindEnum('kind').notNull(),
  amountPaise: integer('amount_paise'),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  ref: varchar('ref', { length: 64 }).notNull(),
  payload: text('payload').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('collect_qrs_ref_unique').on(t.ref),
  index('collect_qrs_owner_created_idx').on(t.ownerId, t.createdAt),
]);

// ─── community ──────────────────────────────────────────────────────────────

export const postTypeEnum = pgEnum('post_type', [
  'text', 'photo', 'video', 'certificate', 'resume', 'voice',
]);
export type PostType = (typeof postTypeEnum.enumValues)[number];

export interface PostReplyJson { id: string; authorId: string; text: string; createdAt: string }
export interface PostCommentJson { id: string; authorId: string; text: string; replies: PostReplyJson[]; createdAt: string }
export interface ResharedSnapshotJson {
  authorId: string; type: string; text: string; mediaUrls: string[];
  certificateTitle: string | null; createdAt: string;
}

export const communityPosts = pgTable('community_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  type: postTypeEnum('type').notNull(),
  text: varchar('text', { length: 3000 }).notNull().default(''),
  mediaUrls: text('media_urls').array().notNull().default([]),
  certificateTitle: varchar('certificate_title', { length: 200 }),
  likes: uuid('likes').array().notNull().default([]),
  comments: jsonb('comments').$type<PostCommentJson[]>().notNull().default([]),
  repostCount: integer('repost_count').notNull().default(0),
  reshared: jsonb('reshared').$type<ResharedSnapshotJson | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('community_posts_created_idx').on(t.createdAt)]);

// ─── courses (enrollments) ──────────────────────────────────────────────────

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  courseId: varchar('course_id', { length: 80 }).notNull(),
  completedLessonIds: text('completed_lesson_ids').array().notNull().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('enrollments_seeker_course_unique').on(t.seekerId, t.courseId),
  index('enrollments_seeker_updated_idx').on(t.seekerId, t.updatedAt),
]);

// ─── crewDocuments ──────────────────────────────────────────────────────────

export const crewDocuments = pgTable('crew_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  label: varchar('label', { length: 80 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('crew_documents_employer_expires_idx').on(t.employerId, t.expiresAt)]);

// ─── disputes ───────────────────────────────────────────────────────────────

export const disputeCategoryEnum = pgEnum('dispute_category', [
  'no_show', 'payment', 'work_quality', 'behavior', 'hours', 'safety', 'other',
]);
export const disputeStatusEnum = pgEnum('dispute_status', [
  'open', 'awaiting_response', 'resolved', 'dismissed',
]);
export type DisputeCategory = (typeof disputeCategoryEnum.enumValues)[number];
export type DisputeStatus = (typeof disputeStatusEnum.enumValues)[number];

export interface DisputeResponseJson { byRole: 'employer' | 'seeker'; text: string; at: string }
export interface DisputeResolutionJson {
  outcome: 'resolved' | 'dismissed'; note: string | null; byRole: 'employer' | 'seeker'; at: string;
}

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  raisedByRole: partyRoleEnum('raised_by_role').notNull(),
  category: disputeCategoryEnum('category').notNull(),
  description: varchar('description', { length: 1000 }).notNull(),
  photoUrls: text('photo_urls').array().notNull().default([]),
  status: disputeStatusEnum('status').notNull().default('open'),
  responses: jsonb('responses').$type<DisputeResponseJson[]>().notNull().default([]),
  resolution: jsonb('resolution').$type<DisputeResolutionJson | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('disputes_employer_status_created_idx').on(t.employerId, t.status, t.createdAt),
  index('disputes_seeker_status_created_idx').on(t.seekerId, t.status, t.createdAt),
  index('disputes_application_id_idx').on(t.applicationId),
]);

// ─── employerInterest ───────────────────────────────────────────────────────

export const employerInterestStatusEnum = pgEnum('employer_interest_status', [
  'pending', 'viewed', 'archived',
]);
export type EmployerInterestStatus = (typeof employerInterestStatusEnum.enumValues)[number];

export const employerInterests = pgTable('employer_interests', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  message: varchar('message', { length: 240 }),
  status: employerInterestStatusEnum('status').notNull().default('pending'),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('employer_interests_pair_unique').on(t.seekerId, t.employerId),
  index('employer_interests_employer_status_created_idx').on(t.employerId, t.status, t.createdAt),
]);

// ─── endorsements ───────────────────────────────────────────────────────────

export const endorsements = pgTable('endorsements', {
  id: uuid('id').primaryKey().defaultRandom(),
  endorserId: uuid('endorser_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  trade: varchar('trade', { length: 40 }).notNull(),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('endorsements_endorser_seeker_trade_unique').on(t.endorserId, t.seekerId, t.trade),
  index('endorsements_seeker_trade_idx').on(t.seekerId, t.trade),
]);

export const photoVerifications = pgTable('photo_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  photoIndex: integer('photo_index').notNull(),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('photo_verifications_employer_seeker_photo_unique').on(t.employerId, t.seekerId, t.photoIndex),
  index('photo_verifications_seeker_photo_idx').on(t.seekerId, t.photoIndex),
  check('photo_verifications_photo_index_check', sql`${t.photoIndex} BETWEEN 0 AND 9`),
]);

// ─── favorites ──────────────────────────────────────────────────────────────

export const favoriteEmployers = pgTable('favorite_employers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('favorite_employers_pair_unique').on(t.workerId, t.employerId),
  index('favorite_employers_employer_idx').on(t.employerId),
]);

// ─── hiringRequests ─────────────────────────────────────────────────────────

export const HIRING_REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn', 'expired'] as const;
export const hiringRequestStatusEnum = pgEnum('hiring_request_status', HIRING_REQUEST_STATUSES);
export type HiringRequestStatus = (typeof hiringRequestStatusEnum.enumValues)[number];
/** Pending requests go stale after this many days with no response. */
export const HIRING_REQUEST_TTL_DAYS = 7;

export const hiringRequests = pgTable('hiring_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  message: varchar('message', { length: 240 }),
  status: hiringRequestStatusEnum('status').notNull().default('pending'),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('hiring_requests_seeker_status_created_idx').on(t.seekerId, t.status, t.createdAt),
  index('hiring_requests_employer_created_idx').on(t.employerId, t.createdAt),
  index('hiring_requests_dedupe_idx').on(t.employerId, t.seekerId, t.jobId, t.status),
]);

// ─── incidents ──────────────────────────────────────────────────────────────

export const incidentLogs = pgTable('incident_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  note: varchar('note', { length: 500 }).notNull(),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('incident_logs_employer_worker_created_idx').on(t.employerId, t.workerId, t.createdAt)]);

// ─── insurance ──────────────────────────────────────────────────────────────

export const insuranceTierEnum = pgEnum('insurance_tier', ['standard']);
export type InsuranceTier = (typeof insuranceTierEnum.enumValues)[number];
export const insuranceStatusEnum = pgEnum('insurance_status', [
  'pending', 'active', 'paused', 'cancelled',
]);
export type InsuranceStatus = (typeof insuranceStatusEnum.enumValues)[number];

export const insuranceSubscriptions = pgTable('insurance_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  tier: insuranceTierEnum('tier').notNull().default('standard'),
  monthlyPremiumPaise: integer('monthly_premium_paise').notNull(),
  status: insuranceStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  lastPaidAt: timestamp('last_paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('insurance_subscriptions_seeker_unique').on(t.seekerId)]);

// ─── maskedCall ─────────────────────────────────────────────────────────────

export const maskedCallModeEnum = pgEnum('masked_call_mode', ['proxy', 'reveal']);
export type MaskedCallMode = (typeof maskedCallModeEnum.enumValues)[number];

export const maskedCallSessions = pgTable('masked_call_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'restrict' }),
  callerId: uuid('caller_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  calleeId: uuid('callee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  callerRole: partyRoleEnum('caller_role').notNull(),
  mode: maskedCallModeEnum('mode').notNull(),
  provider: varchar('provider', { length: 40 }).notNull(),
  proxyNumber: varchar('proxy_number', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('masked_call_sessions_application_id_idx').on(t.applicationId),
  index('masked_call_sessions_caller_created_idx').on(t.callerId, t.createdAt),
]);

// ─── mentors ────────────────────────────────────────────────────────────────

export const mentorshipStatusEnum = pgEnum('mentorship_status', [
  'pending', 'accepted', 'declined', 'ended',
]);
export type MentorshipStatus = (typeof mentorshipStatusEnum.enumValues)[number];

export const mentors = pgTable('mentors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  trade: varchar('trade', { length: 60 }).notNull(),
  city: varchar('city', { length: 80 }).notNull(),
  bio: varchar('bio', { length: 600 }).notNull().default(''),
  monthlyCap: integer('monthly_cap').notNull().default(3),
  open: boolean('open').notNull().default(true),
  activeMentees: integer('active_mentees').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('mentors_user_unique').on(t.userId),
  index('mentors_trade_city_open_idx').on(t.trade, t.city, t.open),
]);

export const mentorshipRequests = pgTable('mentorship_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  menteeId: uuid('mentee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  mentorId: uuid('mentor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  trade: varchar('trade', { length: 60 }).notNull(),
  city: varchar('city', { length: 80 }).notNull(),
  message: varchar('message', { length: 400 }).notNull().default(''),
  status: mentorshipStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('mentorship_requests_mentee_mentor_status_idx').on(t.menteeId, t.mentorId, t.status)]);

// ─── me/profileView ─────────────────────────────────────────────────────────

export const profileViews = pgTable('profile_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  viewerId: uuid('viewer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** UTC calendar day of the view, YYYY-MM-DD. */
  day: varchar('day', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('profile_views_seeker_viewer_day_unique').on(t.seekerId, t.viewerId, t.day),
  index('profile_views_seeker_created_idx').on(t.seekerId, t.createdAt),
]);

// ─── payments ───────────────────────────────────────────────────────────────

export const paymentIntentStatusEnum = pgEnum('payment_intent_status', [
  'pending', 'in_progress', 'paid', 'failed', 'cancelled',
]);
export type PaymentIntentStatus = (typeof paymentIntentStatusEnum.enumValues)[number];

export const paymentIntents = pgTable('payment_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'restrict' }),
  amountPaise: integer('amount_paise').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  seekerVpa: varchar('seeker_vpa', { length: 80 }).notNull(),
  upiUri: text('upi_uri').notNull(),
  ref: varchar('ref', { length: 64 }).notNull(),
  status: paymentIntentStatusEnum('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('payment_intents_ref_unique').on(t.ref),
  index('payment_intents_employer_created_idx').on(t.employerId, t.createdAt),
  index('payment_intents_seeker_created_idx').on(t.seekerId, t.createdAt),
]);

// ─── siteBriefing ───────────────────────────────────────────────────────────

export const siteBriefings = pgTable('site_briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  text: varchar('text', { length: 1000 }).notNull().default(''),
  photoUrls: text('photo_urls').array().notNull().default([]),
  audioUrl: text('audio_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('site_briefings_job_unique').on(t.jobId)]);

// ─── skillTests ─────────────────────────────────────────────────────────────

export const skillTestAttempts = pgTable('skill_test_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  testId: varchar('test_id', { length: 80 }).notNull(),
  score: integer('score').notNull(),
  passingScore: integer('passing_score').notNull(),
  passed: boolean('passed').notNull(),
  answers: integer('answers').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index('skill_test_attempts_seeker_test_created_idx').on(t.seekerId, t.testId, t.createdAt)]);

// ─── sos ────────────────────────────────────────────────────────────────────

export const sosAlerts = pgTable('sos_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  triggeredBy: uuid('triggered_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  // Nullable — the device may not have a location fix at trigger time.
  geo: geometry('geo', { type: 'point', mode: 'xy' }),
  note: varchar('note', { length: 500 }),
  trustContactsPushed: uuid('trust_contacts_pushed').array().notNull().default([]),
  trustContactsUnmatched: text('trust_contacts_unmatched').array().notNull().default([]),
  peersPushed: uuid('peers_pushed').array().notNull().default([]),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('sos_alerts_geo_gist_idx').using('gist', t.geo),
  index('sos_alerts_triggered_by_created_idx').on(t.triggeredBy, t.createdAt),
  index('sos_alerts_resolved_created_idx').on(t.resolvedAt, t.createdAt),
]);

// ─── whatsapp ───────────────────────────────────────────────────────────────

export const whatsappDirectionEnum = pgEnum('whatsapp_direction', ['outbound', 'inbound']);
export type WhatsAppDirection = (typeof whatsappDirectionEnum.enumValues)[number];
export const whatsappStatusEnum = pgEnum('whatsapp_status', [
  'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'received',
]);
export type WhatsAppStatus = (typeof whatsappStatusEnum.enumValues)[number];

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Twilio's message SID (MM...). */
  sid: varchar('sid', { length: 64 }).notNull(),
  direction: whatsappDirectionEnum('direction').notNull(),
  /** "whatsapp:+E164" — the Twilio convention. */
  from: varchar('from', { length: 32 }).notNull(),
  to: varchar('to', { length: 32 }).notNull(),
  body: text('body').notNull().default(''),
  mediaUrls: text('media_urls').array(),
  status: whatsappStatusEnum('status').notNull(),
  /** Twilio Content Template SID (HX...) — set on template sends. */
  contentSid: varchar('content_sid', { length: 64 }),
  contentVariables: jsonb('content_variables').$type<Record<string, string> | null>(),
  errorCode: integer('error_code'),
  errorMessage: text('error_message'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('whatsapp_messages_sid_unique').on(t.sid),
  index('whatsapp_messages_direction_created_idx').on(t.direction, t.createdAt),
  index('whatsapp_messages_from_idx').on(t.from),
  index('whatsapp_messages_to_idx').on(t.to),
  index('whatsapp_messages_user_id_idx').on(t.userId),
]);

// ─── workerNotes ────────────────────────────────────────────────────────────

export const workerNotes = pgTable('worker_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  note: varchar('note', { length: 1000 }).notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex('worker_notes_employer_worker_unique').on(t.employerId, t.workerId)]);

// ─── workProof ──────────────────────────────────────────────────────────────

export const WORK_PROOF_STATUSES = ['submitted', 'approved', 'rejected'] as const;
export const workProofStatusEnum = pgEnum('work_proof_status', WORK_PROOF_STATUSES);
export type WorkProofStatus = (typeof workProofStatusEnum.enumValues)[number];

export const workProofs = pgTable('work_proofs', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'restrict' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** base64 image data URL of the completed work. */
  photoUrl: text('photo_url').notNull(),
  status: workProofStatusEnum('status').notNull().default('submitted'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('work_proofs_application_unique').on(t.applicationId),
  index('work_proofs_employer_id_idx').on(t.employerId),
  index('work_proofs_status_idx').on(t.status),
]);

// ─── users/scoreCredential ──────────────────────────────────────────────────

export const scoreCredentials = pgTable('score_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** Short, URL-safe lookup code embedded in the QR. */
  code: varchar('code', { length: 32 }).notNull(),
  /** Worker's display name at issue time. */
  name: varchar('name', { length: 120 }).notNull(),
  /** Score snapshot (0-100). */
  score: integer('score').notNull(),
  /** Scoring algorithm version. */
  scoreVersion: integer('score_version').notNull(),
  /** HMAC over the credential fields — integrity check on verify. */
  signature: text('signature').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('score_credentials_user_unique').on(t.userId),
  uniqueIndex('score_credentials_code_unique').on(t.code),
]);

// ─── laborBudget ──────────────────────────────────────────────────────────

export const budgetPeriodEnum = pgEnum('budget_period', ['week', 'month']);
export type BudgetPeriod = (typeof budgetPeriodEnum.enumValues)[number];

export const employerBudgets = pgTable('employer_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  period: budgetPeriodEnum('period').notNull().default('month'),
  amountPaise: integer('amount_paise').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('employer_budgets_employer_unique').on(t.employerId),
]);

// ─── reels ────────────────────────────────────────────────────────────────

export const reelStatusEnum = pgEnum('reel_status', ['active', 'hidden']);
export type ReelStatus = (typeof reelStatusEnum.enumValues)[number];

export const reels = pgTable('reels', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  videoUrl: varchar('video_url', { length: 2000 }).notNull(),
  thumbnailUrl: varchar('thumbnail_url', { length: 2000 }),
  durationSeconds: integer('duration_seconds').notNull(),
  caption: varchar('caption', { length: 140 }),
  status: reelStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('reels_seeker_unique').on(t.seekerId),
  index('reels_status_created_idx').on(t.status, t.createdAt),
]);

// ─── crew ───────────────────────────────────────────────────────────────────

export const crewMemberSourceEnum = pgEnum('crew_member_source', ['import', 'rehire', 'manual']);
export type CrewMemberSource = (typeof crewMemberSourceEnum.enumValues)[number];

export const crewMembers = pgTable('crew_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  source: crewMemberSourceEnum('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('crew_members_employer_worker_unique').on(t.employerId, t.workerId),
  index('crew_members_employer_created_idx').on(t.employerId, t.createdAt),
]);

// ─── moderation/userReports ─────────────────────────────────────────────────

export const userReportReasonEnum = pgEnum('user_report_reason', ['fake_profile', 'scam', 'abusive', 'no_show', 'other']);
export type UserReportReason = (typeof userReportReasonEnum.enumValues)[number];

export const userReportStatusEnum = pgEnum('user_report_status', ['open', 'reviewed', 'actioned', 'dismissed']);
export type UserReportStatus = (typeof userReportStatusEnum.enumValues)[number];

export const userReports = pgTable('user_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reportedUserId: uuid('reported_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reason: userReportReasonEnum('reason').notNull(),
  note: varchar('note', { length: 1000 }).notNull().default(''),
  status: userReportStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('user_reports_reporter_id_idx').on(t.reporterId),
  index('user_reports_reported_user_id_idx').on(t.reportedUserId),
  index('user_reports_status_idx').on(t.status),
]);

// ─── squads ─────────────────────────────────────────────────────────────────

export const squads = pgTable('squads', {
  id: uuid('id').primaryKey().defaultRandom(),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  workerIds: uuid('worker_ids').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('squads_employer_name_unique').on(t.employerId, t.name),
]);
