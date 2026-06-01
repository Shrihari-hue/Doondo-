/**
 * /employer-response router. Mounted at /api/v1/employer-response.
 *
 *   GET /employer-response — the employer's quiet-hours + auto-reply settings
 *   PUT /employer-response — update them
 *
 * Employer-only. Standard `{ ok, data, requestId }` envelope.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getSettings, setSettings } from './employerResponse.service';

const router = Router();

const putSchema = z.object({
  body: z.object({
    quietHoursEnabled: z.boolean(),
    quietStartHour: z.number().int().min(0).max(23),
    quietEndHour: z.number().int().min(0).max(23),
    autoReply: z.string().max(300),
    smsApplicantAlerts: z.boolean(),
  }),
});

router.get('/', requireAuth, requireRole('employer'), async (req, res, next) => {
  try {
    const data = await getSettings(req.user!.id);
    res.json({ ok: true, data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(putSchema),
  async (req, res, next) => {
    try {
      const body = req.body as {
        quietHoursEnabled: boolean;
        quietStartHour: number;
        quietEndHour: number;
        autoReply: string;
        smsApplicantAlerts: boolean;
      };
      const data = await setSettings(req.user!.id, body);
      res.json({ ok: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
