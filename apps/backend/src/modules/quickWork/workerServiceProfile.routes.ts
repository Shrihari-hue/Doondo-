/**
 * Worker Service Profile router — mounted at /me/quick-work-services from v1.ts.
 * seeker-plan.md §29.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './workerServiceProfile.controller';

const setMineSchema = z.object({
  body: z.object({ serviceIds: z.array(z.string().uuid()).max(50) }).strict(),
});

const router = Router();
router.get('/', requireAuth, requireRole('seeker'), controller.listMine);
router.post('/', requireAuth, requireRole('seeker'), validate(setMineSchema), controller.setMine);

export default router;
