/**
 * mentor.service — discovery + request lifecycle + bookable sessions.
 *
 * Surface:
 *   listForTrade(trade, city)     — mentees browse open mentors near them
 *   becomeMentor(userId, ...)     — toggle on; creates the Mentor row
 *   stopBeingMentor(userId)       — soft-close (sets open=false, keeps rec)
 *   requestMentorship(...)        — mentee → mentor
 *   respondToRequest(...)         — mentor accepts / declines / ends
 *   listMyRequests(userId)        — both sides of the mentorship list
 *   openSessionSlot(...)          — mentor opens a bookable 1:1 time slot
 *   listOpenSlots(...)            — mentee views a mentor's open slots
 *   bookSlot(...)                 — mentee claims an open slot
 *   cancelSession(...)            — either side cancels a slot/booking
 *   listMySessions(userId)        — both sides of the session calendar
 */

import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  mentors,
  mentorshipRequests,
  mentorSessions,
  users,
  type MentorshipStatus,
  type MentorSessionMode,
  type MentorSessionStatus,
} from '@/db/schema';
import { sendMentorSessionPush } from '@/lib/push';

const MAX_PENDING_PER_MENTEE = 5;
/** How far ahead a mentor can open a slot — keeps the calendar realistic. */
const MAX_SLOT_LEAD_DAYS = 60;

export interface PublicMentor {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  trade: string;
  city: string;
  bio: string;
  open: boolean;
  activeMentees: number;
  monthlyCap: number;
}

type MentorRow = typeof mentors.$inferSelect;
type RequestRow = typeof mentorshipRequests.$inferSelect;

async function hydrate(m: MentorRow): Promise<PublicMentor> {
  const [u] = await getDb().select({ name: users.name, photoUrl: users.photoUrl }).from(users).where(eq(users.id, m.userId)).limit(1);
  return {
    id: m.id,
    userId: m.userId,
    name: u?.name ?? '',
    photoUrl: u?.photoUrl ?? null,
    trade: m.trade,
    city: m.city,
    bio: m.bio,
    open: m.open,
    activeMentees: m.activeMentees,
    monthlyCap: m.monthlyCap,
  };
}

export async function listForTrade(
  trade: string,
  city: string,
): Promise<PublicMentor[]> {
  const rows = await getDb()
    .select()
    .from(mentors)
    .where(and(eq(mentors.trade, trade.toLowerCase()), eq(mentors.city, city), eq(mentors.open, true), lt(mentors.activeMentees, mentors.monthlyCap)))
    .limit(40);
  return Promise.all(rows.map((m) => hydrate(m)));
}

export async function becomeMentor(input: {
  userId: string;
  trade: string;
  city: string;
  bio?: string;
}): Promise<PublicMentor> {
  const [existing] = await getDb().select().from(mentors).where(eq(mentors.userId, input.userId)).limit(1);
  if (existing) {
    const [updated] = await getDb()
      .update(mentors)
      .set({
        trade: input.trade.toLowerCase(),
        city: input.city,
        bio: typeof input.bio === 'string' ? input.bio : existing.bio,
        open: true,
      })
      .where(eq(mentors.id, existing.id))
      .returning();
    return hydrate(updated!);
  }
  const [created] = await getDb()
    .insert(mentors)
    .values({
      userId: input.userId,
      trade: input.trade.toLowerCase(),
      city: input.city,
      bio: input.bio ?? '',
      open: true,
    })
    .returning();
  return hydrate(created!);
}

export async function stopBeingMentor(userId: string): Promise<void> {
  await getDb().update(mentors).set({ open: false }).where(eq(mentors.userId, userId));
}

export interface PublicRequest {
  id: string;
  menteeId: string;
  mentorId: string;
  trade: string;
  city: string;
  message: string;
  status: MentorshipStatus;
  createdAt: string;
}

