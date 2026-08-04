/** UUID-native Postgres implementation of marketplace chat. */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { applications, conversations, jobs, messages, users } from '@/db/schema';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { emitToUser } from '@/sockets/bus';
import { sendChatMessagePush } from '@/lib/push';
import type { PublicConversation } from './conversation.model';
import type { MessageAttachment, MessageTranslation, PublicMessage } from './message.model';
import {
  consumeTranslationBudget,
  detectLang,
  isTranslatableLang,
  translateText,
  type TranslatableLang,
} from '@/modules/translation/translation.service';

interface ParticipantSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
  role?: 'seeker' | 'employer' | 'admin';
  companyName?: string | null;
}
export interface PublicConversationWithCounterpart extends PublicConversation {
  counterpart?: ParticipantSummary;
  job?: { id: string; title: string };
}
type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type Attachment = MessageAttachment;
type Translation = MessageTranslation;

function publicConversation(row: ConversationRow, unread = 0): PublicConversation {
  return {
    id: row.id,
    employerId: row.employerId,
    seekerId: row.seekerId,
    jobId: row.jobId,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview ?? null,
    lastSenderId: row.lastSenderId ?? null,
    unread,
    translationLangSeeker: row.translationLangSeeker ?? null,
    translationLangEmployer: row.translationLangEmployer ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
function publicMessage(row: MessageRow): PublicMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    attachment: (row.attachment as Attachment | null) ?? null,
    templateKey: row.templateKey ?? null,
    transcript: row.transcript ?? null,
    translation: (row.translation as Translation | null) ?? null,
    translationStatus: row.translationStatus,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
function preview(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 140);
}
function isUnique(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
async function assertParticipant(userId: string, conversationId: string): Promise<ConversationRow> {
  const [row] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!row) throw errors.conversationNotFound();
  if (row.employerId !== userId && row.seekerId !== userId) throw errors.forbidden();
  return row;
}
async function getConversation(id: string): Promise<ConversationRow> {
  const [row] = await getDb().select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!row) throw errors.conversationNotFound();
  return row;
}

export async function getOrCreateForApplication(input: {
  employerId: string;
  seekerId: string;
  jobId: string;
}): Promise<ConversationRow> {
  const db = getDb();
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.employerId, input.employerId),
        eq(conversations.seekerId, input.seekerId),
        eq(conversations.jobId, input.jobId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  try {
    const [created] = await db
      .insert(conversations)
      .values({ ...input, lastMessageAt: new Date() })
      .returning();
    logger.info({ conversationId: created!.id, ...input }, 'conversation created');
    return created!;
  } catch (err) {
    if (isUnique(err)) {
      const [recovered] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.employerId, input.employerId),
            eq(conversations.seekerId, input.seekerId),
            eq(conversations.jobId, input.jobId),
          ),
        )
        .limit(1);
      if (recovered) return recovered;
    }
    throw err;
  }
}
export async function ensureConversationFromApplication(
  userId: string,
  applicationId: string,
): Promise<ConversationRow> {
  const [app] = await getDb()
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) throw errors.notFound('Application not found');
  if (app.seekerId !== userId) throw errors.forbidden('Only the applicant can start this chat.');
  if (app.status === 'withdrawn')
    throw errors.conflict("You've withdrawn this application; chat is not available.");
  return getOrCreateForApplication({
    employerId: app.employerId,
    seekerId: app.seekerId,
    jobId: app.jobId,
  });
}

