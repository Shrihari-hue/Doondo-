/**
 * Zod schemas for the chat module.
 */

import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdSchema = z.string().refine((v) => Types.ObjectId.isValid(v), {
  message: 'Invalid id',
});

export const conversationIdParamsSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

export const listMessagesSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  query: z.object({
    /** Cursor: createdAt of the oldest message you have. */
    before: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export const sendMessageSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
  }),
});
