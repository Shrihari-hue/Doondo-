/**
 * Zod schemas for the verification module.
 *
 * Conventions match the rest of the API: `validate(schema)` middleware
 * expects { body, params, query } at the top level.
 */

import { z } from 'zod';

// E.164-ish: optional leading + then 6..15 digits. We canonicalise on the
// server (issueOtp prepends +91 if no country code) but reject obvious junk
// here so we don't waste an SMS on garbage.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{6,20}$/, 'Enter a valid phone number');

export const startPhoneSchema = z.object({
  body: z
    .object({
      phone: phoneSchema,
    })
    .strict(),
});

export const verifyPhoneSchema = z.object({
  body: z
    .object({
      phone: phoneSchema,
      // 6-digit numeric. Accept with leading/trailing whitespace just in case
      // the keypad input grabs a stray space.
      code: z
        .string()
        .trim()
        .regex(/^[0-9]{6}$/, 'Enter the 6-digit code'),
    })
    .strict(),
});

export const uploadSelfieSchema = z.object({
  body: z
    .object({
      // Selfies need more bytes than avatars (face detail matters more for
      // verification review) so this cap is bumped vs photoUrl. Mobile
      // still compresses aggressively before send (~quality 0.4 + resize).
      selfieUrl: z
        .string()
        .max(900_000, 'Selfie image is too large; please retake.')
        .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/i, 'Selfie must be a data URL'),
    })
    .strict(),
});
