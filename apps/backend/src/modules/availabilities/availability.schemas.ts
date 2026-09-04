/**
 * Zod schemas for the availability endpoints.
 */

import { z } from 'zod';
import { JOB_TYPES, PAY_PERIODS } from '@/modules/jobs/job.model';

/** Max beacon duration — 8 hours. Beyond that it stops being "available NOW". */
export const MAX_DURATION_MINUTES = 8 * 60;

const recurringPatternSchema = z
  .object({
    /** 0=Sun..6=Sat. */
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:MM'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be HH:MM'),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.startTime >= v.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be after startTime',
      });
    }
  });

export const upsertAvailabilitySchema = z.object({
  body: z
    .object({
      /** How many minutes the beacon should stay live. 30 / 60 / 120 / 240 / 480 etc. */
      durationMinutes: z.number().int().min(15).max(MAX_DURATION_MINUTES),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      city: z.string().trim().max(80).nullable().optional(),
      area: z.string().trim().max(80).nullable().optional(),
      tradesAvailable: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
      jobTypes: z.array(z.enum(JOB_TYPES)).max(5).default([]),
      note: z.string().trim().max(240).nullable().optional(),
      /**
       * Optional weekly recurring window. When provided, the doc lives
       * for 30 days (the rolling TTL) instead of just `durationMinutes`,
       * and the seeker is considered live during any pattern window.
       */
      recurringPattern: recurringPatternSchema.nullable().optional(),
      /**
       * Open shift (#40) — set both to turn a plain "I'm free" beacon
       * into a full posted open shift with a named wage, which also
       * triggers a nearby-employer push fan-out on publish. Omit both
       * for a plain beacon.
       */
      wageAmount: z.number().int().positive().max(10_000_000).nullable().optional(),
      wagePeriod: z.enum(PAY_PERIODS).nullable().optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if ((v.wageAmount == null) !== (v.wagePeriod == null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['wagePeriod'],
          message: 'wageAmount and wagePeriod must be set together.',
        });
      }
    }),
});

/** PATCH /me/availability/pause — a dedicated toggle, see availability.service.ts#setPaused. */
export const pauseAvailabilitySchema = z.object({
  body: z.object({ paused: z.boolean() }).strict(),
});

export const nearbyAvailabilitiesQuerySchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    /** Default 10km radius — wider than Today because employers will
     *  drive a bit further to pick up a worker than a worker will walk. */
    radius: z.coerce.number().int().min(100).max(50_000).default(10_000),
    /** Filter by single trade slug. Optional. */
    trade: z.string().trim().min(1).max(40).optional(),
    /** Filter by exact catalog service id (Quick Work eligibility). Optional. */
    serviceId: z.string().uuid().optional(),
    /** Filter by job type. Optional. */
    type: z.enum(JOB_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
