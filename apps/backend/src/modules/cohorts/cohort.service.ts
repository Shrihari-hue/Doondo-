/**
 * Peer cohorts — up to 5 workers taking the same course together.
 * Create one for a course, share the 6-letter code (or invite friends found
 * via Find Friends), see each other's lesson progress, and keep each other
 * going on a simple message board.
 */
import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { randomCode } from '@/modules/users/scoreCredential.service';
import { UserModel } from '@/modules/users/user.model';
import { EnrollmentModel } from '@/modules/courses/enrollment.model';
import { findCourse } from '@/modules/courses/courses.catalogue';
import { sendCohortPush } from '@/lib/push';
import { CohortMessageModel, CohortModel, COHORT_MAX } from './cohort.model';

export interface PublicCohort {
  id: string;
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  name: string;
  code: string;
  members: Array<{ id: string; name: string; photoUrl: string | null; completedLessons: number; completed: boolean }>;
  lastMessageAt: string | null;
}

async function hydrate(c: { _id: unknown; courseId: string; name: string; code: string; members: Types.ObjectId[]; lastMessageAt?: Date | null }): Promise<PublicCohort> {
  const course = findCourse(c.courseId);
  const [users, enrollments] = await Promise.all([
    UserModel.find({ _id: { $in: c.members } }).select('name photoUrl').lean(),
    EnrollmentModel.find({ seekerId: { $in: c.members }, courseId: c.courseId }).select('seekerId completedLessonIds completedAt').lean(),
  ]);
  const enr = new Map(enrollments.map((e) => [String(e.seekerId), e]));
  return {
    id: String(c._id),
    courseId: c.courseId,
    courseTitle: course?.title ?? c.courseId,
    totalLessons: course?.lessons.length ?? 0,
    name: c.name,
    code: c.code,
    members: c.members.map((m) => {
      const u = users.find((x) => String(x._id) === String(m)) as { name?: string; photoUrl?: string | null } | undefined;
      const e = enr.get(String(m));
      return {
        id: String(m),
        name: u?.name ?? 'Member',
        photoUrl: u?.photoUrl ?? null,
        completedLessons: e?.completedLessonIds?.length ?? 0,
        completed: Boolean(e?.completedAt),
      };
    }),
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
  };
}

export async function createCohort(userId: string, courseId: string, name?: string): Promise<PublicCohort> {
  const course = findCourse(courseId);
  if (!course) throw errors.notFound('Course not found.');
  const mine = await CohortModel.countDocuments({ members: new Types.ObjectId(userId) });
  if (mine >= 5) throw errors.conflict('You can be in at most 5 course groups.');
  let code = '';
  for (let i = 0; i < 5; i++) {
    code = randomCode(6);
    if (!(await CohortModel.exists({ code }))) break;
  }
  const c = await CohortModel.create({
    courseId,
    name: name?.trim() || `${course.title} group`,
    code,
    createdBy: new Types.ObjectId(userId),
    members: [new Types.ObjectId(userId)],
  });
  return hydrate(c.toObject());
}

export async function listMine(userId: string): Promise<PublicCohort[]> {
  const rows = await CohortModel.find({ members: new Types.ObjectId(userId) }).sort({ lastMessageAt: -1, createdAt: -1 }).limit(10).lean();
  return Promise.all(rows.map((r) => hydrate(r)));
}

export async function joinByCode(userId: string, rawCode: string): Promise<PublicCohort> {
  const code = rawCode.trim().toUpperCase();
  const uid = new Types.ObjectId(userId);
  // Atomic: only joins while there's room and you're not already in.
  const c = await CohortModel.findOneAndUpdate(
    { code, members: { $ne: uid }, [`members.${COHORT_MAX - 1}`]: { $exists: false } },
    { $push: { members: uid } },
    { new: true },
  ).lean();
  if (!c) {
    const exists = await CohortModel.findOne({ code }).select('members').lean();
    if (!exists) throw errors.notFound('No group with that code.');
    if (exists.members.some((m) => String(m) === userId)) throw errors.conflict("You're already in this group.");
    throw errors.conflict('This group is full (5 people).');
  }
  const me = await UserModel.findById(userId).select('name').lean();
  for (const m of c.members) {
    if (String(m) === userId) continue;
    void sendCohortPush({ recipientId: String(m), cohortId: String(c._id), title: c.name, body: `${(me as { name?: string } | null)?.name ?? 'Someone'} joined your group.` }).catch(() => undefined);
  }
  return hydrate(c);
}

export async function leave(userId: string, cohortId: string): Promise<void> {
  if (!Types.ObjectId.isValid(cohortId)) throw errors.notFound('Group not found.');
  const c = await CohortModel.findOneAndUpdate({ _id: cohortId }, { $pull: { members: new Types.ObjectId(userId) } }, { new: true });
  if (c && c.members.length === 0) {
    await Promise.all([CohortModel.deleteOne({ _id: c._id }), CohortMessageModel.deleteMany({ cohortId: c._id })]);
  }
}

async function memberOf(userId: string, cohortId: string) {
  if (!Types.ObjectId.isValid(cohortId)) throw errors.notFound('Group not found.');
  const c = await CohortModel.findOne({ _id: cohortId, members: new Types.ObjectId(userId) }).lean();
  if (!c) throw errors.notFound('Group not found.');
  return c;
}

export async function getCohort(userId: string, cohortId: string): Promise<PublicCohort> {
  return hydrate(await memberOf(userId, cohortId));
}

export interface PublicCohortMessage { id: string; senderId: string; senderName: string; text: string; createdAt: string }

export async function listMessages(userId: string, cohortId: string): Promise<PublicCohortMessage[]> {
  const c = await memberOf(userId, cohortId);
  const rows = await CohortMessageModel.find({ cohortId: c._id }).sort({ createdAt: -1 }).limit(100).lean();
  const users = await UserModel.find({ _id: { $in: [...new Set(rows.map((r) => String(r.senderId)))] } }).select('name').lean();
  const nm = new Map(users.map((u) => [String(u._id), (u as { name?: string }).name ?? '']));
  return rows.reverse().map((r) => ({ id: String(r._id), senderId: String(r.senderId), senderName: nm.get(String(r.senderId)) ?? '', text: r.text, createdAt: r.createdAt.toISOString() }));
}

export async function postMessage(userId: string, cohortId: string, text: string): Promise<PublicCohortMessage> {
  const c = await memberOf(userId, cohortId);
  const m = await CohortMessageModel.create({ cohortId: c._id, senderId: new Types.ObjectId(userId), text: text.trim() });
  await CohortModel.updateOne({ _id: c._id }, { $set: { lastMessageAt: m.createdAt } });
  const me = await UserModel.findById(userId).select('name').lean();
  const sender = (me as { name?: string } | null)?.name ?? '';
  for (const member of c.members) {
    if (String(member) === userId) continue;
    void sendCohortPush({ recipientId: String(member), cohortId: String(c._id), title: c.name, body: `${sender}: ${m.text}`.slice(0, 160), message: true })
      .catch((err) => logger.warn({ err }, 'cohort push failed'));
  }
  return { id: String(m._id), senderId: userId, senderName: sender, text: m.text, createdAt: m.createdAt.toISOString() };
}
