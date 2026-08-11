/**
 * Zod schemas for the ratings endpoints. The Postgres `ratings` table
 * (src/db/schema/marketplace.ts) is the source of truth for data shape;
 * these enforce the request contract.
 *
 * applicationId and the reviewee/user `id` param reference Applications
 * and Users — all Postgres UUIDs — validate as UUIDs, not the old Mongo
 * ObjectId hex format.
 */

import { z } from 'zod';

const objectId = z.string().uuid('Invalid id');

export const createRatingBodySchema = z.object({
  body: z.object({
    applicationId: objectId,
    score: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
    /**
     * Structured tags — slugs from the per-role tag catalogue. Capped
     * at 6 to keep the review form skimmable. The service validates
     * each slug against the catalogue for the rating's direction
     * (seeker→employer uses one set, employer→seeker uses another).
     */
    tags: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
    /**
     * When true, the reviewer's name and photo are hidden in any
     * public listing — only the rating, comment, and tags surface.
     * Defaults to false. The Rating row still references the true
     * reviewer for abuse review and uniqueness enforcement.
     */
    anonymous: z.boolean().optional(),
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
