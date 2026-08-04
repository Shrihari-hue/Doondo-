/**
 * Zod schemas for the chat module.
 */

import { z } from 'zod';
const uuidSchema = z.string().uuid({ message: 'Invalid id' });

export const conversationIdParamsSchema = z.object({
  params: z.object({ id: uuidSchema }),
});

/** Params for the "retry translation of one message" endpoint. */
export const retranslateSchema = z.object({
  params: z.object({ id: uuidSchema, messageId: uuidSchema }),
});

/**
 * "Start a chat from an application" — used by the seeker NewChat flow.
 * Server checks that the caller is the seeker on that application and
 * idempotently returns the conversation (creating it if needed).
 */
export const ensureConversationFromAppSchema = z.object({
  body: z.object({
    applicationId: uuidSchema,
  }),
});

export const listMessagesSchema = z.object({
  params: z.object({ id: uuidSchema }),
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
    /**
     * Sparse audio-level samples (0..1) captured while recording a
     * voice note — drives the playback waveform. Length capped at the
     * client's MAX_WAVEFORM_SAMPLES (64) plus a small safety margin so
     * a future bump doesn't break the schema right away.
     */
    waveform: z.array(z.number().min(0).max(1)).max(128).nullable().optional(),
  })
  .nullable()
  .optional();

export const sendMessageSchema = z.object({
  params: z.object({ id: uuidSchema }),
  body: z
    .object({
      /** Text body OR caption. Required for text, optional for media. */
      body: z.string().trim().max(4000).optional(),
      kind: z.enum(['text', 'image', 'voice', 'video']).optional(),
      attachment: attachmentSchema,
      /**
       * Quick-reply template key (e.g. `quick_replies.emp.when_can_start`).
       * Optional; only meaningful on text messages. Stored opaquely so
       * the recipient's app can render it in their own language.
       */
      templateKey: z.string().trim().min(1).max(80).optional(),
    })
    .superRefine((b, ctx) => {
      const kind = b.kind ?? 'text';
      if (b.templateKey && kind !== 'text') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['templateKey'],
          message: 'templateKey is only valid on text messages',
        });
      }
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