async function counterpartsAndJobs(
  rows: ConversationRow[],
  viewerId: string,
): Promise<Map<string, ParticipantSummary>> {
  const ids = [
    ...new Set(rows.map((c) => (c.employerId === viewerId ? c.seekerId : c.employerId))),
  ];
  const people = ids.length
    ? await getDb()
        .select({
          id: users.id,
          name: users.name,
          photoUrl: users.photoUrl,
          isVerified: users.isVerified,
          role: users.role,
          companyName: users.companyName,
        })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  return new Map(
    people.map((u) => [
      u.id,
      {
        ...u,
        photoUrl: u.photoUrl ?? null,
        companyName: u.role === 'employer' ? (u.companyName ?? null) : null,
      } as ParticipantSummary,
    ]),
  );
}
export async function listMine(
  userId: string,
  filter: { limit: number },
): Promise<PublicConversationWithCounterpart[]> {
  const rows = await getDb()
    .select()
    .from(conversations)
    .where(or(eq(conversations.employerId, userId), eq(conversations.seekerId, userId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(filter.limit);
  if (!rows.length) return [];
  const people = await counterpartsAndJobs(rows, userId);
  const jobRows = await getDb()
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(inArray(jobs.id, [...new Set(rows.map((r) => r.jobId))]));
  const jobMap = new Map(jobRows.map((j) => [j.id, j]));
  return rows.map((c) => {
    const employer = c.employerId === userId;
    const other = employer ? c.seekerId : c.employerId;
    return {
      ...publicConversation(c, employer ? c.unreadEmployer : c.unreadSeeker),
      counterpart: people.get(other),
      job: jobMap.get(c.jobId),
    };
  });
}
export async function findById(
  userId: string,
  conversationId: string,
): Promise<PublicConversationWithCounterpart> {
  const c = await assertParticipant(userId, conversationId);
  const employer = c.employerId === userId;
  const other = employer ? c.seekerId : c.employerId;
  const [person, job] = await Promise.all([
    getDb()
      .select({
        id: users.id,
        name: users.name,
        photoUrl: users.photoUrl,
        isVerified: users.isVerified,
        role: users.role,
        companyName: users.companyName,
      })
      .from(users)
      .where(eq(users.id, other))
      .limit(1),
    getDb()
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(eq(jobs.id, c.jobId))
      .limit(1),
  ]);
  return {
    ...publicConversation(c, employer ? c.unreadEmployer : c.unreadSeeker),
    counterpart: person
      ? {
          ...person,
          photoUrl: person.photoUrl ?? null,
          companyName: person.role === 'employer' ? (person.companyName ?? null) : null,
        }
      : undefined,
    job: job ?? undefined,
  };
}
export async function listMessages(
  userId: string,
  conversationId: string,
  filter: { before?: string; limit: number },
): Promise<{ messages: PublicMessage[]; hasMore: boolean }> {
  await assertParticipant(userId, conversationId);
  const where = filter.before
    ? and(
        eq(messages.conversationId, conversationId),
        lt(messages.createdAt, new Date(filter.before)),
      )
    : eq(messages.conversationId, conversationId);
  const rows = await getDb()
    .select()
    .from(messages)
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(filter.limit + 1);
  const hasMore = rows.length > filter.limit;
  return { messages: (hasMore ? rows.slice(0, filter.limit) : rows).map(publicMessage), hasMore };
}

interface SendMessageInput {
  body?: string;
  kind?: 'text' | 'image' | 'voice' | 'video';
  attachment?: Attachment | null;
  templateKey?: string | null;
}
export async function sendMessage(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
): Promise<PublicMessage> {
  const c = await assertParticipant(userId, conversationId),
    employer = c.employerId === userId,
    recipientId = employer ? c.seekerId : c.employerId,
    kind = input.kind ?? 'text',
    body = (input.body ?? '').trim();
  let target: TranslatableLang | undefined;
  let translationStatus: 'none' | 'pending' | 'failed' = 'none';
  if (kind === 'text' && body) {
    const override = employer ? c.translationLangSeeker : c.translationLangEmployer;
    let locale: string | null | undefined = isTranslatableLang(override) ? override : null;
    if (!locale) {
      const [recipient] = await getDb()
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, recipientId))
        .limit(1);
      locale = recipient?.locale;
    }
    if (isTranslatableLang(locale) && detectLang(body) !== locale) {
      if (consumeTranslationBudget(userId)) {
        target = locale;
        translationStatus = 'pending';
      } else translationStatus = 'failed';
    }
  }
  const sentAt = new Date();
  const [row] = await getDb()
    .insert(messages)
    .values({
      conversationId: c.id,
      senderId: userId,
      body,
      kind,
      attachment: input.attachment ?? null,
      templateKey: input.templateKey ?? null,
      translationStatus,
    })
    .returning();
  const msg = row!;
  const lastMessagePreview =
    kind === 'image'
      ? body
        ? `📷 ${body}`
        : '📷 Photo'
      : kind === 'voice'
        ? '🎤 Voice note'
        : kind === 'video'
          ? '🎬 Video'
          : preview(body);
  const [updated] = await getDb()
    .update(conversations)
    .set({
      lastMessageAt: sentAt,
      lastMessagePreview,
      lastSenderId: userId,
      unreadEmployer: employer ? c.unreadEmployer : c.unreadEmployer + 1,
      unreadSeeker: employer ? c.unreadSeeker + 1 : c.unreadSeeker,
    })
    .where(eq(conversations.id, c.id))
    .returning();
  const convo = updated!;
  const json = publicMessage(msg);
  emitToUser(recipientId, 'chat:message_received', json);
  for (const uid of [userId, recipientId])
    emitToUser(uid, 'chat:conversation_bumped', {
      conversationId: c.id,
      lastMessageAt: sentAt.toISOString(),
      lastMessagePreview,
      lastSenderId: userId,
      ...(uid === recipientId ? { unreadIncrement: 1 } : {}),
    });
  void sendChatMessagePush({
    recipientId,
    senderId: userId,
    body: kind === 'text' ? body : lastMessagePreview,
    conversationId: c.id,
  });
  if (kind === 'voice' && input.attachment)
    void transcribeVoiceMessage({
      messageId: msg.id,
      conversationId: c.id,
      senderId: userId,
      recipientId,
      dataUrl: input.attachment.dataUrl,
      mimeType: input.attachment.mimeType,
    });
  if (target)
    void translateMessageForRecipient({
      messageId: msg.id,
      conversationId: c.id,
      senderId: userId,
      recipientId,
      body,
      targetLang: target,
    });
  return json;
}

function translationEmit(
  input: { messageId: string; conversationId: string; senderId: string; recipientId: string },
  status: 'none' | 'done' | 'failed' | 'pending',
  translation: Translation | null,
): void {
  for (const uid of [input.senderId, input.recipientId])
    emitToUser(uid, 'chat:message_translated', {
      messageId: input.messageId,
      conversationId: input.conversationId,
      translation,
      status,
    });
}
async function translateMessageForRecipient(input: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  targetLang?: TranslatableLang;
}): Promise<void> {
  try {
    let target = input.targetLang;
    if (!target) {
      const c = await getConversation(input.conversationId);
      const override =
        c.seekerId === input.recipientId ? c.translationLangSeeker : c.translationLangEmployer;
      if (isTranslatableLang(override)) target = override;
      else {
        const [u] = await getDb()
          .select({ locale: users.locale })
          .from(users)
          .where(eq(users.id, input.recipientId))
          .limit(1);
        if (!isTranslatableLang(u?.locale)) {
          await getDb()
            .update(messages)
            .set({ translationStatus: 'none' })
            .where(eq(messages.id, input.messageId));
          return;
        }
        target = u!.locale;
      }
    }
    const result = await translateText({ text: input.body, targetLang: target });
    if (result.skipped) {
      await getDb()
        .update(messages)
        .set({ translationStatus: 'none' })
        .where(eq(messages.id, input.messageId));
      translationEmit(input, 'none', null);
      return;
    }
    const translation: Translation = {
      text: result.text.slice(0, 4000),
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      provider: result.provider,
    };
    await getDb()
      .update(messages)
      .set({ translation, translationStatus: 'done' })
      .where(eq(messages.id, input.messageId));
    translationEmit(input, 'done', translation);
  } catch (err) {
    logger.warn({ err, messageId: input.messageId }, 'message translation failed');
    await getDb()
      .update(messages)
      .set({ translationStatus: 'failed' })
      .where(eq(messages.id, input.messageId))
      .catch(() => undefined);
    translationEmit(input, 'failed', null);
  }
}
export async function retranslateMessage(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const c = await assertParticipant(userId, conversationId);
  const [m] = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, c.id)))
    .limit(1);
  if (!m) throw errors.notFound('Message not found.');
  if (m.kind !== 'text' || !m.body) throw errors.conflict('Only text messages can be translated.');
  const recipientId = m.senderId === c.employerId ? c.seekerId : c.employerId;
  await getDb().update(messages).set({ translationStatus: 'pending' }).where(eq(messages.id, m.id));
  translationEmit(
    { messageId, conversationId: c.id, senderId: m.senderId, recipientId },
    'pending',
    null,
  );
  void translateMessageForRecipient({
    messageId,
    conversationId: c.id,
    senderId: m.senderId,
    recipientId,
    body: m.body,
  });
  return { ok: true };
}
export async function setConversationTranslationLang(
  userId: string,
  conversationId: string,
  lang: TranslatableLang | null,
): Promise<{ lang: TranslatableLang | null }> {
  const c = await assertParticipant(userId, conversationId);
  const seeker = c.seekerId === userId;
  const [updated] = await getDb()
    .update(conversations)
    .set(seeker ? { translationLangSeeker: lang } : { translationLangEmployer: lang })
    .where(eq(conversations.id, c.id))
    .returning();
  let effective = lang;
  if (!effective) {
    const [me] = await getDb()
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    effective = isTranslatableLang(me?.locale) ? me!.locale : null;
  }
  if (effective) {
    const recent = await getDb()
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, c.id),
          ne(messages.senderId, userId),
          or(
            and(eq(messages.kind, 'text'), ne(messages.body, '')),
            and(eq(messages.kind, 'voice'), isNotNull(messages.transcript)),
          ),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(15);
    for (const m of recent) {
      const source = m.kind === 'voice' ? (m.transcript ?? '') : m.body;
      if (!source || !consumeTranslationBudget(userId)) continue;
      await getDb()
        .update(messages)
        .set({ translationStatus: 'pending' })
        .where(eq(messages.id, m.id));
      translationEmit(
        { messageId: m.id, conversationId: c.id, senderId: m.senderId, recipientId: userId },
        'pending',
        null,
      );
      void translateMessageForRecipient({
        messageId: m.id,
        conversationId: c.id,
        senderId: m.senderId,
        recipientId: userId,
        body: source,
        targetLang: effective,
      });
    }
  }
  void updated;
  return { lang };
}
async function transcribeVoiceMessage(input: {
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  dataUrl: string;
  mimeType: string;
}): Promise<void> {
  try {
    const { transcribeAudio } = await import('@/modules/transcription/transcription.service');
    const { text } = await transcribeAudio({ dataUrl: input.dataUrl, mimeType: input.mimeType });
    const transcript = text.trim().slice(0, 4000);
    if (!transcript) return;
    await getDb().update(messages).set({ transcript }).where(eq(messages.id, input.messageId));
    for (const uid of [input.senderId, input.recipientId])
      emitToUser(uid, 'chat:message_transcribed', {
        messageId: input.messageId,
        conversationId: input.conversationId,
        transcript,
      });
    if (consumeTranslationBudget(input.senderId))
      void translateMessageForRecipient({ ...input, body: transcript });
  } catch (err) {
    logger.warn({ err, messageId: input.messageId }, 'voice transcription failed');
  }
}

