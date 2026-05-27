/**
 * WhatsAppMessage — durable log of every WhatsApp message we send or
 * receive via Twilio.
 *
 * Why a model and not just logger output:
 *   - Two-way support chat needs an inbox. Admins read this collection,
 *     filter by `from`, and reply via /api/v1/whatsapp/send.
 *   - Twilio's status callbacks (delivered, read, failed) need somewhere
 *     to attach to — we key on `sid` and update `status`.
 *   - Audit / compliance: WhatsApp Business has strict rules around the
 *     24-hour customer-service window. Having the timestamps makes "can
 *     we send a freeform message right now?" answerable.
 *
 * Direction:
 *   - 'outbound' — sent by us via Messaging API (template or freeform)
 *   - 'inbound'  — sent by a user, received via webhook
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export type WhatsAppDirection = 'outbound' | 'inbound';

/**
 * Twilio's lifecycle states for an outbound message. Inbound messages
 * land here as `received` and stay there.
 *
 * Reference: https://www.twilio.com/docs/messaging/api/message-resource
 */
export type WhatsAppStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'undelivered'
  | 'received';

export interface WhatsAppMessage {
  /** Twilio's message SID (MM...). Unique. */
  sid: string;
  direction: WhatsAppDirection;
  /** "whatsapp:+E164" — the Twilio convention. */
  from: string;
  to: string;
  /** Plain text body (templates resolve to this on Twilio's side). */
  body: string;
  /** Optional media URLs (Twilio's MediaUrl{N} parameters). */
  mediaUrls?: string[];
  status: WhatsAppStatus;
  /** Twilio Content Template SID (HX...) — set on template sends. */
  contentSid?: string | null;
  /** Variables substituted into the template, if any. */
  contentVariables?: Record<string, string> | null;
  /** Twilio error code on a failed send, e.g. 63016. */
  errorCode?: number | null;
  errorMessage?: string | null;
  /** Linked user (if we can match `from`/`to` to a Doondo user). */
  userId?: Schema.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const whatsappMessageSchema = new Schema<WhatsAppMessage>(
  {
    sid: { type: String, required: true, unique: true, index: true },
    direction: {
      type: String,
      enum: ['outbound', 'inbound'] as WhatsAppDirection[],
      required: true,
      index: true,
    },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },
    body: { type: String, default: '' },
    mediaUrls: { type: [String], default: undefined },
    status: {
      type: String,
      enum: [
        'queued',
        'sending',
        'sent',
        'delivered',
        'read',
        'failed',
        'undelivered',
        'received',
      ] as WhatsAppStatus[],
      required: true,
      index: true,
    },
    contentSid: { type: String, default: null },
    contentVariables: { type: Schema.Types.Mixed, default: null },
    errorCode: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true, collection: 'whatsappMessages' },
);

// Recent-inbound feed for the support inbox.
whatsappMessageSchema.index({ direction: 1, createdAt: -1 });

export type WhatsAppMessageDoc = HydratedDocument<WhatsAppMessage>;
export const WhatsAppMessageModel: Model<WhatsAppMessage> =
  (model as unknown as { models?: Record<string, Model<WhatsAppMessage>> }).models
    ?.WhatsAppMessage ??
  model<WhatsAppMessage>('WhatsAppMessage', whatsappMessageSchema);