function toPublic(r: RequestRow): PublicRequest {
  return {
    id: r.id,
    menteeId: r.menteeId,
    mentorId: r.mentorId,
    trade: r.trade,
    city: r.city,
    message: r.message,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function requestMentorship(input: {
  menteeId: string;
  mentorUserId: string;
  message: string;
}): Promise<PublicRequest> {
  const db = getDb();
  const [mentor] = await db.select().from(mentors).where(eq(mentors.userId, input.mentorUserId)).limit(1);
  if (!mentor) throw new Error('Mentor not found');
  if (!mentor.open) throw new Error('Mentor not accepting requests');
  // Don't allow flood requests from a single mentee.
  const [pendingCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mentorshipRequests)
    .where(and(eq(mentorshipRequests.menteeId, input.menteeId), eq(mentorshipRequests.status, 'pending')));
  if ((pendingCountRow?.count ?? 0) >= MAX_PENDING_PER_MENTEE) {
    throw new Error('Too many pending mentorship requests. Cancel one first.');
  }
  // Block re-requests to the same mentor while one is in flight.
  const [existing] = await db
    .select()
    .from(mentorshipRequests)
    .where(
      and(
        eq(mentorshipRequests.menteeId, input.menteeId),
        eq(mentorshipRequests.mentorId, mentor.userId),
        inArray(mentorshipRequests.status, ['pending', 'accepted']),
      ),
    )
    .limit(1);
  if (existing) return toPublic(existing);

  const [created] = await db
    .insert(mentorshipRequests)
    .values({
      menteeId: input.menteeId,
      mentorId: mentor.userId,
      trade: mentor.trade,
      city: mentor.city,
      message: input.message.slice(0, 400),
      status: 'pending',
    })
    .returning();
  return toPublic(created!);
}

export async function respondToRequest(input: {
  requestId: string;
  responderId: string;
  decision: 'accepted' | 'declined' | 'ended';
}): Promise<PublicRequest> {
  const db = getDb();
  const [req] = await db.select().from(mentorshipRequests).where(eq(mentorshipRequests.id, input.requestId)).limit(1);
  if (!req) throw new Error('Request not found');
  if (req.mentorId !== input.responderId) {
    throw new Error('Only the mentor can respond to this request.');
  }
  const prevStatus = req.status;
  const [updated] = await db
    .update(mentorshipRequests)
    .set({ status: input.decision })
    .where(eq(mentorshipRequests.id, req.id))
    .returning();
  // Maintain activeMentees counter.
  if (input.decision === 'accepted' && prevStatus !== 'accepted') {
    await db.update(mentors).set({ activeMentees: sql`${mentors.activeMentees} + 1` }).where(eq(mentors.userId, req.mentorId));
  } else if (input.decision === 'ended' && prevStatus === 'accepted') {
    await db.update(mentors).set({ activeMentees: sql`greatest(${mentors.activeMentees} - 1, 0)` }).where(eq(mentors.userId, req.mentorId));
  }
  return toPublic(updated!);
}

export async function listMyRequests(
  userId: string,
): Promise<{ asMentee: PublicRequest[]; asMentor: PublicRequest[] }> {
  const db = getDb();
  const [asMentee, asMentor] = await Promise.all([
    db.select().from(mentorshipRequests).where(eq(mentorshipRequests.menteeId, userId)).orderBy(desc(mentorshipRequests.createdAt)).limit(40),
    db.select().from(mentorshipRequests).where(eq(mentorshipRequests.mentorId, userId)).orderBy(desc(mentorshipRequests.createdAt)).limit(40),
  ]);
  return {
    asMentee: asMentee.map(toPublic),
    asMentor: asMentor.map(toPublic),
  };
}

// ─── Bookable 1:1 sessions ───────────────────────────────────────────────────

export interface PublicSession {
  id: string;
  mentorId: string;
  mentorName?: string;
  menteeId: string | null;
  menteeName?: string;
  trade: string;
  scheduledFor: string;
  durationMinutes: number;
  mode: MentorSessionMode;
  meetingLink: string | null;
  location: string | null;
  notes: string | null;
  status: MentorSessionStatus;
}

type SessionRow = typeof mentorSessions.$inferSelect;

function toPublicSession(s: SessionRow): PublicSession {
  return {
    id: s.id,
    mentorId: s.mentorId,
    menteeId: s.menteeId,
    trade: s.trade,
    scheduledFor: s.scheduledFor.toISOString(),
    durationMinutes: s.durationMinutes,
    mode: s.mode,
    meetingLink: s.meetingLink,
    location: s.location,
    notes: s.notes,
    status: s.status,
  };
}

/** True when `menteeId` has an accepted, ongoing mentorship with `mentorUserId`. */
async function hasAcceptedMentorship(menteeId: string, mentorUserId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: mentorshipRequests.id })
    .from(mentorshipRequests)
    .where(
      and(
        eq(mentorshipRequests.menteeId, menteeId),
        eq(mentorshipRequests.mentorId, mentorUserId),
        eq(mentorshipRequests.status, 'accepted'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Mentor opens a bookable time slot. Requires an active `mentors` row
 * (i.e. they've turned mentoring on at least once) — the trade on the
 * slot is snapshotted from it so a mentee sees what the session covers
 * even if the mentor later changes trade.
 */
export async function openSessionSlot(input: {
  mentorUserId: string;
  scheduledFor: string;
  durationMinutes?: number;
  mode?: MentorSessionMode;
  meetingLink?: string;
  location?: string;
  notes?: string;
}): Promise<PublicSession> {
  const [mentor] = await getDb().select().from(mentors).where(eq(mentors.userId, input.mentorUserId)).limit(1);
  if (!mentor) throw new Error('Become a mentor before opening session slots.');

  const when = new Date(input.scheduledFor);
  const now = Date.now();
  if (Number.isNaN(when.getTime()) || when.getTime() < now) {
    throw new Error('Slot time must be a valid, future date.');
  }
  if (when.getTime() > now + MAX_SLOT_LEAD_DAYS * 86_400_000) {
    throw new Error(`Slots can only be opened up to ${MAX_SLOT_LEAD_DAYS} days ahead.`);
  }

  const [created] = await getDb()
    .insert(mentorSessions)
    .values({
      mentorId: input.mentorUserId,
      trade: mentor.trade,
      scheduledFor: when,
      durationMinutes: input.durationMinutes ?? 30,
      mode: input.mode ?? 'video',
      meetingLink: input.meetingLink ?? null,
      location: input.location ?? null,
      notes: input.notes?.slice(0, 400) ?? null,
      status: 'open',
    })
    .returning();
  return toPublicSession(created!);
}

/**
 * A mentor's own slots (open + booked + past), newest-first by time.
 * Used by the mentor's own "my session calendar" view.
 */
/** Attach mentorName/menteeName by looking up whichever ids are present. */
async function hydrateNames(rows: SessionRow[]): Promise<PublicSession[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.mentorId, r.menteeId]).filter((id): id is string => Boolean(id)))];
  const people = ids.length
    ? await getDb().select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))
    : [];
  const names = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    ...toPublicSession(r),
    mentorName: names.get(r.mentorId),
    menteeName: r.menteeId ? names.get(r.menteeId) : undefined,
  }));
}

