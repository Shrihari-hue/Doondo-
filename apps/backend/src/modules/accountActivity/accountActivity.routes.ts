/**
 * Account-activity router — mounted at /accounts from v1.ts.
 *
 *   POST /accounts/activity   cross-account activity summary for the
 *                             switcher badges (see accountActivity.service)
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './accountActivity.controller';
import { accountActivitySchema } from './accountActivity.schemas';

const router = Router();

router.post(
  '/activity',
  requireAuth,
  validate(accountActivitySchema),
  controller.summary,
);

export default router;
