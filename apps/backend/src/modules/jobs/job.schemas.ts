/**
 * Zod schemas for the jobs module — request validation lives here.
 *
 * The objectIdSchema helper guards every :id param. Coercion on number
 * query strings (lat/lng/radius) avoids tripping over Express stringy
 * query semantics.
 */

import { z } from 'zod';
import { Types } from 'mongoose';
import { JOB_TYPES, PAY_PERIODS, WORK_MODES } from './job.model';

const objectIdSchema = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid id',
});

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const radius = z.coerce.number().int().min(100).max(50_000); // meters

export const nearbyQuerySchema = z.object({
  query: z.object({
    lat,
    lng,
    /** Default 5km radius — matches the "walking distance" pitch's outer ring. */
    radius: radius.default(5000),
    type: z.enum(JOB_TYPES).optional(),
    /** Filter to a single work mode. Omitted = all. */
    workMode: z.enum(WORK_MODES).optional(),
    /**
     * Narrow the feed to posts the employer marked "safe for women". The
     * flag is voluntary — seekers who don't care leave this off.
     */
    safeForWomenOnly: z.coerce.boolean().optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
  }),
});

/**
 * "Today" feed — urgent + freshly-posted gigs the seeker could start
 * within 24 hours. Same shape as the nearby query because the geoNear
 * stage is identical; the time-window filter is applied in the service.
 */
export const todayQuerySchema = z.object({
  query: z.object({
    lat,
    lng,
    /** Tighter default radius for the "show up today" use case. */
    radius: radius.default(7500),
    type: z.enum(JOB_TYPES).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

/**
 * "This week" feed — short contracts and shifts posted in the last 7
 * days. Slightly wider radius than Today since a worker is more willing
 * to commute for a week-long contract than a same-day gig.
 */
export const thisWeekQuerySchema = z.object({
  query: z.object({
    lat,
    lng,
    radius: radius.default(15000),
    type: z.enum(JOB_TYPES).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const jobIdParamsSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

// ─── Employer Job CRUD (Phase 3) ────────────────────────────────────────────

const paySchema = z.object({
  amount: z.number().int().min(0),
  amountMax: z.number().int().min(0).nullable().optional(),
  period: z.enum(PAY_PERIODS),
  currency: z.string().length(3).default('INR'),
});

const locationSchema = z.object({
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(80),
  area: z.string().trim().min(1).max(80).nullable().optional(),
  pincode: z.string().trim().regex(/^[0-9]{4,12}$/).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const scheduleSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    hoursPerDay: z.number().min(0).max(24).nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * Optional voice description — base64 data URL of an m4a/AAC clip. Cap
 * at ~1.4MB which comfortably fits a 60-second 64kbps recording with
 * base64 overhead.
 */
const audioDescriptionDataUrl = z
  .string()
  .max(1_500_000)
  .regex(/^data:audio\/(m4a|mp4|aac|x-m4a);base64,/i, 'Audio must be an m4a/AAC data URL');

export const createJobSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().min(10).max(5000),
      type: z.enum(JOB_TYPES),
      pay: paySchema,
      location: locationSchema,
      skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      schedule: scheduleSchema,
      /** Time-sensitive posting. Defaults to false. */
      urgent: z.boolean().default(false),
      /** Onsite (default), hybrid, or remote. */
      workMode: z.enum(WORK_MODES).optional(),
      /** Optional voice description — null to omit. */
      audioDescriptionUrl: audioDescriptionDataUrl.nullable().optional(),
      audioDescriptionDurationSeconds: z
        .number()
        .int()
        .min(1)
        .max(120)
        .nullable()
        .optional(),
    })
    .strict(),
});

export const updateJobSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      title: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().min(10).max(5000).optional(),
      type: z.enum(JOB_TYPES).optional(),
      pay: paySchema.optional(),
      location: locationSchema.optional(),
      skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      schedule: scheduleSchema,
      urgent: z.boolean().optional(),
      workMode: z.enum(WORK_MODES).optional(),
      audioDescriptionUrl: audioDescriptionDataUrl.nullable().optional(),
      audioDescriptionDurationSeconds: z
        .number()
        .int()
        .min(1)
        .max(120)
        .nullable()
        .optional(),
    })
    .strict(),
});

export const employerJobsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['active', 'paused', 'filled', 'expired']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>['query'];
export type TodayQuery = z.infer<typeof todayQuerySchema>['query'];
export type ThisWeekQuery = z.infer<typeof thisWeekQuerySchema>['query'];
export type CreateJobBody = z.infer<typeof createJobSchema>['body'];
export type UpdateJobBody = z.infer<typeof updateJobSchema>['body'];
