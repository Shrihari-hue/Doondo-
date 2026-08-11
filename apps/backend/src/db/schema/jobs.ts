/**
 * Postgres port of the Mongoose `Job` model (src/modules/jobs/job.model.ts).
 *
 * Unlike the Users port (Phase 1), this table gets a REAL PostGIS
 * `geometry(Point)` column for location — Jobs is exactly the domain
 * that needs `ST_DWithin`/`ST_Distance` (nearby/today/this-week/preview
 * feeds), so there's no reason to defer it to jsonb the way `users.location`
 * still is. `employerId` is a real FK to `users.id` — both tables now live
 * in the same Postgres database (Users was ported in Phase 1), so this is
 * a genuine foreign key, not just a Mongo-style loose reference.
 *
 * `pay` gets real columns (not jsonb) because getWageBenchmark() filters/
 * aggregates on amount+period+type+city — needs to be indexable/queryable,
 * not opaque JSON.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { geometry } from 'drizzle-orm/pg-core';
import { users } from './users';

export const jobTypeEnum = pgEnum('job_type', ['full_time', 'part_time', 'gig', 'shift', 'contract']);
export const workModeEnum = pgEnum('work_mode', ['onsite', 'hybrid', 'remote']);
export const payPeriodEnum = pgEnum('pay_period', ['hour', 'day', 'week', 'month', 'fixed']);
export type PayPeriod = (typeof payPeriodEnum.enumValues)[number];
export const jobStatusEnum = pgEnum('job_status', ['active', 'paused', 'filled', 'expired']);
export type JobType = (typeof jobTypeEnum.enumValues)[number];

// ─── JSONB payload shapes (mirror the Mongoose sub-schemas) ────────────────

export interface JobScheduleJson {
  days?: number[];
  startTime?: string | null;
  endTime?: string | null;
  hoursPerDay?: number | null;
}

export interface JobEscalationJson {
  stage: number;
  lastEscalatedAt: string | null; // ISO
  boostedUntil: string | null; // ISO
}

export interface WorkplaceAnswersJson {
  paysOnTime?: boolean | null;
  overtimePaid?: boolean | null;
  providesPpe?: boolean | null;
  writtenContract?: boolean | null;
  womensFacilities?: boolean | null;
}

export interface WomenSafetyJson {
  separateFacilities: boolean;
  womenOnTeam: boolean;
  dayShiftOnly: boolean;
  safeTransport: boolean;
  harassmentPolicy: boolean;
}

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employerId: uuid('employer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 120 }).notNull(),
    description: varchar('description', { length: 5000 }).notNull(),
    type: jobTypeEnum('type').notNull(),

    payAmount: integer('pay_amount').notNull(),
    payAmountMax: integer('pay_amount_max'),
    payPeriod: payPeriodEnum('pay_period').notNull(),
    payCurrency: varchar('pay_currency', { length: 3 }).notNull().default('INR'),

    address: varchar('address', { length: 240 }).notNull(),
    city: varchar('city', { length: 80 }).notNull(),
    area: varchar('area', { length: 80 }),
    pincode: varchar('pincode', { length: 12 }),
    // [lng, lat] — geometry mode 'xy' maps to/from {x,y}; x=lng, y=lat.
    geo: geometry('geo', { type: 'point', mode: 'xy' }).notNull(),

    skills: text('skills').array().notNull().default([]),
    workMode: workModeEnum('work_mode').notNull().default('onsite'),
    requiredSkillTestId: varchar('required_skill_test_id', { length: 60 }),
    headcount: integer('headcount').notNull().default(1),
    crewHeadStartUntil: timestamp('crew_head_start_until', { withTimezone: true }),
    recurring: boolean('recurring').notNull().default(false),
    prepChecklist: text('prep_checklist').array().notNull().default([]),
    projectStartDate: timestamp('project_start_date', { withTimezone: true }),
    projectEndDate: timestamp('project_end_date', { withTimezone: true }),
    escalation: jsonb('escalation').$type<JobEscalationJson | null>(),
    schedule: jsonb('schedule').$type<JobScheduleJson | null>(),
    status: jobStatusEnum('status').notNull().default('active'),
    urgent: boolean('urgent').notNull().default(false),
    safeForWomen: boolean('safe_for_women').notNull().default(false),
    applicantsCount: integer('applicants_count').notNull().default(0),
    viewsCount: integer('views_count').notNull().default(0),
    audioDescriptionUrl: text('audio_description_url'),
    audioDescriptionDurationSeconds: integer('audio_description_duration_seconds'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    workplaceAnswers: jsonb('workplace_answers').$type<WorkplaceAnswersJson | null>(),
    womenSafety: jsonb('women_safety').$type<WomenSafetyJson | null>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jobs_geo_gist_idx').using('gist', t.geo),
    index('jobs_status_city_created_idx').on(t.status, t.city, t.createdAt),
    index('jobs_employer_id_idx').on(t.employerId),
    index('jobs_type_idx').on(t.type),
    index('jobs_crew_head_start_until_idx').on(t.crewHeadStartUntil),
    index('jobs_recurring_idx').on(t.recurring),
    index('jobs_work_mode_idx').on(t.workMode),
    index('jobs_status_idx').on(t.status),
    index('jobs_urgent_idx').on(t.urgent),
    index('jobs_safe_for_women_idx').on(t.safeForWomen),
    index('jobs_expires_at_idx').on(t.expiresAt),
  ],
);