export async function postSystemMessage(
  conversationId: string,
  body: string,
): Promise<PublicMessage> {
  const c = await getConversation(conversationId);
  const sentAt = new Date(),
    text = body.trim().slice(0, 500);
  const [m] = await getDb()
    .insert(messages)
    .values({ conversationId: c.id, senderId: c.employerId, body: text, kind: 'system' })
    .returning();
  await getDb()
    .update(conversations)
    .set({ lastMessageAt: sentAt, lastMessagePreview: preview(text) })
    .where(eq(conversations.id, c.id));
  const json = publicMessage(m!);
  emitToUser(c.employerId, 'chat:message_received', json);
  emitToUser(c.seekerId, 'chat:message_received', json);
  return json;
}
export async function markRead(
  userId: string,
  conversationId: string,
): Promise<PublicConversation> {
  const c = await assertParticipant(userId, conversationId);
  const employer = c.employerId === userId,
    counterpart = employer ? c.seekerId : c.employerId,
    now = new Date();
  const [updated] = await getDb()
    .update(conversations)
    .set(employer ? { unreadEmployer: 0 } : { unreadSeeker: 0 })
    .where(eq(conversations.id, c.id))
    .returning();
  await getDb()
    .update(messages)
    .set({ readAt: now })
    .where(
      and(
        eq(messages.conversationId, c.id),
        eq(messages.senderId, counterpart),
        isNull(messages.readAt),
      ),
    );
  emitToUser(counterpart, 'chat:read', {
    conversationId: c.id,
    readAt: now.toISOString(),
    readerId: userId,
  });
  return publicConversation(updated!, 0);
}

export type BulkMessageStage = 'shortlisted' | 'active';
export async function bulkMessageForJob(
  employerId: string,
  jobId: string,
  stage: BulkMessageStage,
  message: string,
): Promise<{ sent: number }> {
  const body = message.trim();
  if (!body) throw errors.validation({ message }, 'Message is required.');
  const [job] = await getDb()
    .select({ employerId: jobs.employerId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();
  const statuses =
    stage === 'shortlisted' ? ['shortlisted'] : ['pending', 'viewed', 'shortlisted', 'hired'];
  const apps = await getDb()
    .select({ seekerId: applications.seekerId })
    .from(applications)
    .where(and(eq(applications.jobId, jobId), inArray(applications.status, statuses)));
  let sent = 0;
  for (const app of apps)
    try {
      const c = await getOrCreateForApplication({ employerId, seekerId: app.seekerId, jobId });
      await sendMessage(employerId, c.id, { body });
      sent++;
    } catch (err) {
      logger.warn(
        { err, jobId, seekerId: app.seekerId },
        'bulk message: per-recipient send failed',
      );
    }
  logger.info({ employerId, jobId, stage, sent }, 'bulk message sent');
  return { sent };
}
