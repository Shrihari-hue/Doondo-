/**
 * Zod schemas for the applications module.
 */

import { z } from 'zod';
import { Types } from 'mongoose';
import { APPLICATION_STATUSES, INTERVIEW_MODES } from './application.model';

const objectIdSchema = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid id',
});

export const applyParamsSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    coverNote: z.string().trim().max(500).optional(),
  }),
});

export const listApplicationsQuerySchema = z.object({
  query: z.object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    // Up to 100 — employer aggregator commonly hits this when many jobs
    // are open. Seeker /me typically returns far fewer; the cap is the
    // guardrail, not the expected size.
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const applicationIdParamsSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

// Employer-facing: applicants for one of MY jobs. /:id is the JOB id.
export const applicantsForJobSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  query: z.object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

/**
 * Mass-apply: a seeker submits a batch of jobIds in one go.
 *
 * Capped at 20 per call so we never let someone spam the entire city.
 * Each entry is processed independently — partial success is normal
 * (some succeed, others come back as already_applied / job_closed).
 */
export const massApplySchema = z.object({
  body: z
    .object({
      jobIds: z
        .array(objectIdSchema)
        .min(1, 'Pick at least one job')
        .max(20, 'You can apply to at most 20 jobs at once'),
      coverNote: z.string().trim().max(500).optional(),
    })
    .strict(),
});

/**
 * Interview scheduling (employer schedules / reschedules an interview on
 * one of their applications). POST is an upsert — first call schedules,
 * subsequent calls reschedule. DELETE cancels.
 */
export const scheduleInterviewSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      scheduledFor: z
        .string()
        .datetime({ message: 'scheduledFor must be ISO 8601' })
        .refine(
          (s) => new Date(s).getTime() > Date.now() - 60_000,
          'scheduledFor must be in the future',
        ),
      mode: z.enum(INTERVIEW_MODES),
      location: z.string().trim().min(1).max(240).optional(),
      meetingLink: z
        .string()
        .trim()
        .url({ message: 'meetingLink must be a valid URL' })
        .max(500)
        .optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      // In-person interviews need a location; video needs a meeting link.
      // Phone doesn't need either (it's just a number-call agreement).
      if (body.mode === 'in_person' && !body.location) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['location'],
          message: 'Location is required for in-person interviews.',
        });
      }
      if (body.mode === 'video' && !body.meetingLink) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['meetingLink'],
          message: 'A meeting link is required for video interviews.',
        });
      }
    }),
});
