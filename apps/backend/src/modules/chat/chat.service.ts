/**
 * Chat service — conversation + message business logic.
 *
 * Authorization rule: only the conversation's two participants
 * (employerId or seekerId) can read or write to it. Every method
 * checks ownership before touching data.
 *
 * Real-time: emits two socket events on new messages —
 *   - chat:message_received  (full PublicMessage payload, to recipient)
 *   - chat:conversation_bumped (lightweight, both sides — updates the
 *     chat list cache without a refetch).
 *   - chat:read (when a side reads; the OTHER side gets read receipts).
 *
 * Push: best-effort fire-and-forget hook. The push helper logs and
 * swallows its own errors so a failed push never bubbles to the API.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emitToUser } from '@/sockets/bus';
import { sendChatMessagePush } from '@/lib/push';
import { UserModel } from '@/modules/users/user.model';
import { ApplicationModel } from '@/modules/applications/application.model';
import {
  ConversationModel,
  type ConversationDocument,
  type PublicConversation,
} from './conversation.model';
import { MessageModel, type PublicMessage } from './message.model';

interface ParticipantSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
  /** Role of the counterpart — drives the chat-list tab filter (Employers / Support). */
  role?: 'seeker' | 'employer' | 'admin';
  /** Only set for employer participants — used in chat-list rendering. */
  companyName?: string | null;
}

export interface PublicConversationWithCounterpart extends PublicConversation {
  /** The OTHER participant from the viewer's perspective. */
  counterpart?: ParticipantSummary;
  /** The job that opened this thread, summarised. */
  job?: { id: string; title: string };
}

// ─── Idempotent unlock (called from application service on shortlist) ───────

export async function getOrCreateForApplication(input: {
  employerId: Types.ObjectId;
  seekerId: Types.ObjectId;
  jobId: Types.ObjectId;
}): Promise<ConversationDocument> {
  // Try to find first; if none, create. The unique index makes the
  // create idempotent under race conditions — a duplicate-key error is
  // recoverable by re-fetching.
  const existing = await ConversationModel.findOne({
    employerId: input.employerId,
    seekerId: input.seekerId,
    jobId: input.jobId,
  });
  if (existing) return existing;

  try {
    const created = await ConversationModel.create({
      employerId: input.employerId,
      seekerId: input.seekerId,
      jobId: input.jobId,
      lastMessageAt: new Date(),
    });
    logger.info(
      {
        conversationId: created.id,
        employerId: input.employerId.toString(),
        seekerId: input.seekerId.toString(),
        jobId: input.jobId.toString(),
      },
      'conversation created',
    );
    return created;
  } catch (err) {
    if (isDuplicateKey(err)) {
      const recovered = await ConversationModel.findOne({
        employerId: input.employerId,
        seekerId: input.seekerId,
        jobId: input.jobId,
      });
      if (recovered) return recovered;
    }
    throw err;
  }
}

/**
 * Seeker-initiated chat unlock — "Send first message" before the
 * employer has shortlisted. The seeker picks one of their applications
 * and we ensure a conversation exists for it.
 *
 * Rules:
 *   - Caller must be the SEEKER on the application (employers already
 *     have other ways to open chats via shortlist).
 *   - The application must still be active (status != withdrawn).
 *   - Idempotent — returns the existing conversation if there is one.
 */
