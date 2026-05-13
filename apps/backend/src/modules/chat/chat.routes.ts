/**
 * Chat router. Mounted at /api/v1/conversations.
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './chat.controller';
import {
  conversationIdParamsSchema,
  ensureConversationFromAppSchema,
  listMessagesSchema,
  sendMessageSchema,
} from './chat.schemas';

const router = Router();

router.get('/', requireAuth, controller.listMine);
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

export default router;
