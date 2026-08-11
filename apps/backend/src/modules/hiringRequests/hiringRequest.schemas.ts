/**
 * Zod schemas for the hiring-request endpoints.
 */

import { z } from 'zod';
import { HIRING_REQUEST_STATUSES } from '@/db/schema';

const objectId = z.string().uuid('Invalid id');

export const sendHiringRequestSchema = z.object({
  body: z
    .object({
      /** The worker being invited. */
      seekerId: objectId,
      /** Which of the employer's active jobs the invite is for. */
      jobId: objectId,
      /** Optional short note shown to the worker. */
      message: z.string().trim().max(240).nullable().optional(),
    })
    .strict(),
});

export const hiringRequestIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const listReceivedHiringRequestsSchema = z.object({
  query: z
    .object({
      /** Optional status filter for the worker's inbox. */
      status: z.enum(HIRING_REQUEST_STATUSES).optional(),
    })
    .default({}),
});
