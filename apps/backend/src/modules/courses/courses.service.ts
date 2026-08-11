/**
 * Courses service — lookup against the static catalogue + enrollment
 * CRUD against the database.
 *
 * The catalogue itself is in code (courses.catalogue.ts) so we can ship
 * curated content quickly without admin tooling. Enrollment progress
 * lives in Postgres so it survives across devices and the worker's
 * badges follow them on their resume.
 */

import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { getDb } from '@/db/client';
import { enrollments } from '@/db/schema';
import { COURSES, findCourse, findLesson, type Course } from './courses.catalogue';

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

export interface PublicEnrollment {
  id: string;
  courseId: string;
  completedLessonIds: string[];
  /** Computed convenience — number of lessons done. */
  completedLessonsCount: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

type EnrollmentRow = typeof enrollments.$inferSelect;

function toPublicEnrollment(row: EnrollmentRow): PublicEnrollment {
  return {
    id: row.id,
    courseId: row.courseId,
    completedLessonIds: row.completedLessonIds,
    completedLessonsCount: row.completedLessonIds.length,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
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

async function findEnrollment(seekerId: string, courseId: string): Promise<EnrollmentRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.seekerId, seekerId), eq(enrollments.courseId, courseId)))
    .limit(1);
  return row;
}

export async function enrollSeeker(
  seekerId: string,
  courseId: string,
): Promise<PublicEnrollment> {
  const c = findCourse(courseId);
  if (!c) throw errors.notFound('Course not found');

  const existing = await findEnrollment(seekerId, courseId);
  if (existing) return toPublicEnrollment(existing);

  const [created] = await getDb()
    .insert(enrollments)
    .values({ seekerId, courseId, completedLessonIds: [], startedAt: new Date() })
    .onConflictDoNothing()
    .returning();
  // Rare race: another request enrolled between the read above and this
  // insert — the unique index rejected ours, so re-read the winner.
  const row = created ?? (await findEnrollment(seekerId, courseId));
  if (!row) throw errors.internal();
  return toPublicEnrollment(row);
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

  const enrolment = await findEnrollment(seekerId, courseId);
  if (!enrolment) throw errors.notFound('Enrollment not found');

  const completedLessonIds = enrolment.completedLessonIds.includes(lessonId)
    ? enrolment.completedLessonIds
    : [...enrolment.completedLessonIds, lessonId];

  // All lessons done? Mark the badge as earned.
  const allDone = resolved.course.lessons.every((l) => completedLessonIds.includes(l.id));
  const completedAt = allDone && !enrolment.completedAt ? new Date() : enrolment.completedAt;

  const [updated] = await getDb()
    .update(enrollments)
    .set({ completedLessonIds, completedAt })
    .where(eq(enrollments.id, enrolment.id))
    .returning();

  // Bump the seeker's course-day streak. Same-day repeat completions
  // are no-ops in the streak service so a worker who finishes 3
  // lessons in a row still counts as one day. Fire-and-forget.
  void (async () => {
    try {
      const { bumpStreak } = await import('@/modules/users/streaks.service');
      await bumpStreak(seekerId, 'course');
    } catch {
      /* non-fatal */
    }
  })();

  return toPublicEnrollment(updated!);
}

export async function listMyEnrollments(
  seekerId: string,
): Promise<PublicEnrollment[]> {
  const rows = await getDb()
    .select()
    .from(enrollments)
    .where(eq(enrollments.seekerId, seekerId))
    .orderBy(desc(enrollments.updatedAt));
  return rows.map(toPublicEnrollment);
}

/**
 * List completed course IDs for a seeker — used by employers to render
 * earned-badge pills on the applicant card without pulling the full
 * enrollment list. Returns an empty array if none.
 */
export async function listCompletedCourseIds(
  seekerId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(and(eq(enrollments.seekerId, seekerId), isNotNull(enrollments.completedAt)));
  return rows.map((r) => r.courseId);
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
