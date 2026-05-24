/**
 * Zod schemas for the employer-interest endpoints.
 */

import { z } from 'zod';
import { EMPLOYER_INTEREST_STATUSES } from './employerInterest.model';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** POST /employers/:id/interest — worker expresses interest. */
export const expressInterestSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      message: z.string().trim().max(240).nullable().optional(),
    })
    .strict()
    .default({}),
});

/** Routes scoped by an employer id in the path (withdraw, getMine). */
export const employerIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/** Routes scoped by an interest-row id in the path (viewed, archive). */
export const interestIdParamSchema = z.object({
  params: z.object({ id: objectId }),
});

/** GET /me/interested-workers — employer inbound list. */
export const listInterestedWorkersSchema = z.object({
  query: z
    .object({
      status: z.enum(EMPLOYER_INTEREST_STATUSES).optional(),
    })
    .default({}),
});