export async function ensureConversationFromApplication(
  userId: string,
  applicationId: string,
): Promise<ConversationDocument> {
  const app = await ApplicationModel.findById(applicationId);
  if (!app) {
    throw errors.notFound('Application not found');
  }
  if (app.seekerId.toString() !== userId) {
    throw errors.forbidden('Only the applicant can start this chat.');
  }
  if (app.status === 'withdrawn') {
    throw errors.conflict("You've withdrawn this application; chat is not available.");
  }
  return getOrCreateForApplication({
    employerId: app.employerId as unknown as Types.ObjectId,
    seekerId: app.seekerId as unknown as Types.ObjectId,
    jobId: app.jobId as unknown as Types.ObjectId,
  });
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listMine(
  userId: string,
  filter: { limit: number },
): Promise<PublicConversationWithCounterpart[]> {
  const userObjectId = new Types.ObjectId(userId);
  const conversations = await ConversationModel.find({
    $or: [{ employerId: userObjectId }, { seekerId: userObjectId }],
  })
    .sort({ lastMessageAt: -1 })
    .limit(filter.limit);

  if (conversations.length === 0) return [];

  // Hydrate the OTHER participant + the job once per batch.
  const counterpartIds = conversations.map((c) =>
    c.employerId.toString() === userId ? c.seekerId : c.employerId,
  );
  const jobIds = conversations.map((c) => c.jobId);

  const [counterparts, jobs] = await Promise.all([
    UserModel.find({ _id: { $in: counterpartIds } })
      .select('name photoUrl isVerified companyName role')
      .lean(),
    // Lazy import to avoid a circular dep at module load.
    (await import('@/modules/jobs/job.model')).JobModel.find({ _id: { $in: jobIds } })
      .select('title')
      .lean(),
  ]);

  const counterpartMap = new Map(
    counterparts.map((u) => [
      (u._id as Types.ObjectId).toString(),
      {
        id: (u._id as Types.ObjectId).toString(),
        name: u.name,
        photoUrl: u.photoUrl ?? null,
        isVerified: Boolean(u.isVerified),
        role: u.role,
        companyName: u.role === 'employer' ? (u.companyName ?? null) : null,
      } as ParticipantSummary,
    ]),
  );
  const jobMap = new Map(
    jobs.map((j) => [
      (j._id as Types.ObjectId).toString(),
      { id: (j._id as Types.ObjectId).toString(), title: j.title as string },
    ]),
  );

  return conversations.map((c) => {
    const isEmployer = c.employerId.toString() === userId;
    const counterpartId = (isEmployer ? c.seekerId : c.employerId).toString();
    const json = c.toPublicJSON();
    return {
      ...json,
      unread: isEmployer ? c.unreadEmployer : c.unreadSeeker,
      counterpart: counterpartMap.get(counterpartId),
      job: jobMap.get(c.jobId.toString()),
    };
  });
}

export async function findById(
  userId: string,
  conversationId: string,
): Promise<PublicConversationWithCounterpart> {
  const conversation = await assertParticipant(userId, conversationId);
  const isEmployer = conversation.employerId.toString() === userId;
  const counterpartId = (
    isEmployer ? conversation.seekerId : conversation.employerId
  ).toString();

  const counterpart = await UserModel.findById(counterpartId)
    .select('name photoUrl isVerified companyName role')
    .lean();
  const job = await (
    await import('@/modules/jobs/job.model')
  ).JobModel.findById(conversation.jobId)
    .select('title')
    .lean();

  return {
    ...conversation.toPublicJSON(),
    unread: isEmployer ? conversation.unreadEmployer : conversation.unreadSeeker,
    counterpart: counterpart
      ? {
          id: (counterpart._id as Types.ObjectId).toString(),
          name: counterpart.name,
          photoUrl: counterpart.photoUrl ?? null,
          isVerified: Boolean(counterpart.isVerified),
          role: counterpart.role,
          companyName:
            counterpart.role === 'employer' ? (counterpart.companyName ?? null) : null,
        }
      : undefined,
    job: job
      ? { id: (job._id as Types.ObjectId).toString(), title: job.title as string }
      : undefined,
  };
}

export async function listMessages(
  userId: string,
  conversationId: string,
  filter: { before?: string; limit: number },
): Promise<{ messages: PublicMessage[]; hasMore: boolean }> {
  await assertParticipant(userId, conversationId);

  const q: Record<string, unknown> = {
    conversationId: new Types.ObjectId(conversationId),
  };
  if (filter.before) {
    q.createdAt = { $lt: new Date(filter.before) };
  }

  const docs = await MessageModel.find(q)
    .sort({ createdAt: -1 })
    .limit(filter.limit + 1);

  const hasMore = docs.length > filter.limit;
  const messages = (hasMore ? docs.slice(0, filter.limit) : docs).map((m) =>
    m.toPublicJSON(),
  );
  return { messages, hasMore };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

interface SendMessageInput {
  body?: string;
  kind?: 'text' | 'image' | 'voice' | 'video';
  attachment?: {
    dataUrl: string;
    mimeType: string;
    sizeBytes: number;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
  } | null;
  /** Quick-reply template key — opaque to the server, persisted as-is. */
  templateKey?: string | null;
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<PublicMessage> {
  const conversation = await assertParticipant(userId, conversationId);
  const isEmployer = conversation.employerId.toString() === userId;
  const recipientId = (
    isEmployer ? conversation.seekerId : conversation.employerId
  ).toString();

  const kind = input.kind ?? 'text';
  const body = (input.body ?? '').trim();

  const sentAt = new Date();
  const msg = await MessageModel.create({
    conversationId: conversation._id,
    senderId: new Types.ObjectId(userId),
    body,
    kind,
    attachment: input.attachment ?? null,
    templateKey: input.templateKey ?? null,
  });

  // Bump conversation denorm fields. Preview shows a friendly summary
  // for non-text messages so the chat list reads sensibly.
  conversation.lastMessageAt = sentAt;
  conversation.lastMessagePreview =
    kind === 'image'
      ? body
        ? `📷 ${body}`
        : '📷 Photo'
      : kind === 'voice'
        ? '🎤 Voice note'
        : kind === 'video'
          ? '🎬 Video'
          : preview(body);
  // Cast through unknown — Schema.Types.ObjectId vs Types.ObjectId is a
  // mongoose typing quirk; the runtime value is interchangeable.
  conversation.lastSenderId = new Types.ObjectId(userId) as unknown as typeof conversation.lastSenderId;
  if (isEmployer) {
    conversation.unreadSeeker += 1;
  } else {
    conversation.unreadEmployer += 1;
  }
  await conversation.save();

  // Live channel: recipient receives the full message; both sides get a
  // lightweight "bump" event so each chat-list refreshes without a fetch.
  const messageJson = msg.toPublicJSON();
  emitToUser(recipientId, 'chat:message_received', messageJson);
  emitToUser(userId, 'chat:conversation_bumped', {
    conversationId: conversation.id,
    lastMessageAt: sentAt.toISOString(),
    lastMessagePreview: conversation.lastMessagePreview,
    lastSenderId: userId,
  });
  emitToUser(recipientId, 'chat:conversation_bumped', {
    conversationId: conversation.id,
    lastMessageAt: sentAt.toISOString(),
    lastMessagePreview: conversation.lastMessagePreview,
    lastSenderId: userId,
    unreadIncrement: 1,
  });

  // Push (best-effort) — recipient gets a heads-up if they're offline.
  // For media messages the push body uses the friendly preview so the
  // notification doesn't look empty.
  const pushBody =
    kind === 'text' ? body : conversation.lastMessagePreview ?? 'New message';
  void sendChatMessagePush({
    recipientId,
    senderId: userId,
    body: pushBody,
    conversationId: conversation.id,
  });

  return messageJson;
}

/**
 * Post a kind:'system' message into a conversation. Used by the
 * applications module for interview scheduling/cancelling events so the
 * chat thread reads as a continuous timeline.
 *
 * No participant check — caller is trusted (it's a server-internal helper).
 * No unread bump — system messages aren't directed at anyone in particular.
 */
export async function postSystemMessage(
  conversationId: string,
  body: string,
): Promise<PublicMessage> {
  const conversation = await ConversationModel.findById(conversationId);
  if (!conversation) throw errors.conversationNotFound();

  const sentAt = new Date();
  const msg = await MessageModel.create({
    conversationId: conversation._id,
    // System messages have no sender — use the employer as the "from" so
    // the schema's required senderId stays valid. The kind: 'system' is
    // the discriminator clients render off.
    senderId: conversation.employerId,
    body: body.trim().slice(0, 500),
    kind: 'system',
  });

  conversation.lastMessageAt = sentAt;
  conversation.lastMessagePreview = preview(body);
  await conversation.save();

  // Both participants get the live update.
  const json = msg.toPublicJSON();
  emitToUser(conversation.employerId.toString(), 'chat:message_received', json);
  emitToUser(conversation.seekerId.toString(), 'chat:message_received', json);

  return json;
}

export async function markRead(
  userId: string,
  conversationId: string,
): Promise<PublicConversation> {
  const conversation = await assertParticipant(userId, conversationId);
  const isEmployer = conversation.employerId.toString() === userId;
  const counterpartId = (
    isEmployer ? conversation.seekerId : conversation.employerId
  ).toString();

  if (isEmployer && conversation.unreadEmployer > 0) {
    conversation.unreadEmployer = 0;
    await conversation.save();
  } else if (!isEmployer && conversation.unreadSeeker > 0) {
    conversation.unreadSeeker = 0;
    await conversation.save();
  }

  // Mark all unread messages from counterpart as read in this thread.
  const now = new Date();
  await MessageModel.updateMany(
    {
      conversationId: conversation._id,
      senderId: new Types.ObjectId(counterpartId),
      readAt: null,
    },
    { $set: { readAt: now } },
  );

  // Notify the other side so their read receipts update live.
  emitToUser(counterpartId, 'chat:read', {
    conversationId: conversation.id,
    readAt: now.toISOString(),
    readerId: userId,
  });

  return {
    ...conversation.toPublicJSON(),
    unread: isEmployer ? conversation.unreadEmployer : conversation.unreadSeeker,
  };
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function assertParticipant(
  userId: string,
  conversationId: string,
): Promise<ConversationDocument> {
  const conv = await ConversationModel.findById(conversationId);
  if (!conv) throw errors.conversationNotFound();
  const userObjectId = userId.toString();
  if (
    conv.employerId.toString() !== userObjectId &&
    conv.seekerId.toString() !== userObjectId
  ) {
    throw errors.forbidden();
  }
  return conv;
}

function preview(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}
