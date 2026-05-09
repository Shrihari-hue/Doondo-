/**
 * Zod schemas for the applications module.
 */

import { z } from 'zod';
import { Types } from 'mongoose';
import { APPLICATION_STATUSES } from './application.model';

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
