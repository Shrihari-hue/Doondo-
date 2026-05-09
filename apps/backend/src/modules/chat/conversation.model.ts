/**
 * Conversation — a 1-on-1 thread between an employer and a seeker,
 * scoped to a job that brought them together.
 *
 * Auto-created when an employer transitions an application to
 * `shortlisted` or `hired` (the application service does this through
 * `getOrCreateForApplication`). Idempotent — a re-shortlist returns
 * the existing thread.
 *
 * Per-side denormalised counters live on this document so the chat-list
 * screen can render unread badges without aggregating Message rows on
 * every fetch.
 *
 * Why a single document with both `employerId` and `seekerId` instead
 * of a generic Conversation + ConversationMember pattern:
 *   - Doondo conversations are strictly 1-on-1 by design — there's no
 *     group chat use case in the roadmap.
 *   - Two ObjectId fields read cleanly in the IDE and join cheaply.
 *   - Phase 6 may add support tickets / admin DMs; those'll be a
 *     separate model so we don't muddy the marketplace conversation.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface Conversation {
  /** Always present — the marketplace pair this thread belongs to. */
  employerId: Schema.Types.ObjectId;
  seekerId: Schema.Types.ObjectId;
  /** The job that triggered the unlock. Useful context in the UI. */
  jobId: Schema.Types.ObjectId;

  /** When the most recent message landed. Drives chat-list ordering. */
  lastMessageAt: Date;
  /**
   * Compact preview of the last message (first ~140 chars, no newlines).
   * Stored so the chat list can render without joining Message rows.
   */
  lastMessagePreview: string | null;
  /** Sender of the last message — used to bold-vs-not on the chat list. */
  lastSenderId: Schema.Types.ObjectId | null;

  /**
   * Count of unread messages per side. Bumped when the OTHER party
   * sends a message; reset to 0 when this party calls /read.
   */
  unreadEmployer: number;
  unreadSeeker: number;

  createdAt: Date;
  updatedAt: Date;
}

interface ConversationMethods {
  toPublicJSON(): PublicConversation;
}

export type ConversationDocument = HydratedDocument<Conversation, ConversationMethods>;

export interface PublicConversation {
  id: string;
  employerId: string;
  seekerId: string;
  jobId: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSenderId: string | null;
  /** Set per-viewer by the service — count for the current user only. */
  unread: number;
  createdAt: string;
}

type ConversationModelType = Model<
  Conversation,
  Record<string, never>,
  ConversationMethods
>;

const conversationSchema = new Schema<
  Conversation,
  ConversationModelType,
  ConversationMethods
>(
  {
    employerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, default: null, maxlength: 200 },
    lastSenderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    unreadEmployer: { type: Number, default: 0, min: 0 },
    unreadSeeker: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// One conversation per (employer, seeker, job) — re-shortlists land in
// the same thread. If you want a fresh thread for a different job, the
// (employer, seeker) pair gets a new document because jobId differs.
conversationSchema.index(
  { employerId: 1, seekerId: 1, jobId: 1 },
  { unique: true },
);

// "My conversations sorted newest first" — both sides hit this index.
conversationSchema.index({ seekerId: 1, lastMessageAt: -1 });
conversationSchema.index({ employerId: 1, lastMessageAt: -1 });

conversationSchema.method('toPublicJSON', function (
  this: ConversationDocument,
): PublicConversation {
  return {
    id: this._id.toString(),
    employerId: this.employerId.toString(),
    seekerId: this.seekerId.toString(),
    jobId: this.jobId.toString(),
    lastMessageAt: this.lastMessageAt.toISOString(),
    lastMessagePreview: this.lastMessagePreview ?? null,
    lastSenderId: this.lastSenderId ? this.lastSenderId.toString() : null,
    // The service overrides this to the right side per viewer.
    unread: 0,
    createdAt: this.createdAt.toISOString(),
  };
});

export const ConversationModel = model<Conversation, ConversationModelType>(
  'Conversation',
  conversationSchema,
);
