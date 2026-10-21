/**
 * Bookable 1:1 mentor sessions — slots, booking, UPI payment, lifecycle.
 */
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendMentorSessionPush } from '@/lib/push';
import { UserModel } from '@/modules/users/user.model';
import { MentorModel } from './mentor.model';
import { MentorSessionModel, type SessionMode, type SessionStatus } from './mentorSession.model';

export interface PublicSession {
  id: string;
  mentorUserId: string;
  mentorName: string;
  menteeId: string | null;
  menteeName: string | null;
  startAt: string;
  durationMinutes: number;
  priceRupees: number;
  mode: SessionMode;
  topic: string | null;
  note: string | null;
  status: SessionStatus;
  payment: { ref: string; upiUri: string | null; menteeMarkedPaidAt: string | null; mentorConfirmedAt: string | null } | null;
  cancelledBy: 'mentor' | 'mentee' | null;
}

const MAX_OPEN_SLOTS = 30;

async function names(ids: Array<Types.ObjectId | null | undefined>): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter(Boolean).map((i) => i!.toString()))];
  const users = await UserModel.find({ _id: { $in: clean } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), (u as { name?: string }).name ?? '']));
}

function toPublic(s: InstanceType<typeof MentorSessionModel> | Record<string, any>, nm: Map<string, string>): PublicSession {
  const p = s.payment as PublicSession['payment'] | (Record<string, any> & { menteeMarkedPaidAt?: Date | null; mentorConfirmedAt?: Date | null }) | null;
  return {
    id: String(s._id),
    mentorUserId: String(s.mentorUserId),
    mentorName: nm.get(String(s.mentorUserId)) ?? '',
    menteeId: s.menteeId ? String(s.menteeId) : null,
    menteeName: s.menteeId ? nm.get(String(s.menteeId)) ?? null : null,
    startAt: new Date(s.startAt).toISOString(),
    durationMinutes: s.durationMinutes,
    priceRupees: s.priceRupees,
    mode: s.mode,
    topic: s.topic ?? null,
    note: s.note ?? null,
    status: s.status,
    payment: p
      ? {
          ref: (p as { ref: string }).ref,
          upiUri: (p as { upiUri?: string | null }).upiUri ?? null,
          menteeMarkedPaidAt: p.menteeMarkedPaidAt ? new Date(p.menteeMarkedPaidAt as unknown as string).toISOString() : null,
          mentorConfirmedAt: p.mentorConfirmedAt ? new Date(p.mentorConfirmedAt as unknown as string).toISOString() : null,
        }
      : null,
    cancelledBy: s.cancelledBy ?? null,
  };
}

