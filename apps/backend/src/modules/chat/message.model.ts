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
 * Lifecycle of a text message's auto-translation:
 *   none    — no translation needed (already in the reader's language)
 *   pending — translation in flight; the bubble shows a shimmer
 *   done    — `translation` is populated
 *   failed  — translation errored; the reader can tap to retry
 */
export const TRANSLATION_STATUSES = ['none', 'pending', 'done', 'failed'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

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

/**
 * Auto-translation of a text message into the recipient's language.
 * Filled in asynchronously a moment after the message is sent (see the
 * translation kickoff in chat.service); null until then, null for media
 * and system messages, and null when the message was already written in
 * the recipient's language (nothing to translate).
 */
export interface MessageTranslation {
  /** The translated text, in `targetLang`. */
  text: string;
  /** Language the original `body` was written in (en/hi/ta/te/kn). */
  sourceLang: string;
  /** Language `text` was translated into — the recipient's locale. */
  targetLang: string;
  /** Which provider produced this — 'anthropic' or 'mock'. */
  provider: string;
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
  /**
   * Auto-generated transcript for a `kind: 'voice'` message. Filled in
   * asynchronously a few seconds after the voice note is sent (see the
   * transcription kickoff in chat.service); null until then, and null
   * for every non-voice message. Transcribed, not translated — it's in
   * whatever language the sender spoke.
   */
  transcript?: string | null;
  /**
   * Auto-translation of a `kind: 'text'` message into the recipient's
   * language. Filled in asynchronously a moment after send; null until
   * then, null for non-text messages, and null when the message was
   * already in the recipient's language.
   */
  translation?: MessageTranslation | null;
  /**
   * Lifecycle of the auto-translation. 'none' for media/system messages
   * and same-language text; 'pending' while in flight; 'done'/'failed'
   * once the translation job resolves.
   */
  translationStatus: TranslationStatus;
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
  /** Auto-generated transcript for voice messages; null otherwise. */
  transcript: string | null;
  /** Auto-translation into the recipient's language; null otherwise. */
  translation: MessageTranslation | null;
  /** Lifecycle of the auto-translation — drives the shimmer / retry UI. */
  translationStatus: TranslationStatus;
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

const translationSchema = new Schema<MessageTranslation>(
  {
    text: { type: String, required: true, maxlength: 4000 },
    sourceLang: { type: String, required: true, trim: true, maxlength: 8 },
    targetLang: { type: String, required: true, trim: true, maxlength: 8 },
    provider: { type: String, required: true, trim: true, maxlength: 20 },
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
    transcript: { type: String, default: null, trim: true, maxlength: 4000 },
    translation: { type: translationSchema, default: null },
    translationStatus: {
      type: String,
      enum: TRANSLATION_STATUSES,
      default: 'none',
    },
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
    transcript: this.transcript ?? null,
    translation: this.translation
      ? {
          text: this.translation.text,
          sourceLang: this.translation.sourceLang,
          targetLang: this.translation.targetLang,
          provider: this.translation.provider,
        }
      : null,
    translationStatus: this.translationStatus ?? 'none',
    readAt: this.readAt ? this.readAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const MessageModel = model<Message, MessageModelType>('Message', messageSchema);
