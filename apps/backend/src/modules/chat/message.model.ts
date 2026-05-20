/**
 * Message — a single chat message inside a Conversation.
 *
 * Supports text + image attachments + system messages. Voice and video
 * land later using the same `attachment` shape — only the `kind` value
 * and MIME-type whitelist change.
 *
 * Storage strategy for v1: attachments live as base64 data URLs on the
 * message document itself (same approach as profile photos and resumes).
 * Cap each attachment at ~1MB raw on the mobile side before sending so
 * documents stay reasonable. When traffic justifies it, swap `dataUrl`
 * for a CDN URL — wire format stays the same.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const MESSAGE_KINDS = ['text', 'image', 'voice', 'video', 'system'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/**
 * Inline attachment payload. For v1 we keep the raw bytes on the message
 * as a base64 data URL; swap to a CDN URL later by keeping `dataUrl`
 * optional and adding `url?: string`.
 */
export interface MessageAttachment {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  /** Image / video dimensions in pixels — used by mobile to reserve the
   *  layout slot before the data URL paints. */
  width?: number | null;
  height?: number | null;
  /** Voice / video duration in seconds. */
  durationSeconds?: number | null;
}

export interface Message {
  conversationId: Schema.Types.ObjectId;
  senderId: Schema.Types.ObjectId;
  kind: MessageKind;
  /**
   * For text messages this is the actual text. For image/voice/video
   * messages it can be a caption or empty string ('').
   */
  body: string;
  /** Set when kind !== 'text'. Null for plain text + system messages. */
  attachment?: MessageAttachment | null;
  /**
   * Quick-reply template key — set when the message was sent from the
   * pre-translated quick-reply bar (e.g. `quick_replies.emp.when_can_start`).
   * The server treats it as an opaque string; clients render it through
   * i18n so each side reads the message in their own language. `body`
   * still holds the English text as a fallback for clients that don't
   * know the key. Null for free-text and media messages.
   */
  templateKey?: string | null;
  /** When the recipient marked the conversation as read past this msg. */
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageMethods {
  toPublicJSON(): PublicMessage;
}

export type MessageDocument = HydratedDocument<Message, MessageMethods>;

export interface PublicMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string;
  attachment: MessageAttachment | null;
  /** Quick-reply template key, or null for free-text / media messages. */
  templateKey: string | null;
  readAt: string | null;
  createdAt: string;
}

type MessageModelType = Model<Message, Record<string, never>, MessageMethods>;

const attachmentSchema = new Schema<MessageAttachment>(
  {
    dataUrl: { type: String, required: true, maxlength: 1_500_000 },
    mimeType: { type: String, required: true, trim: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 0, max: 5_000_000 },
    width: { type: Number, default: null, min: 0 },
    height: { type: Number, default: null, min: 0 },
    durationSeconds: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const messageSchema = new Schema<Message, MessageModelType, MessageMethods>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    kind: { type: String, enum: MESSAGE_KINDS, default: 'text' },
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    attachment: { type: attachmentSchema, default: null },
    templateKey: { type: String, default: null, trim: true, maxlength: 80 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// "Latest messages in this conversation" — the most-hit query.
messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.method('toPublicJSON', function (this: MessageDocument): PublicMessage {
  return {
    id: this._id.toString(),
    conversationId: this.conversationId.toString(),
    senderId: this.senderId.toString(),
    kind: this.kind,
    body: this.body,
    attachment: this.attachment ?? null,
    templateKey: this.templateKey ?? null,
    readAt: this.readAt ? this.readAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const MessageModel = model<Message, MessageModelType>('Message', messageSchema);
