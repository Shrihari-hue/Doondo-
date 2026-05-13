/**
 * Zod schemas for the ratings endpoints. The mongoose schema is the
 * source of truth for data shape; these enforce the request contract.
 */

import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

export const createRatingBodySchema = z.object({
  body: z.object({
    applicationId: objectId,
    score: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  }),
});
export type CreateRatingBody = z.infer<typeof createRatingBodySchema>['body'];

export const listUserRatingsParamsSchema = z.object({
  params: z.object({
    id: objectId,
  }),
  query: z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().optional(),
    })
    .default({}),
});

export const myUnratedApplicationsQuerySchema = z.object({
  query: z
    .object({
      limit: z.coerce.number().int().min(1).max(20).default(10),
    })
    .default({}),
});