export async function listMySlots(mentorUserId: string): Promise<PublicSession[]> {
  const rows = await getDb()
    .select()
    .from(mentorSessions)
    .where(eq(mentorSessions.mentorId, mentorUserId))
    .orderBy(desc(mentorSessions.scheduledFor))
    .limit(100);
  return hydrateNames(rows);
}

/**
 * The open (unbooked), future slots for one mentor — what a mentee sees
 * to pick a time. Gated on an accepted mentorship so only someone the
 * mentor has already agreed to mentor can book their calendar.
 */
export async function listOpenSlots(input: {
  menteeId: string;
  mentorUserId: string;
}): Promise<PublicSession[]> {
  if (!(await hasAcceptedMentorship(input.menteeId, input.mentorUserId))) {
    throw new Error('You need an accepted mentorship with this mentor first.');
  }
  const rows = await getDb()
    .select()
    .from(mentorSessions)
    .where(
      and(
        eq(mentorSessions.mentorId, input.mentorUserId),
        eq(mentorSessions.status, 'open'),
        gte(mentorSessions.scheduledFor, new Date()),
      ),
    )
    .orderBy(mentorSessions.scheduledFor)
    .limit(40);
  return rows.map(toPublicSession);
}

/**
 * Mentee books an open slot. The WHERE clause includes `status = 'open'`
 * so two mentees racing for the same slot can't both succeed — whoever's
 * UPDATE lands first flips it to 'booked' and the loser's affected-rows
 * comes back empty.
 */
