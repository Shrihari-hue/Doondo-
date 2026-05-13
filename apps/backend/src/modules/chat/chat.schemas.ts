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

/**
 * Allowed MIME types per attachment kind. Tighter than "any image" so a
 * misconfigured client can't push raw camera RAW files into the DB.
 */
const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
const VOICE_MIME = /^audio\/(m4a|mp4|aac|mpeg|webm|ogg|wav|x-m4a)$/i;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/i;

const attachmentSchema = z
  .object({
    /** Base64 data URL — cap matches express body limit headroom. */
    dataUrl: z
      .string()
      .min(20)
      .max(1_500_000)
      .regex(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, 'attachment.dataUrl must be a data URL'),
    mimeType: z.string().min(1).max(80),
    sizeBytes: z.number().int().min(1).max(5_000_000),
    width: z.number().int().min(1).max(20_000).nullable().optional(),
    height: z.number().int().min(1).max(20_000).nullable().optional(),
    durationSeconds: z.number().min(0).max(600).nullable().optional(),
  })
  .nullable()
  .optional();

export const sendMessageSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      /** Text body OR caption. Required for text, optional for media. */
      body: z.string().trim().max(4000).optional(),
      kind: z.enum(['text', 'image', 'voice', 'video']).optional(),
      attachment: attachmentSchema,
    })
    .superRefine((b, ctx) => {
      const kind = b.kind ?? 'text';
      if (kind === 'text') {
        if (!b.body || b.body.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['body'],
            message: 'Message cannot be empty',
          });
        }
        if (b.attachment) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attachment'],
            message: 'Text messages cannot have attachments',
          });
        }
      } else {
        if (!b.attachment) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attachment'],
            message: `${kind} messages require an attachment`,
          });
        } else {
          // MIME whitelist per kind.
          const ok =
            (kind === 'image' && IMAGE_MIME.test(b.attachment.mimeType)) ||
            (kind === 'voice' && VOICE_MIME.test(b.attachment.mimeType)) ||
            (kind === 'video' && VIDEO_MIME.test(b.attachment.mimeType));
          if (!ok) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['attachment', 'mimeType'],
              message: `Unsupported MIME type for ${kind}`,
            });
          }
        }
      }
    }),
});
