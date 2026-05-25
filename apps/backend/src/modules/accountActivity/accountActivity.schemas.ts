/**
 * Zod schema for the account-activity endpoint.
 */

import { z } from 'zod';

export const accountActivitySchema = z.object({
  body: z
    .object({
      /**
       * Refresh tokens of the *other* accounts saved on this device.
       * Each proves ownership of one account; the server reads it
       * read-only (no rotation). Capped so a single call can't fan out.
       */
      refreshTokens: z
        .array(z.string().min(10).max(4096))
        .max(5)
        .default([]),
    })
    .strict(),
});
