/**
 * Quick Work — on-demand service request lifecycle (Postgres/Drizzle
 * native, no Mongo predecessor — this is genuinely new, per
 * employer-plan.md §9 / §2.8: no `quick_work_*` table existed anywhere
 * before this file).
 *
 * Does NOT overload the `jobs` table (a Job is planned employment; a
 * Quick Work request is on-demand). Uses the same PostGIS `geometry(Point)`
 * + GIST-index pattern already proven on `jobs.geo` (see jobs.ts's own doc
 * comment) rather than jsonb, since this table needs real
 * `ST_DWithin`/`ST_Distance` queries from day one (matching, §11).
 *
 * `geo` is nullable at the column level — a DRAFT request may not have a
 * location yet; the `DRAFT -> POSTED` transition (quickWork.service.ts)
 * enforces it's set before posting, the same "app-level guard, not a
 * NOT NULL column" approach state-dependent required fields need.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { geometry } from 'drizzle-orm/pg-core';
import { users } from './users';
import { serviceCategories, services } from './catalog';

export const quickWorkStatusEnum = pgEnum('quick_work_status', [
  'draft', 'posted', 'matching', 'offered', 'accepted', 'arriving', 'arrived',
  'in_progress', 'completed', 'payment_pending', 'paid', 'rated',
  'cancelled', 'expired', 'no_worker_found', 'disputed',
]);
export type QuickWorkStatus = (typeof quickWorkStatusEnum.enumValues)[number];

export const quickWorkOfferStatusEnum = pgEnum('quick_work_offer_status', [
  'offered', 'accepted', 'declined', 'expired', 'superseded',
]);
export type QuickWorkOfferStatus = (typeof quickWorkOfferStatusEnum.enumValues)[number];

export const quickWorkCancelledByEnum = pgEnum('quick_work_cancelled_by', ['employer', 'worker', 'system']);

export const quickWorkRequests = pgTable(
  'quick_work_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => serviceCategories.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'restrict' }),

    title: varchar('title', { length: 120 }),
    description: varchar('description', { length: 2000 }),
    photos: text('photos').array().notNull().default([]),
    videos: text('videos').array().notNull().default([]),
    voiceNoteUrl: text('voice_note_url'),

    // [lng, lat] — same xy convention as jobs.geo.
    geo: geometry('geo', { type: 'point', mode: 'xy' }),
    address: varchar('address', { length: 240 }),
    city: varchar('city', { length: 80 }),

    isImmediate: boolean('is_immediate').notNull().default(true),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),

    budgetMin: integer('budget_min'),
    budgetMax: integer('budget_max'),
    estimatedPrice: integer('estimated_price'),
    finalPrice: integer('final_price'),

    status: quickWorkStatusEnum('status').notNull().default('draft'),
    matchedWorkerId: uuid('matched_worker_id').references(() => users.id, { onDelete: 'restrict' }),

    completionPhotoUrl: text('completion_photo_url'),
    completionNotes: varchar('completion_notes', { length: 1000 }),

    cancelledBy: quickWorkCancelledByEnum('cancelled_by'),
    cancellationReason: varchar('cancellation_reason', { length: 500 }),
    disputeReason: varchar('dispute_reason', { length: 500 }),

    // Scheduled Work — idempotency flag for the one-time "upcoming work"
    // reminder (quickWorkScheduling.service.ts). A plain timestamp column
    // rather than an in-memory/queue flag so the sweep is safe across
    // restarts and concurrent runs (compare-and-swap on IS NULL).
    scheduledReminderSentAt: timestamp('scheduled_reminder_sent_at', { withTimezone: true }),

    // Price approval (employer-plan.md gap #4) — the employer must
    // explicitly approve the worker's submitted finalPrice before a
    // payment intent can be created for it (see payment.routes.ts).
    priceApprovedAt: timestamp('price_approved_at', { withTimezone: true }),

    // No-show — metadata only, deliberately not a new terminal status:
    // the request stays in its existing status (accepted/arriving/arrived)
    // so the existing cancel/dispute transitions keep working unmodified;
    // this just records who failed to show and why, for both a UI banner
    // and notifications (quickWorkNoShow.service.ts).
    noShowBy: quickWorkCancelledByEnum('no_show_by'),
    noShowReason: varchar('no_show_reason', { length: 500 }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    matchingStartedAt: timestamp('matching_started_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    arrivingAt: timestamp('arriving_at', { withTimezone: true }),
    arrivingEtaMinutes: integer('arriving_eta_minutes'),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ratedAt: timestamp('rated_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('quick_work_requests_geo_gist_idx').using('gist', t.geo),
    index('quick_work_requests_employer_id_idx').on(t.employerId),
    index('quick_work_requests_matched_worker_id_idx').on(t.matchedWorkerId),
    index('quick_work_requests_status_idx').on(t.status),
    index('quick_work_requests_service_id_idx').on(t.serviceId),
    index('quick_work_requests_scheduled_at_idx').on(t.scheduledAt),
  ],
);

/** One row per candidate worker a request was offered to (employer-plan.md §9.1/§11.3). */
export const quickWorkOffers = pgTable(
  'quick_work_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull().references(() => quickWorkRequests.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    status: quickWorkOfferStatusEnum('status').notNull().default('offered'),
    distanceMeters: integer('distance_meters'),
    etaMinutes: integer('eta_minutes'),
    rankScore: numeric('rank_score'),
    offeredAt: timestamp('offered_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('quick_work_offers_request_id_idx').on(t.requestId),
    index('quick_work_offers_worker_id_status_idx').on(t.workerId, t.status),
    index('quick_work_offers_expires_at_idx').on(t.expiresAt),
  ],
);

/** Audit trail — one row per transition (employer-plan.md §10). */
export const quickWorkStatusHistory = pgTable(
  'quick_work_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull().references(() => quickWorkRequests.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quick_work_status_history_request_id_idx').on(t.requestId)],
);

export type QuickWorkRequest = typeof quickWorkRequests.$inferSelect;
export type QuickWorkOffer = typeof quickWorkOffers.$inferSelect;
