/**
 * Message — a single chat message inside a Conversation.
 *
 * Phase 4 v1 supports text only. Photo / file attachments will land in
 * Phase 5 alongside proper image hosting. The schema reserves a
 * discriminator field (`kind`) so adding richer types later doesn't
 * require a migration.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export const MESSAGE_KINDS = ['text', 'system'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface Message {
  conversationId: Schema.Types.ObjectId;
  senderId: Schema.Types.ObjectId;
  kind: MessageKind;
  body: string;
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
  readAt: string | null;
  createdAt: string;
}

type MessageModelType = Model<Message, Record<string, never>, MessageMethods>;

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
    body: { type: String, required: true, trim: true, maxlength: 4000 },
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
    readAt: this.readAt ? this.readAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const MessageModel = model<Message, MessageModelType>('Message', messageSchema);
