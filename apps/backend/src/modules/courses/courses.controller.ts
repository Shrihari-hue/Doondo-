/**
 * Courses HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { errors, AppError } from '@/lib/errors';
import { UserModel } from '@/modules/users/user.model';
import * as service from './courses.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // If the caller is authenticated as a seeker, sort by relevance to
    // their declared skills. Anonymous browsers get a stable
    // alphabetical order.
    let relevantTo: string[] | undefined;
    if (req.user?.id) {
      const user = await UserModel.findById(req.user.id)
        .select('skills role')
        .lean();
      if (user && user.role === 'seeker') {
        relevantTo = user.skills ?? [];
      }
    }
    const courses = service.listCourses({ relevantTo });
    ok(req, res, 200, { courses });
  } catch (err) {
    next(err);
  }
}

export async function detail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const course = service.getCourseDetail(req.params.id!);
    ok(req, res, 200, { course });
  } catch (err) {
    next(err);
  }
}

export async function enroll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const enrollment = await service.enrollSeeker(req.user.id, req.params.id!);
    ok(req, res, 201, { enrollment });
  } catch (err) {
    next(err);
  }
}

export async function completeLesson(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const enrollment = await service.completeLesson(
      req.user.id,
      req.params.id!,
      req.params.lessonId!,
    );
    ok(req, res, 200, { enrollment });
  } catch (err) {
    next(err);
  }
}

export async function listMyEnrollments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const enrollments = await service.listMyEnrollments(req.user.id);
    ok(req, res, 200, { enrollments });
  } catch (err) {
    next(err);
  }
}

/**
 * Public-ish helper: return the badge summaries for any seeker. Useful
 * for the employer's applicant detail screen which already has the
 * seekerId and just wants the badges to render.
 */
export async function listSeekerBadges(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const id = req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new AppError({
        code: 'VALIDATION_FAILED',
        message: 'Invalid id',
        status: 400,
      });
    }
    const badges = await service.listCompletedCourseSummaries(id);
    ok(req, res, 200, { badges });
  } catch (err) {
    next(err);
  }
}
