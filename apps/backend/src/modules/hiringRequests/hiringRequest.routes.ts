/**
 * HiringRequest router — mounted at /hiring-requests from v1.ts.
 *
 *   POST   /hiring-requests            employer sends an invite
 *   GET    /hiring-requests/received   worker's inbox
 *   GET    /hiring-requests/sent       employer's sent list
 *   POST   /hiring-requests/:id/accept    worker accepts
 *   POST   /hiring-requests/:id/decline   worker declines
 *   POST   /hiring-requests/:id/withdraw  employer cancels a pending one
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './hiringRequest.controller';
import {
  hiringRequestIdParamSchema,
  listReceivedHiringRequestsSchema,
  sendHiringRequestSchema,
} from './hiringRequest.schemas';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole('employer'),
  validate(sendHiringRequestSchema),
  controller.send,
);

router.get(
  '/received',
  requireAuth,
  requireRole('seeker'),
  validate(listReceivedHiringRequestsSchema),
  controller.listReceived,
);

router.get(
  '/sent',
  requireAuth,
  requireRole('employer'),
  controller.listSent,
);

router.post(
  '/:id/accept',
  requireAuth,
  requireRole('seeker'),
  validate(hiringRequestIdParamSchema),
  controller.accept,
);

router.post(
  '/:id/decline',
  requireAuth,
  requireRole('seeker'),
  validate(hiringRequestIdParamSchema),
  controller.decline,
);

router.post(
  '/:id/withdraw',
  requireAuth,
  requireRole('employer'),
  validate(hiringRequestIdParamSchema),
  controller.withdraw,
);

export default router;
