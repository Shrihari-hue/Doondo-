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

import { Types } from 'mongoose';
import {
  MentorModel,
  MentorshipRequestModel,
  type Mentor,
  type MentorshipRequest,
} from './mentor.model';
import { UserModel } from '@/modules/users/user.model';

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

async function hydrate(m: Mentor & { _id: unknown }): Promise<PublicMentor> {
  const u = await UserModel.findById(m.userId).select('name photoUrl').lean();
  return {
    id: (m._id as unknown as Types.ObjectId).toString(),
    userId: (m.userId as unknown as Types.ObjectId).toString(),
    name: ((u as { name?: string } | null)?.name as string | undefined) ?? '',
    photoUrl:
      ((u as { photoUrl?: string | null } | null)?.photoUrl as string | null | undefined) ??
      null,
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
  const mentors = await MentorModel.find({
    trade: trade.toLowerCase(),
    city,
    open: true,
  })
    .limit(40)
    .lean();
  // Filter mentors at cap and hydrate names in parallel.
  const eligible = mentors.filter((m) => m.activeMentees < m.monthlyCap);
  return Promise.all(eligible.map((m) => hydrate(m as Mentor & { _id: unknown })));
}

export async function becomeMentor(input: {
  userId: string | Types.ObjectId;
  trade: string;
  city: string;
  bio?: string;
}): Promise<PublicMentor> {
  const uid = new Types.ObjectId(input.userId);
  const existing = await MentorModel.findOne({ userId: uid });
  if (existing) {
    existing.trade = input.trade.toLowerCase();
    existing.city = input.city;
    if (typeof input.bio === 'string') existing.bio = input.bio;
    existing.open = true;
    await existing.save();
    return hydrate(existing.toObject() as Mentor & { _id: unknown });
  }
  const created = await MentorModel.create({
    userId: uid,
    trade: input.trade.toLowerCase(),
    city: input.city,
    bio: input.bio ?? '',
    open: true,
  });
  return hydrate(created.toObject() as Mentor & { _id: unknown });
}

export async function stopBeingMentor(userId: string | Types.ObjectId): Promise<void> {
  await MentorModel.updateOne(
    { userId: new Types.ObjectId(userId) },
    { $set: { open: false } },
  );
}

export interface PublicRequest {
  id: string;
  menteeId: string;
  mentorId: string;
  trade: string;
  city: string;
  message: string;
  status: MentorshipRequest['status'];
  createdAt: string;
}

function toPublic(r: MentorshipRequest & { _id: unknown }): PublicRequest {
  return {
    id: (r._id as unknown as Types.ObjectId).toString(),
    menteeId: (r.menteeId as unknown as Types.ObjectId).toString(),
    mentorId: (r.mentorId as unknown as Types.ObjectId).toString(),
    trade: r.trade,
    city: r.city,
    message: r.message,
    status: r.status,
    createdAt: (r as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function requestMentorship(input: {
  menteeId: string | Types.ObjectId;
  mentorUserId: string | Types.ObjectId;
  message: string;
}): Promise<PublicRequest> {
  const menteeId = new Types.ObjectId(input.menteeId);
  const mentor = await MentorModel.findOne({
    userId: new Types.ObjectId(input.mentorUserId),
  });
  if (!mentor) throw new Error('Mentor not found');
  if (!mentor.open) throw new Error('Mentor not accepting requests');
  // Don't allow flood requests from a single mentee.
  const pendingCount = await MentorshipRequestModel.countDocuments({
    menteeId,
    status: 'pending',
  });
  if (pendingCount >= MAX_PENDING_PER_MENTEE) {
    throw new Error('Too many pending mentorship requests. Cancel one first.');
  }
  // Block re-requests to the same mentor while one is in flight.
  const existing = await MentorshipRequestModel.findOne({
    menteeId,
    mentorId: mentor.userId,
    status: { $in: ['pending', 'accepted'] },
  });
  if (existing) return toPublic(existing.toObject() as MentorshipRequest & { _id: unknown });

  const created = await MentorshipRequestModel.create({
    menteeId,
    mentorId: mentor.userId,
    trade: mentor.trade,
    city: mentor.city,
    message: input.message.slice(0, 400),
    status: 'pending',
  });
  return toPublic(created.toObject() as MentorshipRequest & { _id: unknown });
}

export async function respondToRequest(input: {
  requestId: string | Types.ObjectId;
  responderId: string | Types.ObjectId;
  decision: 'accepted' | 'declined' | 'ended';
}): Promise<PublicRequest> {
  const req = await MentorshipRequestModel.findById(input.requestId);
  if (!req) throw new Error('Request not found');
  const responder = new Types.ObjectId(input.responderId);
  if (!(req.mentorId as unknown as Types.ObjectId).equals(responder)) {
    throw new Error('Only the mentor can respond to this request.');
  }
  const prevStatus = req.status;
  req.status = input.decision;
  await req.save();
  // Maintain activeMentees counter.
  if (input.decision === 'accepted' && prevStatus !== 'accepted') {
    await MentorModel.updateOne(
      { userId: req.mentorId },
      { $inc: { activeMentees: 1 } },
    );
  } else if (input.decision === 'ended' && prevStatus === 'accepted') {
    await MentorModel.updateOne(
      { userId: req.mentorId },
      { $inc: { activeMentees: -1 } },
    );
  }
  return toPublic(req.toObject() as MentorshipRequest & { _id: unknown });
}

export async function listMyRequests(
  userId: string | Types.ObjectId,
): Promise<{ asMentee: PublicRequest[]; asMentor: PublicRequest[] }> {
  const uid = new Types.ObjectId(userId);
  const [asMentee, asMentor] = await Promise.all([
    MentorshipRequestModel.find({ menteeId: uid }).sort({ createdAt: -1 }).limit(40).lean(),
    MentorshipRequestModel.find({ mentorId: uid }).sort({ createdAt: -1 }).limit(40).lean(),
  ]);
  return {
    asMentee: asMentee.map((r) => toPublic(r as MentorshipRequest & { _id: unknown })),
    asMentor: asMentor.map((r) => toPublic(r as MentorshipRequest & { _id: unknown })),
  };
}
