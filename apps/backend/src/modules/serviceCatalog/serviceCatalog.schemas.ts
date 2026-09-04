/**
 * Zod schemas for the service-catalog endpoints.
 */

import { z } from 'zod';

export const listServicesSchema = z.object({
  query: z
    .object({
      categoryId: z.string().uuid('Invalid category id').optional(),
      q: z.string().trim().max(120).optional(),
    })
    .default({}),
});
