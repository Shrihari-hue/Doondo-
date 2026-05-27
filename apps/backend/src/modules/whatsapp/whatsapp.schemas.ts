/**
 * Zod schemas for the WhatsApp routes.
 *
 * The webhook payload is whatever Twilio POSTs us — we validate the
 * fields we care about and ignore the rest (Twilio adds new fields
 * over time and rejecting unknowns would be brittle).
 */

import { z } from 'zod';

// ─── Admin send endpoints ──────────────────────────────────────────────

const phoneNumber = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^(whatsapp:)?\+?\d{7,15}$/, 'Phone must be E.164 (e.g., +91...)');

export const sendTemplateSchema = z.object({
  body: z.object({
    to: phoneNumber,
    contentSid: z.string().regex(/^HX[0-9a-f]{32}$/i, 'Invalid Twilio Content SID'),
    variables: z.record(z.string()).optional(),
    userId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id')
      .optional(),
  }),
});

export const sendTextSchema = z.object({
  body: z.object({
    to: phoneNumber,
    body: z.string().trim().min(1).max(4096),
    mediaUrls: z.array(z.string().url()).max(10).optional(),
    userId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id')
      .optional(),
  }),
});

// ─── Inbox listing ─────────────────────────────────────────────────────

export const listMessagesSchema = z.object({
  query: z
    .object({
      direction: z.enum(['inbound', 'outbound']).optional(),
      from: phoneNumber.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    })
    .default({}),
});

// ─── Webhook payloads (Twilio) ─────────────────────────────────────────
//
// Inbound message webhook fields:
//   https://www.twilio.com/docs/messaging/guides/webhook-request
// Status callback fields:
//   https://www.twilio.com/docs/messaging/guides/track-delivery-status

export const inboundWebhookSchema = z.object({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string().default(''),
  NumMedia: z.string().optional(),
  // Twilio sends MediaUrl0, MediaUrl1, ... — we collect via passthrough.
}).passthrough();

export const statusCallbackSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.string().min(1),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
}).passthrough();
