import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { geometry } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { users } from './users';

export const applicationStatusEnum = pgEnum('application_status', [
  'pending', 'viewed', 'shortlisted', 'rejected', 'hired', 'withdrawn',
]);
export const interviewModeEnum = pgEnum('interview_mode', ['in_person', 'video', 'phone']);
export const interviewStatusEnum = pgEnum('interview_status', ['scheduled', 'cancelled', 'completed']);
export const offerStatusEnum = pgEnum('offer_status', ['pending', 'accepted', 'declined', 'expired', 'countered']);
export const shiftConfirmationStatusEnum = pgEnum('shift_confirmation_status', ['none', 'awaiting', 'confirmed', 'declined']);
export const paymentStatusEnum = pgEnum('payment_status', ['none', 'seeker_confirmed', 'employer_confirmed', 'confirmed', 'disputed']);
export const shiftCheckinKindEnum = pgEnum('shift_checkin_kind', ['check_in', 'check_out']);

export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type InterviewMode = (typeof interviewModeEnum.enumValues)[number];

export interface TeamMemberJson { name: string; phone: string }
export interface PaymentMetadataJson { seekerConfirmedAt?: string | null; employerConfirmedAt?: string | null; disputedAt?: string | null; disputeNote?: string | null }
export interface InterviewDetailsJson { location?: string | null; meetingLink?: string | null; notes?: string | null; scheduledAt?: string | null; cancelledAt?: string | null; reminderSentAt?: string | null }
export interface OfferDetailsJson { madeAt?: string; respondedAt?: string | null; wageAmount?: number | null; counterWageAmount?: number | null }
export interface TailoredResumeJson { summary: string; pitch: string; highlightedSkills: string[]; matchedSkills: string[]; workBlurbs: Array<{ company: string; role: string; blurb: string }> }

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  status: applicationStatusEnum('status').notNull().default('pending'),
  coverNote: varchar('cover_note', { length: 500 }),
  expressedAsInterest: boolean('expressed_as_interest').notNull().default(false),
  teamSizeSnapshot: integer('team_size_snapshot'),
  teamMembers: jsonb('team_members').$type<TeamMemberJson[]>().notNull().default([]),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('none'),
  paymentMetadata: jsonb('payment_metadata').$type<PaymentMetadataJson | null>(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  viewedAt: timestamp('viewed_at', { withTimezone: true }),
  shortlistedAt: timestamp('shortlisted_at', { withTimezone: true }),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  hiredAt: timestamp('hired_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  rejectionReasons: text('rejection_reasons').array(),
  flaggedAsGhostedAt: timestamp('flagged_as_ghosted_at', { withTimezone: true }),
  interviewAt: timestamp('interview_at', { withTimezone: true }),
  interviewStatus: interviewStatusEnum('interview_status'),
  interviewMode: interviewModeEnum('interview_mode'),
  interviewDetails: jsonb('interview_details').$type<InterviewDetailsJson | null>(),
  nextShiftAt: timestamp('next_shift_at', { withTimezone: true }),
  prepAcknowledgedAt: timestamp('prep_acknowledged_at', { withTimezone: true }),
  shiftConfirmationStatus: shiftConfirmationStatusEnum('shift_confirmation_status').notNull().default('none'),
  shiftConfirmationPromptedAt: timestamp('shift_confirmation_prompted_at', { withTimezone: true }),
  shiftConfirmationConfirmedAt: timestamp('shift_confirmation_confirmed_at', { withTimezone: true }),
  shiftConfirmationDeclinedAt: timestamp('shift_confirmation_declined_at', { withTimezone: true }),
  offerStatus: offerStatusEnum('offer_status'),
  offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true }),
  offerDetails: jsonb('offer_details').$type<OfferDetailsJson | null>(),
  onTheWayStartedAt: timestamp('on_the_way_started_at', { withTimezone: true }),
  onTheWayEtaMinutes: integer('on_the_way_eta_minutes'),
  tailoredResume: jsonb('tailored_resume').$type<TailoredResumeJson | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('applications_seeker_job_unique').on(t.seekerId, t.jobId),
  index('applications_seeker_id_idx').on(t.seekerId),
  index('applications_employer_id_idx').on(t.employerId),
  index('applications_job_id_idx').on(t.jobId),
  index('applications_seeker_created_idx').on(t.seekerId, t.createdAt),
  index('applications_employer_status_created_idx').on(t.employerId, t.status, t.createdAt),
  index('applications_job_employer_status_created_idx').on(t.jobId, t.employerId, t.status, t.createdAt),
  index('applications_status_next_shift_idx').on(t.status, t.nextShiftAt),
  index('applications_offer_status_expires_idx').on(t.offerStatus, t.offerExpiresAt),
  index('applications_interview_status_at_idx').on(t.interviewStatus, t.interviewAt),
  index('applications_ghost_sweep_idx').on(t.status, t.appliedAt, t.flaggedAsGhostedAt),
  check('applications_team_size_snapshot_check', sql`${t.teamSizeSnapshot} IS NULL OR ${t.teamSizeSnapshot} BETWEEN 2 AND 50`),
  check('applications_team_members_array_check', sql`jsonb_typeof(${t.teamMembers}) = 'array' AND jsonb_array_length(${t.teamMembers}) <= 4`),
]);

export const shiftCheckIns = pgTable('shift_check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  seekerId: uuid('seeker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  employerId: uuid('employer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'restrict' }),
  kind: shiftCheckinKindEnum('kind').notNull(),
  selfieUrl: text('selfie_url').notNull(),
  geo: geometry('geo', { type: 'point', mode: 'xy' }).notNull(),
  distanceFromJobMeters: integer('distance_from_job_meters'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('shift_check_ins_application_id_idx').on(t.applicationId),
  index('shift_check_ins_seeker_id_idx').on(t.seekerId),
  index('shift_check_ins_employer_id_idx').on(t.employerId),
  index('shift_check_ins_job_id_idx').on(t.jobId),
  index('shift_check_ins_application_timestamp_idx').on(t.applicationId, t.timestamp),
  index('shift_check_ins_seeker_timestamp_idx').on(t.seekerId, t.timestamp),
  index('shift_check_ins_employer_timestamp_idx').on(t.employerId, t.timestamp),
  index('shift_check_ins_geo_gist_idx').using('gist', t.geo),
  check('shift_check_ins_distance_check', sql`${t.distanceFromJobMeters} IS NULL OR ${t.distanceFromJobMeters} >= 0`),
]);
