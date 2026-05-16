/**
 * Courses service — lookup against the static catalogue + enrollment
 * CRUD against the database.
 *
 * The catalogue itself is in code (courses.catalogue.ts) so we can ship
 * curated content quickly without admin tooling. Enrollment progress
 * lives in Mongo so it survives across devices and the worker's badges
 * follow them on their resume.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { COURSES, findCourse, findLesson, type Course } from './courses.catalogue';
import { EnrollmentModel, type PublicEnrollment } from './enrollment.model';
import { UserModel } from '@/modules/users/user.model';

// ─── Public-facing course shapes ────────────────────────────────────────────

export interface PublicCourseSummary {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  tint: string;
  level: Course['level'];
  totalDurationMinutes: number;
  lessonCount: number;
  relevantTrades: string[];
}

export interface PublicCourseDetail extends PublicCourseSummary {
  description: string;
  lessons: Array<{
    id: string;
    title: string;
    body: string;
    durationMinutes: number;
  }>;
}

function summarise(c: Course): PublicCourseSummary {
  return {
    id: c.id,
    title: c.title,
    tagline: c.tagline,
    emoji: c.emoji,
    tint: c.tint,
    level: c.level,
    totalDurationMinutes: c.totalDurationMinutes,
    lessonCount: c.lessons.length,
    relevantTrades: c.relevantTrades,
  };
}

function detail(c: Course): PublicCourseDetail {
  return {
    ...summarise(c),
    description: c.description,
    lessons: c.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      body: l.body,
      durationMinutes: l.durationMinutes,
    })),
  };
}

// ─── Catalogue reads ────────────────────────────────────────────────────────

/**
 * List all courses. Optionally sort by relevance to a given list of
 * trade slugs (a seeker's own skills) so the courses most useful to
 * them surface first.
 */
export function listCourses(opts: {
  relevantTo?: string[];
}): PublicCourseSummary[] {
  const userTrades = new Set(opts.relevantTo ?? []);
  const scored = COURSES.map((c) => ({
    course: c,
    relevance: c.relevantTrades.filter((t) => userTrades.has(t)).length,
  }));
  // Stable sort: relevance desc, then alphabetical fallback.
  scored.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return a.course.title.localeCompare(b.course.title);
  });
  return scored.map((s) => summarise(s.course));
}

export function getCourseDetail(courseId: string): PublicCourseDetail {
  const c = findCourse(courseId);
  if (!c) throw errors.notFound('Course not found');
  return detail(c);
}

// ─── Enrollment ─────────────────────────────────────────────────────────────

export async function enrollSeeker(
  seekerId: string,
  courseId: string,
): Promise<PublicEnrollment> {
  const c = findCourse(courseId);
  if (!c) throw errors.notFound('Course not found');

  const existing = await EnrollmentModel.findOne({
    seekerId: new Types.ObjectId(seekerId),
    courseId,
  });
  if (existing) return existing.toPublicJSON();

  const created = await EnrollmentModel.create({
    seekerId: new Types.ObjectId(seekerId),
    courseId,
    completedLessonIds: [],
    startedAt: new Date(),
  });
  return created.toPublicJSON();
}

export async function completeLesson(
  seekerId: string,
  courseId: string,
  lessonId: string,
): Promise<PublicEnrollment> {
  const resolved = findLesson(courseId, lessonId);
  if (!resolved) throw errors.notFound('Lesson not found');

  // Auto-enrol on first lesson complete so the seeker doesn't have to
  // tap two buttons. Idempotent thanks to the unique index.
  await enrollSeeker(seekerId, courseId);

  const enrolment = await EnrollmentModel.findOne({
    seekerId: new Types.ObjectId(seekerId),
    courseId,
  });
  if (!enrolment) throw errors.notFound('Enrollment not found');

  if (!enrolment.completedLessonIds.includes(lessonId)) {
    enrolment.completedLessonIds.push(lessonId);
  }

  // All lessons done? Mark the badge as earned.
  const allDone = resolved.course.lessons.every((l) =>
    enrolment.completedLessonIds.includes(l.id),
  );
  if (allDone && !enrolment.completedAt) {
    enrolment.completedAt = new Date();
  }

  await enrolment.save();
  return enrolment.toPublicJSON();
}

export async function listMyEnrollments(
  seekerId: string,
): Promise<PublicEnrollment[]> {
  const docs = await EnrollmentModel.find({
    seekerId: new Types.ObjectId(seekerId),
  }).sort({ updatedAt: -1 });
  return docs.map((d) => d.toPublicJSON());
}

/**
 * List completed course IDs for a seeker — used by employers to render
 * earned-badge pills on the applicant card without pulling the full
 * enrollment list. Returns an empty array if none.
 */
export async function listCompletedCourseIds(
  seekerId: string,
): Promise<string[]> {
  const docs = await EnrollmentModel.find({
    seekerId: new Types.ObjectId(seekerId),
    completedAt: { $ne: null },
  })
    .select('courseId')
    .lean();
  return docs.map((d) => d.courseId);
}

/**
 * Convenience for screens that want to render a seeker's earned-badge
 * pills with the full course summary (emoji + title) without two round
 * trips. Looks the catalogue up locally.
 */
export async function listCompletedCourseSummaries(
  seekerId: string,
): Promise<PublicCourseSummary[]> {
  const ids = await listCompletedCourseIds(seekerId);
  return ids
    .map((id) => findCourse(id))
    .filter((c): c is Course => c !== undefined)
    .map((c) => summarise(c));
}

// Suppress unused-warning for the userModel re-export — kept for future
// "recommend courses based on bio + skills" expansion.
void UserModel;
