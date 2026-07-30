/**
 * Zod schemas for the jobs module — request validation lives here.
 *
 * The objectIdSchema helper guards every :id param. Coercion on number
 * query strings (lat/lng/radius) avoids tripping over Express stringy
 * query semantics.
 */

import { z } from 'zod';
import { JOB_TYPES, PAY_PERIODS, WORK_MODES } from './job.model';

// Job ids are Postgres UUIDs (Phase 2 of the Mongo→Postgres migration
// ported the Jobs module) — was a Mongo ObjectId format check.
const objectIdSchema = z.string().uuid({ message: 'Invalid id' });

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
// Max 100km — matches the widest distance chip in the mobile UI (rural
// workers genuinely search that far). Was 50km, which made the 100km
// chip fail validation.
const radius = z.coerce.number().int().min(100).max(100_000); // meters

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
 * "60-second first match" preview — small, unauthenticated, deliberately
 * lightweight. Shown to a fresh role-picker right after they tap
 * "I'm looking for work" but before they sign up. Goal: a "found
 * something" moment in their first 60 seconds with the app.
 *
 * `trade` is a free-text bias hint (matched case-insensitively against
 * Job.title + Job.skills via a regex). `jobType` is an optional
 * job-type filter mirroring the rest of the jobs API.
 */
export const previewQuerySchema = z.object({
  query: z.object({
    lat,
    lng,
    /** Wider radius than Today because preview is the "first impression". */
    radius: radius.default(10_000),
    trade: z.string().trim().min(1).max(60).optional(),
    jobType: z.enum(JOB_TYPES).optional(),
    /** Capped at 5 — the preview screen renders a small stack, not a feed. */
    limit: z.coerce.number().int().min(1).max(5).default(3),
  }),
});
export type PreviewQuery = z.infer<typeof previewQuerySchema>['query'];

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

/**
 * "Doondo for Women" — the employer's declared women-safety signals.
 * Each is a plain boolean (defaulting to false so an omitted key is read
 * as "not asserted"). Omit the whole object to leave the section blank.
 */
const womenSafetySchema = z
  .object({
    separateFacilities: z.boolean().default(false),
    womenOnTeam: z.boolean().default(false),
    dayShiftOnly: z.boolean().default(false),
    safeTransport: z.boolean().default(false),
    harassmentPolicy: z.boolean().default(false),
  })
  .strict();

export const createJobSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(2).max(120),
      description: z.string().trim().min(10).max(5000),
      type: z.enum(JOB_TYPES),
      pay: paySchema,
      location: locationSchema,
      skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      /** Optional self-qualifying skill check — a SkillTest slug. */
      requiredSkillTestId: z.string().trim().min(1).max(60).nullable().optional(),
      /** How many people to hire. Defaults to 1. */
      headcount: z.number().int().min(1).max(100).optional(),
      /**
       * Offer-to-my-crew-first: hours to keep the post crew-only before it
       * goes public. Omit / 0 = public immediately.
       */
      crewFirstHours: z.number().int().min(0).max(72).optional(),
      /** Standing weekly shift — repeats on schedule.days. */
      recurring: z.boolean().optional(),
      /** Pre-shift checklist items the worker acknowledges. */
      prepChecklist: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
      /**
       * Multi-day project mode: an inclusive YYYY-MM-DD start/end. The
       * worker is hired for the whole span, not a single shift. Both must
       * be present together; end must not precede start.
       */
      projectStartDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'projectStartDate must be YYYY-MM-DD')
        .nullable()
        .optional(),
      projectEndDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'projectEndDate must be YYYY-MM-DD')
        .nullable()
        .optional(),
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
      /**
       * Reverse Interview — the employer's public answers to standard
       * worker questions. Each field is tri-state: true / false / null
       * (skipped). Omit the whole object if the employer didn't answer.
       */
      workplaceAnswers: z
        .object({
          paysOnTime: z.boolean().nullable().optional(),
          overtimePaid: z.boolean().nullable().optional(),
          providesPpe: z.boolean().nullable().optional(),
          writtenContract: z.boolean().nullable().optional(),
          womensFacilities: z.boolean().nullable().optional(),
        })
        .strict()
        .nullable()
        .optional(),
      /** "Doondo for Women" — employer-declared women-safety signals. */
      womenSafety: womenSafetySchema.nullable().optional(),
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
      /** "Doondo for Women" — employer-declared women-safety signals. */
      womenSafety: womenSafetySchema.nullable().optional(),
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