export async function bookSlot(input: { menteeId: string; slotId: string }): Promise<PublicSession> {
  const [slot] = await getDb().select().from(mentorSessions).where(eq(mentorSessions.id, input.slotId)).limit(1);
  if (!slot) throw new Error('Session slot not found.');
  if (!(await hasAcceptedMentorship(input.menteeId, slot.mentorId))) {
    throw new Error('You need an accepted mentorship with this mentor first.');
  }

  const [booked] = await getDb()
    .update(mentorSessions)
    .set({ menteeId: input.menteeId, status: 'booked' })
    .where(and(eq(mentorSessions.id, input.slotId), eq(mentorSessions.status, 'open')))
    .returning();
  if (!booked) throw new Error('This slot was just booked by someone else. Pick another.');

  const [mentee] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, input.menteeId)).limit(1);
  void sendMentorSessionPush({
    recipientId: booked.mentorId,
    kind: 'booked',
    counterpartName: mentee?.name ?? 'A mentee',
    scheduledForIso: booked.scheduledFor.toISOString(),
  });

  return toPublicSession(booked);
}

/**
 * Either the mentor or the booked mentee cancels. Cancelling an *open*
 * (unbooked) slot is just the mentor removing an offer they made — no
 * notification needed since no one booked it yet.
 */
export async function cancelSession(input: { userId: string; sessionId: string }): Promise<PublicSession> {
  const [session] = await getDb().select().from(mentorSessions).where(eq(mentorSessions.id, input.sessionId)).limit(1);
  if (!session) throw new Error('Session not found.');
  if (session.mentorId !== input.userId && session.menteeId !== input.userId) {
    throw new Error('Only the mentor or mentee on this session can cancel it.');
  }
  if (session.status !== 'open' && session.status !== 'booked') {
    throw new Error('This session is already cancelled or completed.');
  }

  const [updated] = await getDb()
    .update(mentorSessions)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(eq(mentorSessions.id, session.id))
    .returning();

  if (session.status === 'booked' && session.menteeId) {
    const counterpartId = input.userId === session.mentorId ? session.menteeId : session.mentorId;
    const [canceller] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
    void sendMentorSessionPush({
      recipientId: counterpartId,
      kind: 'cancelled',
      counterpartName: canceller?.name ?? 'The other side',
      scheduledForIso: session.scheduledFor.toISOString(),
    });
  }

  return toPublicSession(updated!);
}

/** Both sides of the session calendar for one user — as mentor and as mentee. */
export async function listMySessions(
  userId: string,
): Promise<{ asMentor: PublicSession[]; asMentee: PublicSession[] }> {
  const db = getDb();
  const [asMentorRows, asMenteeRows] = await Promise.all([
    db.select().from(mentorSessions).where(eq(mentorSessions.mentorId, userId)).orderBy(desc(mentorSessions.scheduledFor)).limit(100),
    db
      .select()
      .from(mentorSessions)
      .where(eq(mentorSessions.menteeId, userId))
      .orderBy(desc(mentorSessions.scheduledFor))
      .limit(100),
  ]);
  const [asMentor, asMentee] = await Promise.all([hydrateNames(asMentorRows), hydrateNames(asMenteeRows)]);
  return { asMentor, asMentee };
}
