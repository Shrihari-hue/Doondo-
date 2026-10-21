/**
 * /workforce router. Mounted at /api/v1/workforce. Employer-only.
 *
 *   GET    /workforce                         — per-worker summaries for all active hires
 *   GET    /workforce/:applicationId          — full detail for one hire
 *   POST   /workforce/:applicationId/leave    — mark a day as leave { date?, reason? }
 *   DELETE /workforce/:applicationId/leave/:date — undo a leave day
 *   POST   /workforce/:applicationId/end      — end employment { reason? }
 */

import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import {
  listTasks, createTask, updateTask, deleteTask, listMyTasks,
  getReview, listReviews, saveReview,
} from './workforceExtras.service';
import { TASK_PRIORITIES, TASK_STATUSES } from './workerTask.model';
import {
  listSummaries,
  getWorkerDetail,
  markLeave,
  cancelLeave,
  endEmployment,
} from './workforce.service';

const router = Router();

const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const daysQuery = z.coerce.number().int().min(7).max(120).optional();

// ── Worker (seeker) side: tasks assigned to me ───────────────────────────
router.get('/my-tasks', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    const tasks = await listMyTasks(req.user!.id);
    res.json({ ok: true, data: { tasks }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/my-tasks/:taskId',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ taskId: objectId }), body: z.object({ status: z.enum(TASK_STATUSES) }) })),
  async (req, res, next) => {
    try {
      const task = await updateTask(req.user!.id, 'seeker', req.params.taskId!, { status: req.body.status });
      res.json({ ok: true, data: { task }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ── Employer side ─────────────────────────────────────────────────────────
router.use(requireAuth, requireRole('employer'));

const taskBody = z.object({
  title: z.string().trim().min(1).max(140),
  location: z.string().max(140).nullish(),
  dueDate: day.nullish(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

router.get('/:applicationId/tasks', validate(z.object({ params: z.object({ applicationId: objectId }) })), async (req, res, next) => {
  try {
    const tasks = await listTasks(req.user!.id, req.params.applicationId!);
    res.json({ ok: true, data: { tasks }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:applicationId/tasks',
  validate(z.object({ params: z.object({ applicationId: objectId }), body: taskBody })),
  async (req, res, next) => {
    try {
      const task = await createTask(req.user!.id, req.params.applicationId!, req.body);
      res.json({ ok: true, data: { task }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/tasks/:taskId',
  validate(
    z.object({
      params: z.object({ taskId: objectId }),
      body: taskBody.partial().extend({ status: z.enum(TASK_STATUSES).optional() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const task = await updateTask(req.user!.id, 'employer', req.params.taskId!, req.body);
      res.json({ ok: true, data: { task }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/tasks/:taskId', validate(z.object({ params: z.object({ taskId: objectId }) })), async (req, res, next) => {
  try {
    await deleteTask(req.user!.id, req.params.taskId!);
    res.json({ ok: true, data: { removed: true }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

const month = z.string().regex(/^\d{4}-\d{2}$/);

router.get(
  '/:applicationId/reviews',
  validate(z.object({ params: z.object({ applicationId: objectId }), query: z.object({ month: month.optional() }) })),
  async (req, res, next) => {
    try {
      const m = typeof req.query.month === 'string' ? req.query.month : undefined;
      if (m) {
        const review = await getReview(req.user!.id, req.params.applicationId!, m);
        res.json({ ok: true, data: { review }, requestId: req.id });
        return;
      }
      const reviews = await listReviews(req.user!.id, req.params.applicationId!);
      res.json({ ok: true, data: { reviews }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

const stars = z.number().int().min(0).max(5);
router.put(
  '/:applicationId/reviews',
  validate(
    z.object({
      params: z.object({ applicationId: objectId }),
      body: z.object({ month, punctuality: stars, quality: stars, attitude: stars, notes: z.string().max(2000).optional() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const review = await saveReview(req.user!.id, req.params.applicationId!, req.body);
      res.json({ ok: true, data: { review }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', validate(z.object({ query: z.object({ days: daysQuery }) })), async (req, res, next) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const workers = await listSummaries(req.user!.id, days);
    res.json({ ok: true, data: { workers }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/:applicationId',
  validate(
    z.object({
      params: z.object({ applicationId: objectId }),
      query: z.object({ days: daysQuery, month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const days = req.query.days ? Number(req.query.days) : undefined;
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const worker = await getWorkerDetail(req.user!.id, req.params.applicationId!, { days, month });
      res.json({ ok: true, data: { worker }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:applicationId/leave',
  validate(
    z.object({
      params: z.object({ applicationId: objectId }),
      body: z.object({ date: day.optional(), reason: z.string().max(200).nullish() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const leave = await markLeave(req.user!.id, req.params.applicationId!, req.body);
      res.json({ ok: true, data: { leave }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:applicationId/leave/:date',
  validate(z.object({ params: z.object({ applicationId: objectId, date: day }) })),
  async (req, res, next) => {
    try {
      await cancelLeave(req.user!.id, req.params.applicationId!, req.params.date!);
      res.json({ ok: true, data: { removed: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:applicationId/end',
  validate(
    z.object({
      params: z.object({ applicationId: objectId }),
      body: z.object({ reason: z.string().max(300).nullish() }),
    }),
  ),
  async (req, res, next) => {
    try {
      const result = await endEmployment(req.user!.id, req.params.applicationId!, req.body?.reason);
      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
