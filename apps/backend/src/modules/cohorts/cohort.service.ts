/**
 * Cohorts — peer groups via Find Friends (#7 on the feature status report).
 *
 * A cohort is a small (max 5) group of seekers doing the same course
 * together, with a shared group chat. Formed straight out of Find
 * Friends: a seeker enrolled in a course picks up to 4 matched friends
 * and invites them; each invitee accepts/declines before they can post
 * or read messages.
 *
 * Deliberately its own lightweight tables (`cohorts` / `cohort_members` /
 * `cohort_messages`) rather than shoehorned into the 1:1 `conversations`
 * table — that table's schema is a hard employer/seeker pair tied to one
 * job, which a 5-person seeker-only group doesn't fit. `cohort_messages`
 * does reuse `messageKindEnum` from the chat module, and the group-chat
 * flow (send → fan-out via the socket bus → push) mirrors chat.service's
 * pattern closely.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { cohortMembers, cohortMessages, cohorts, users, type CohortMemberStatus } from '@/db/schema';
import { errors } from '@/lib/errors';
import { emitToUser } from '@/sockets/bus';
import { sendCohortInvitePush, sendCohortMessagePush } from '@/lib/push';
import { findCourse } from '@/modules/courses/courses.catalogue';

export const MAX_COHORT_MEMBERS = 5;

type CohortRow = typeof cohorts.$inferSelect;
type CohortMemberRow = typeof cohortMembers.$inferSelect;
type CohortMessageRow = typeof cohortMessages.$inferSelect;

export interface CohortMemberSummary {
  userId: string;
  name: string;
  photoUrl: string | null;
  status: CohortMemberStatus;
}

export interface PublicCohort {
  id: string;
  courseId: string;
  courseTitle: string;
  name: string;
  creatorId: string;
  myStatus: CohortMemberStatus;
  members: CohortMemberSummary[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: number;
  createdAt: string;
}

export interface PublicCohortMessage {
  id: string;
  cohortId: string;
  senderId: string;
  kind: 'text' | 'image' | 'voice' | 'video' | 'system';
  body: string;
  attachment: { dataUrl: string; mimeType: string; sizeBytes: number } | null;
  createdAt: string;
}

function courseTitleFor(courseId: string): string {
  return findCourse(courseId)?.title ?? courseId;
}

async function hydrateMembers(cohortId: string): Promise<CohortMemberRow[]> {
  return getDb().select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohortId));
}

async function toPublic(
  row: CohortRow,
  viewerId: string,
  members?: CohortMemberRow[],
): Promise<PublicCohort> {
  const memberRows = members ?? (await hydrateMembers(row.id));
  const mine = memberRows.find((m) => m.userId === viewerId);
  const userIds = memberRows.map((m) => m.userId);
  const people = userIds.length
    ? await getDb()
        .select({ id: users.id, name: users.name, photoUrl: users.photoUrl })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const members2: CohortMemberSummary[] = memberRows.map((m) => ({
    userId: m.userId,
    name: peopleMap.get(m.userId)?.name ?? 'Worker',
    photoUrl: peopleMap.get(m.userId)?.photoUrl ?? null,
    status: m.status,
  }));

  return {
    id: row.id,
    courseId: row.courseId,
    courseTitle: courseTitleFor(row.courseId),
    name: row.name,
    creatorId: row.creatorId,
    myStatus: mine?.status ?? 'invited',
    members: members2,
    lastMessagePreview: null,
    lastMessageAt: null,
    unread: 0,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertJoined(userId: string, cohortId: string): Promise<CohortRow> {
  const [cohort] = await getDb().select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  if (!cohort) throw errors.notFound('Cohort not found.');
  const [member] = await getDb()
    .select()
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)))
    .limit(1);
  if (!member || member.status !== 'joined') throw errors.forbidden();
  return cohort;
}

function preview(body: string, kind: string): string {
  if (kind === 'image') return body ? `📷 ${body}` : '📷 Photo';
  if (kind === 'system') return body;
  return body.replace(/\s+/g, ' ').trim().slice(0, 140);
}

async function publicMessage(row: CohortMessageRow): Promise<PublicCohortMessage> {
  return {
    id: row.id,
    cohortId: row.cohortId,
    senderId: row.senderId,
    kind: row.kind,
    body: row.body,
    attachment: (row.attachment as PublicCohortMessage['attachment']) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function postSystemMessage(cohortId: string, body: string): Promise<void> {
  const [creator] = await getDb().select({ id: cohorts.creatorId }).from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  if (!creator) return;
  const [row] = await getDb()
    .insert(cohortMessages)
    .values({ cohortId, senderId: creator.id, kind: 'system', body })
    .returning();
  if (!row) return;
  const members = await hydrateMembers(cohortId);
  const json = await publicMessage(row);
  for (const m of members.filter((mm) => mm.status === 'joined')) emitToUser(m.userId, 'cohort:message_received', json);
}

export interface CreateCohortInput {
  courseId: string;
  name?: string;
  inviteUserIds: string[];
}

export async function createCohort(creatorId: string, input: CreateCohortInput): Promise<PublicCohort> {
  const course = findCourse(input.courseId);
  if (!course) throw errors.validation({ courseId: input.courseId }, 'Unknown course.');

  const invitees = [...new Set(input.inviteUserIds)]
    .filter((id) => id !== creatorId)
    .slice(0, MAX_COHORT_MEMBERS - 1);
  if (invitees.length === 0) throw errors.validation(null, 'Invite at least one friend to start a cohort.');

  const inviteeRows = await getDb()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, invitees));
  const validInvitees = inviteeRows.filter((u) => u.role === 'seeker').map((u) => u.id);
  if (validInvitees.length === 0) throw errors.validation(null, 'None of the invited people could be added.');

  const db = getDb();
  const [cohort] = await db
    .insert(cohorts)
    .values({ courseId: input.courseId, name: (input.name?.trim() || course.title).slice(0, 80), creatorId })
    .returning();
  if (!cohort) throw errors.internal('Could not create cohort.');

  await db.insert(cohortMembers).values([
    { cohortId: cohort.id, userId: creatorId, status: 'joined' },
    ...validInvitees.map((userId) => ({ cohortId: cohort.id, userId, status: 'invited' as const, invitedBy: creatorId })),
  ]);

  const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, creatorId)).limit(1);
  for (const userId of validInvitees)
    void sendCohortInvitePush({ recipientId: userId, cohortId: cohort.id, inviterName: creator?.name ?? 'A friend', courseTitle: course.title });

  return toPublic(cohort, creatorId);
}

export async function inviteMembers(userId: string, cohortId: string, inviteUserIds: string[]): Promise<PublicCohort> {
  const cohort = await assertJoined(userId, cohortId);
  const existing = await hydrateMembers(cohortId);
  const existingIds = new Set(existing.map((m) => m.userId));
  const room = MAX_COHORT_MEMBERS - existing.length;
  if (room <= 0) throw errors.conflict('This cohort is already full.');

  const candidates = [...new Set(inviteUserIds)].filter((id) => !existingIds.has(id)).slice(0, room);
  if (candidates.length === 0) return toPublic(cohort, userId, existing);

  const rows = await getDb().select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, candidates));
  const validCandidates = rows.filter((u) => u.role === 'seeker').map((u) => u.id);
  if (validCandidates.length === 0) return toPublic(cohort, userId, existing);

  await getDb()
    .insert(cohortMembers)
    .values(validCandidates.map((id) => ({ cohortId, userId: id, status: 'invited' as const, invitedBy: userId })));

  const [inviter] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  for (const id of validCandidates)
    void sendCohortInvitePush({ recipientId: id, cohortId, inviterName: inviter?.name ?? 'A friend', courseTitle: courseTitleFor(cohort.courseId) });

  return toPublic(cohort, userId);
}

export async function respondToInvite(userId: string, cohortId: string, accept: boolean): Promise<PublicCohort> {
  const [cohort] = await getDb().select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  if (!cohort) throw errors.notFound('Cohort not found.');
  const [member] = await getDb()
    .select()
    .from(cohortMembers)
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)))
    .limit(1);
  if (!member || member.status !== 'invited') throw errors.conflict('No pending invite found.');

  await getDb()
    .update(cohortMembers)
    .set({ status: accept ? 'joined' : 'declined', lastReadAt: accept ? new Date() : member.lastReadAt })
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)));

  if (accept) {
    const [me] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    void postSystemMessage(cohortId, `${me?.name ?? 'A member'} joined the cohort.`);
  }

  return toPublic(cohort, userId);
}

export async function listMine(userId: string): Promise<PublicCohort[]> {
  const rows = await getDb()
    .select({ cohort: cohorts })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohortMembers.cohortId, cohorts.id))
    .where(eq(cohortMembers.userId, userId));
  if (rows.length === 0) return [];

  const results: PublicCohort[] = [];
  for (const { cohort } of rows) {
    const members = await hydrateMembers(cohort.id);
    const mine = members.find((m) => m.userId === userId);
    const pub = await toPublic(cohort, userId, members);

    const msgs = await getDb()
      .select()
      .from(cohortMessages)
      .where(eq(cohortMessages.cohortId, cohort.id))
      .orderBy(asc(cohortMessages.createdAt))
      .limit(200);
    const last = msgs[msgs.length - 1];
    const since = mine?.lastReadAt ?? new Date(0);
    const unread = msgs.filter((m) => m.senderId !== userId && m.createdAt > since).length;

    results.push({
      ...pub,
      lastMessagePreview: last ? preview(last.body, last.kind) : null,
      lastMessageAt: last ? last.createdAt.toISOString() : null,
      unread,
    });
  }
  return results.sort((a, b) => {
    const at = a.lastMessageAt ?? a.createdAt;
    const bt = b.lastMessageAt ?? b.createdAt;
    return bt.localeCompare(at);
  });
}

export async function findById(userId: string, cohortId: string): Promise<PublicCohort> {
  const [cohort] = await getDb().select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  if (!cohort) throw errors.notFound('Cohort not found.');
  const members = await hydrateMembers(cohortId);
  if (!members.some((m) => m.userId === userId)) throw errors.forbidden();
  return toPublic(cohort, userId, members);
}

export async function listMessages(
  userId: string,
  cohortId: string,
  filter: { limit: number },
): Promise<PublicCohortMessage[]> {
  await assertJoined(userId, cohortId);
  const rows = await getDb()
    .select()
    .from(cohortMessages)
    .where(eq(cohortMessages.cohortId, cohortId))
    .orderBy((t) => t.createdAt)
    .limit(filter.limit);
  return Promise.all(rows.map(publicMessage));
}

export interface SendCohortMessageInput {
  body?: string;
  kind?: 'text' | 'image';
  attachment?: { dataUrl: string; mimeType: string; sizeBytes: number } | null;
}

export async function sendMessage(
  userId: string,
  cohortId: string,
  input: SendCohortMessageInput,
): Promise<PublicCohortMessage> {
  const cohort = await assertJoined(userId, cohortId);
  const kind = input.kind ?? 'text';
  const body = (input.body ?? '').trim();
  if (kind === 'text' && !body) throw errors.validation(null, 'Message cannot be empty.');

  const [row] = await getDb()
    .insert(cohortMessages)
    .values({ cohortId, senderId: userId, kind, body, attachment: input.attachment ?? null })
    .returning();
  if (!row) throw errors.internal('Could not send message.');

  const json = await publicMessage(row);
  const members = await hydrateMembers(cohortId);
  const others = members.filter((m) => m.status === 'joined' && m.userId !== userId);
  for (const m of others) emitToUser(m.userId, 'cohort:message_received', json);

  const [sender] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (others.length > 0)
    void sendCohortMessagePush({
      recipientIds: others.map((m) => m.userId),
      cohortId,
      senderName: sender?.name ?? 'A cohort member',
      body: kind === 'text' ? body : preview(body, kind),
      cohortName: cohort.name,
    });

  return json;
}

export async function markRead(userId: string, cohortId: string): Promise<void> {
  await assertJoined(userId, cohortId);
  await getDb()
    .update(cohortMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)));
}
