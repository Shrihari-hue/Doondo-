/**
 * mentor.service — discovery + request lifecycle.
 *
 * Surface:
 *   listForTrade(trade, city)     — mentees browse open mentors near them
 *   becomeMentor(userId, ...)     — toggle on; creates the Mentor row
 *   stopBeingMentor(userId)       — soft-close (sets open=false, keeps rec)
 *   requestMentorship(...)        — mentee → mentor
 *   respondToRequest(...)         — mentor accepts / declines / ends
 *   listMyRequests(userId)        — both sides of the mentorship list
 */

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { mentors, mentorshipRequests, users, type MentorshipStatus } from '@/db/schema';

const MAX_PENDING_PER_MENTEE = 5;

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
