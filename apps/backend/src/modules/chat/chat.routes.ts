/**
 * Chat router. Mounted at /api/v1/conversations.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './chat.controller';
import {
  conversationIdParamsSchema,
  ensureConversationFromAppSchema,
  listMessagesSchema,
  retranslateSchema,
  sendMessageSchema,
} from './chat.schemas';

const router = Router();

const bulkMessageSchema = z.object({
  body: z.object({
    jobId: z.string().min(1),
    stage: z.enum(['shortlisted', 'active']).optional(),
    message: z.string().trim().min(1).max(2000),
  }),
});

router.get('/', requireAuth, controller.listMine);
router.post(
  '/bulk',
  requireAuth,
  requireRole('employer'),
  validate(bulkMessageSchema),
  controller.bulkMessage,
);
router.post(
  '/from-application',
  requireAuth,
  validate(ensureConversationFromAppSchema),
  controller.ensureFromApplication,
);
router.get(
  '/:id',
  requireAuth,
  validate(conversationIdParamsSchema),
  controller.detail,
);
router.get(
  '/:id/messages',
  requireAuth,
  validate(listMessagesSchema),
  controller.listMessages,
);
router.post(
  '/:id/messages',
  requireAuth,
  validate(sendMessageSchema),
  controller.sendMessage,
);
router.post(
  '/:id/read',
  requireAuth,
  validate(conversationIdParamsSchema),
  controller.markRead,
);
router.post(
  '/:id/messages/:messageId/retranslate',
  requireAuth,
  validate(retranslateSchema),
  controller.retranslate,
);

export default router;
