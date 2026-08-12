/**
 * Message types — a single chat message inside a Conversation. The
 * actual row lives in Postgres (see src/db/schema); this file holds the
 * pure TS types still shared with the service.
 *
 * Supports text + image attachments + system messages. Voice and video
 * use the same `attachment` shape — only the `kind` value and MIME-type
 * whitelist change.
 */

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
  /**
   * Sparse audio-level samples (0..1) captured during recording — drives
   * the playback waveform on the voice bubble. Up to ~64 entries; null
   * on messages from clients that didn't capture metering.
   */
  waveform?: number[] | null;
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
