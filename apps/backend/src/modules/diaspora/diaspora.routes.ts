/**
 * /diaspora router. Mounted at /api/v1/diaspora. Employer-only.
 *   GET   /diaspora — my settings
 *   PUT   /diaspora — { enabled?, country?, timezone?, localContact? }
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { getSettings, saveSettings } from './diaspora.service';

const router = Router();
router.use(requireAuth, requireRole('employer'));
router.get('/', async (req, res, next) => {
  try {
    res.json({ ok: true, data: { settings: await getSettings(req.user!.id) }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
router.put(
  '/',
  validate(
    z.object({
      body: z.object({
        enabled: z.boolean().optional(),
        country: z.string().max(60).nullish(),
        timezone: z.string().max(60).nullish(),
        localContact: z
          .object({ name: z.string().max(80).nullish(), phone: z.string().regex(/^\+?[0-9 ]{8,16}$/).nullish(), relation: z.string().max(40).nullish() })
          .nullish(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      res.json({ ok: true, data: { settings: await saveSettings(req.user!.id, req.body) }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
export default router;
