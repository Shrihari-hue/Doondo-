/**
 * Courses API — read the curated catalogue + track this seeker's
 * progress against it.
 *
 * The catalogue lives in code on the backend (`courses.catalogue.ts`),
 * so list/detail responses change only when the backend is redeployed.
 * Enrollments and lesson-completion state are stored in MongoDB and
 * survive across devices.
 */

import { apiRequest } from './client';

export interface PublicCourseSummary {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  tint: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  totalDurationMinutes: number;
  lessonCount: number;
  relevantTrades: string[];
}

export interface PublicCourseLesson {
  id: string;
  title: string;
  body: string;
  durationMinutes: number;
}

export interface PublicCourseDetail extends PublicCourseSummary {
  description: string;
  lessons: PublicCourseLesson[];
}

export interface PublicEnrollment {
  id: string;
  courseId: string;
  completedLessonIds: string[];
  completedLessonsCount: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export const coursesApi = {
  list: () =>
    apiRequest<{ courses: PublicCourseSummary[] }>('/courses'),

  detail: (id: string) =>
    apiRequest<{ course: PublicCourseDetail }>(`/courses/${id}`),

  enroll: (id: string) =>
    apiRequest<{ enrollment: PublicEnrollment }>(`/courses/${id}/enroll`, {
      method: 'POST',
    }),

  completeLesson: (courseId: string, lessonId: string) =>
    apiRequest<{ enrollment: PublicEnrollment }>(
      `/courses/${courseId}/lessons/${lessonId}/complete`,
      { method: 'POST' },
    ),

  myEnrollments: () =>
    apiRequest<{ enrollments: PublicEnrollment[] }>('/me/enrollments'),

  /** Earned-badge summaries for any seeker — feeds the employer card. */
  seekerBadges: (seekerId: string) =>
    apiRequest<{ badges: PublicCourseSummary[] }>(
      `/seekers/${seekerId}/badges`,
    ),
};
