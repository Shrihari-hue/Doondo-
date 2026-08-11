/**
 * Zod schemas for the /me/alerts endpoints.
 */

import { z } from 'zod';
import { JOB_TYPES } from '@/modules/jobs/job.model';

const upsertBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    query: z.string().trim().max(120).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    jobTypes: z.array(z.enum(JOB_TYPES)).max(5).optional(),
    urgentOnly: z.boolean().optional(),
    radiusKm: z.number().min(0).max(200).nullable().optional(),
    coordinates: z
      .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
      .nullable()
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const createAlertSchema = z.object({
  body: upsertBody,
});

export const updateAlertSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid alert id'),
  }),
  body: upsertBody.partial(),
});

export const alertIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid alert id'),
  }),
});
