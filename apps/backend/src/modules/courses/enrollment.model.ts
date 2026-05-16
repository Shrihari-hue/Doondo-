/**
 * Enrollment — a single seeker's progress through one course.
 *
 * One row per (seekerId, courseId). The course catalogue is static
 * (typed up in courses.catalogue.ts), but THIS lives in the database
 * so we can track which lessons each user has completed and when they
 * earned the badge.
 *
 * A worker who completes EVERY lesson in a course gets `completedAt`
 * set — at that point the course-completion badge surfaces on their
 * resume preview and the employer-side applicant detail card.
 */

import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface Enrollment {
  seekerId: Schema.Types.ObjectId;
  /** Stable course slug (matches Course.id from the catalogue). */
  courseId: string;
  /** Lesson ids the user has completed. Order doesn't matter; presence does. */
  completedLessonIds: string[];
  startedAt: Date;
  /** Set when all lessons are done. Null otherwise. */
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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

interface EnrollmentMethods {
  toPublicJSON(): PublicEnrollment;
}

export type EnrollmentDocument = HydratedDocument<Enrollment, EnrollmentMethods>;
type EnrollmentModelType = Model<Enrollment, Record<string, never>, EnrollmentMethods>;

const enrollmentSchema = new Schema<Enrollment, EnrollmentModelType, EnrollmentMethods>(
  {
    seekerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: { type: String, required: true, trim: true, maxlength: 80 },
    completedLessonIds: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One enrollment per (seeker, course).
enrollmentSchema.index({ seekerId: 1, courseId: 1 }, { unique: true });
// Newest-first list of a seeker's enrollments — drives the "In progress"
// section on their training screen.
enrollmentSchema.index({ seekerId: 1, updatedAt: -1 });

enrollmentSchema.method('toPublicJSON', function (
  this: EnrollmentDocument,
): PublicEnrollment {
  return {
    id: this._id.toString(),
    courseId: this.courseId,
    completedLessonIds: this.completedLessonIds ?? [],
    completedLessonsCount: (this.completedLessonIds ?? []).length,
    startedAt: this.startedAt.toISOString(),
    completedAt: this.completedAt ? this.completedAt.toISOString() : null,
    createdAt: this.createdAt.toISOString(),
  };
});

export const EnrollmentModel = model<Enrollment, EnrollmentModelType>(
  'Enrollment',
  enrollmentSchema,
);
