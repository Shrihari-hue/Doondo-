/**
 * /cohorts router. Mounted at /api/v1/cohorts. Seeker-only.
 *
 *   GET  /cohorts                  — my groups (with members' progress)
 *   POST /cohorts                  — { courseId, name? } create
 *   POST /cohorts/join             — { code } join by code
 *   GET  /cohorts/:id              — one group
 *   POST /cohorts/:id/leave
 *   GET  /cohorts/:id/messages
 *   POST /cohorts/:id/messages     — { text }
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as svc from './cohort.service';

const router = Router();
router.use(requireAuth, requireRole('seeker'));
const id = z.object({ params: z.object({ id: z.string().min(1) }) });
const wrap = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any, next: any) => {
  try {
    res.json({ ok: true, data: await fn(req), requestId: req.id });
  } catch (err) {
    next(err);
  }
};

router.get('/', wrap(async (req) => ({ cohorts: await svc.listMine(req.user.id) })));
router.post('/', validate(z.object({ body: z.object({ courseId: z.string().min(1).max(80), name: z.string().max(60).optional() }) })),
  wrap(async (req) => ({ cohort: await svc.createCohort(req.user.id, req.body.courseId, req.body.name) })));
router.post('/join', validate(z.object({ body: z.object({ code: z.string().min(4).max(12) }) })),
  wrap(async (req) => ({ cohort: await svc.joinByCode(req.user.id, req.body.code) })));
router.get('/:id', validate(id), wrap(async (req) => ({ cohort: await svc.getCohort(req.user.id, req.params.id) })));
router.post('/:id/leave', validate(id), wrap(async (req) => { await svc.leave(req.user.id, req.params.id); return { left: true }; }));
router.get('/:id/messages', validate(id), wrap(async (req) => ({ messages: await svc.listMessages(req.user.id, req.params.id) })));
router.post('/:id/messages', validate(id.extend({ body: z.object({ text: z.string().trim().min(1).max(1000) }) })),
  wrap(async (req) => ({ message: await svc.postMessage(req.user.id, req.params.id, req.body.text) })));

export default router;