function when(d: Date): string {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export async function createSlots(
  mentorUserId: string,
  slots: Array<{ startAt: string; durationMinutes: number; priceRupees: number; mode?: SessionMode; topic?: string | null }>,
): Promise<PublicSession[]> {
  const mentor = await MentorModel.findOne({ userId: new Types.ObjectId(mentorUserId) }).lean();
  if (!mentor) throw errors.forbidden('Become a mentor first.');
  const open = await MentorSessionModel.countDocuments({ mentorUserId: new Types.ObjectId(mentorUserId), status: 'open', startAt: { $gt: new Date() } });
  if (open + slots.length > MAX_OPEN_SLOTS) throw errors.conflict(`You can have at most ${MAX_OPEN_SLOTS} open slots.`);
  const now = Date.now();
  for (const s of slots) {
    if (new Date(s.startAt).getTime() < now + 30 * 60 * 1000) throw errors.validation(null, 'Slots must start at least 30 minutes from now.');
  }
  const created = await MentorSessionModel.insertMany(
    slots.map((s) => ({
      mentorUserId: new Types.ObjectId(mentorUserId),
      startAt: new Date(s.startAt),
      durationMinutes: s.durationMinutes,
      priceRupees: Math.round(s.priceRupees),
      mode: s.mode ?? 'call',
      topic: s.topic?.trim() || null,
    })),
  );
  const nm = await names([new Types.ObjectId(mentorUserId)]);
  return created.map((c) => toPublic(c, nm));
}

export async function listOpenSlots(mentorUserId: string): Promise<PublicSession[]> {
  if (!Types.ObjectId.isValid(mentorUserId)) return [];
  const rows = await MentorSessionModel.find({
    mentorUserId: new Types.ObjectId(mentorUserId),
    status: 'open',
    startAt: { $gt: new Date(Date.now() + 15 * 60 * 1000) },
  })
    .sort({ startAt: 1 })
    .limit(40)
    .lean();
  const nm = await names([new Types.ObjectId(mentorUserId)]);
  return rows.map((r) => toPublic(r, nm));
}

export async function listMine(userId: string): Promise<{ asMentor: PublicSession[]; asMentee: PublicSession[] }> {
  const oid = new Types.ObjectId(userId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [asMentor, asMentee] = await Promise.all([
    MentorSessionModel.find({ mentorUserId: oid, startAt: { $gte: since } }).sort({ startAt: 1 }).limit(100).lean(),
    MentorSessionModel.find({ menteeId: oid, startAt: { $gte: since } }).sort({ startAt: 1 }).limit(100).lean(),
  ]);
  const nm = await names([...asMentor, ...asMentee].flatMap((s) => [s.mentorUserId, s.menteeId]));
  return { asMentor: asMentor.map((s) => toPublic(s, nm)), asMentee: asMentee.map((s) => toPublic(s, nm)) };
}

function buildUpi(vpa: string, name: string, amount: number, ref: string): string {
  const q = new URLSearchParams({ pa: vpa, pn: name, am: amount.toFixed(2), tn: 'Doondo mentor session', cu: 'INR', tr: ref });
  return `upi://pay?${q.toString()}`;
}

export async function book(menteeId: string, sessionId: string, note?: string | null): Promise<PublicSession> {
  if (!Types.ObjectId.isValid(sessionId)) throw errors.notFound('Session not found.');
  const pre = await MentorSessionModel.findById(sessionId).lean();
  if (!pre) throw errors.notFound('Session not found.');
  if (pre.mentorUserId.toString() === menteeId) throw errors.conflict("You can't book your own slot.");
  let payment: NonNullable<PublicSession['payment']> | null = null;
  if (pre.priceRupees > 0) {
    const mentorUser = await UserModel.findById(pre.mentorUserId).select('name upiVpa').lean();
    const vpa = (mentorUser as { upiVpa?: string | null } | null)?.upiVpa ?? null;
    const ref = `DMS${randomBytes(4).toString('hex').toUpperCase()}`;
    payment = {
      ref,
      upiUri: vpa ? buildUpi(vpa, (mentorUser as { name?: string }).name ?? 'Mentor', pre.priceRupees, ref) : null,
      menteeMarkedPaidAt: null,
      mentorConfirmedAt: null,
    };
  }
  // Atomic claim — two mentees racing for one slot can't both win.
  const s = await MentorSessionModel.findOneAndUpdate(
    { _id: sessionId, status: 'open', startAt: { $gt: new Date() } },
    { $set: { status: 'booked', menteeId: new Types.ObjectId(menteeId), note: note?.trim() || null, payment } },
    { new: true },
  );
  if (!s) throw errors.conflict('This slot was just taken. Pick another time.');
  const nm = await names([s.mentorUserId, s.menteeId]);
  void sendMentorSessionPush({
    recipientId: s.mentorUserId.toString(),
    title: 'Mentor session booked',
    body: `${nm.get(menteeId) ?? 'A worker'} booked ${when(s.startAt)}${s.priceRupees ? ` · ₹${s.priceRupees}` : ''}.`,
    sessionId: s.id,
  }).catch((err) => logger.warn({ err }, 'mentor push failed'));
  return toPublic(s, nm);
}

async function loadParty(userId: string, sessionId: string) {
  if (!Types.ObjectId.isValid(sessionId)) throw errors.notFound('Session not found.');
  const s = await MentorSessionModel.findById(sessionId);
  if (!s) throw errors.notFound('Session not found.');
  const isMentor = s.mentorUserId.toString() === userId;
  const isMentee = s.menteeId?.toString() === userId;
  if (!isMentor && !isMentee) throw errors.notFound('Session not found.');
  return { s, isMentor, isMentee };
}

export async function cancel(userId: string, sessionId: string): Promise<PublicSession> {
  const { s, isMentor } = await loadParty(userId, sessionId);
  if (s.status === 'completed' || s.status === 'cancelled') throw errors.conflict('This session is already closed.');
  const other = isMentor ? s.menteeId : s.mentorUserId;
  if (!isMentor && s.status === 'booked') {
    // A mentee cancelling re-opens the slot for someone else.
    s.status = 'open';
    s.menteeId = null;
    s.payment = null;
    s.note = null;
  } else {
    s.status = 'cancelled';
    s.cancelledBy = isMentor ? 'mentor' : 'mentee';
  }
  await s.save();
  if (other) {
    void sendMentorSessionPush({
      recipientId: other.toString(),
      title: 'Mentor session cancelled',
      body: `The session on ${when(s.startAt)} was cancelled.`,
      sessionId: s.id,
    }).catch(() => undefined);
  }
  return toPublic(s, await names([s.mentorUserId, s.menteeId]));
}

export async function markPaid(userId: string, sessionId: string): Promise<PublicSession> {
  const { s, isMentor, isMentee } = await loadParty(userId, sessionId);
  if (!s.payment || s.status === 'cancelled') throw errors.conflict('Nothing to pay for this session.');
  if (isMentee) {
    s.payment.menteeMarkedPaidAt = new Date();
    void sendMentorSessionPush({
      recipientId: s.mentorUserId.toString(),
      title: 'Mentee says they paid',
      body: `₹${s.priceRupees} for ${when(s.startAt)} — check your UPI app and confirm.`,
      sessionId: s.id,
    }).catch(() => undefined);
  }
  if (isMentor) s.payment.mentorConfirmedAt = new Date();
  s.markModified('payment');
  await s.save();
  return toPublic(s, await names([s.mentorUserId, s.menteeId]));
}

export async function complete(userId: string, sessionId: string): Promise<PublicSession> {
  const { s, isMentor } = await loadParty(userId, sessionId);
  if (!isMentor) throw errors.forbidden('Only the mentor can mark a session done.');
  if (s.status !== 'booked') throw errors.conflict('Only booked sessions can be completed.');
  if (s.startAt.getTime() > Date.now()) throw errors.conflict("This session hasn't started yet.");
  s.status = 'completed';
  await s.save();
  return toPublic(s, await names([s.mentorUserId, s.menteeId]));
}
