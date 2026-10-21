/**
 * /women-safety router. Mounted at /api/v1/women-safety.
 *
 *   GET   /women-safety/privacy                — my privacy settings (seeker)
 *   PATCH /women-safety/privacy                — { maskLocation?, womenMode? }
 *   GET   /women-safety/pending                — workplaces to confirm (seeker)
 *   POST  /women-safety/reports                — { applicationId, safe, confirmed[] }
 *   GET   /women-safety/employers/:employerId  — peer-confirmed summary (any signed-in user)
 */
import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { WOMEN_SAFETY_SIGNALS } from '@/modules/jobs/womenSafety';
import { employerSummary, getPrivacy, listPending, setPrivacy, submitReport } from './womenSafety.service';

const router = Router();
const objectId = z.string().refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

router.get('/privacy', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    res.json({ ok: true, data: { privacy: await getPrivacy(req.user!.id) }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/privacy',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ body: z.object({ maskLocation: z.boolean().optional(), womenMode: z.boolean().optional() }) })),
  async (req, res, next) => {
    try {
      res.json({ ok: true, data: { privacy: await setPrivacy(req.user!.id, req.body) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/pending', requireAuth, requireRole('seeker'), async (req, res, next) => {
  try {
    res.json({ ok: true, data: { questions: await listPending(req.user!.id) }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/reports',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        applicationId: objectId,
        safe: z.boolean(),
        confirmed: z.array(z.enum(WOMEN_SAFETY_SIGNALS)).max(WOMEN_SAFETY_SIGNALS.length),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      await submitReport(req.user!.id, req.body);
      res.json({ ok: true, data: { saved: true }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/employers/:employerId',
  requireAuth,
  validate(z.object({ params: z.object({ employerId: objectId }) })),
  async (req, res, next) => {
    try {
      res.json({ ok: true, data: { summary: await employerSummary(req.params.employerId!) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
