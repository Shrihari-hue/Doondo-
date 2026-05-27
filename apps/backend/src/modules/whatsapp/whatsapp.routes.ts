/**
 * /whatsapp router. Mounted at /api/v1/whatsapp.
 *
 *   POST /webhook    — Twilio inbound (PUBLIC; signature-validated)
 *   POST /status     — Twilio delivery status (PUBLIC; signature-validated)
 *   POST /send-text  — admin send (auth + admin role)
 *   POST /send-template — admin send (auth + admin role)
 *   GET  /inbox      — admin list  (auth + admin role)
 *
 * Note: Express's default body parser is JSON. Twilio posts
 * application/x-www-form-urlencoded, and the urlencoded parser is
 * registered globally in app.ts, so req.body comes in as a flat
 * Record<string,string> on the webhook paths — exactly what we need
 * for both signature validation and field extraction.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './whatsapp.controller';
import {
  listMessagesSchema,
  sendTemplateSchema,
  sendTextSchema,
} from './whatsapp.schemas';

const router = Router();

// Public, signature-protected webhooks.
router.post('/webhook', controller.inboundWebhook);
router.post('/status', controller.statusCallback);

// Admin send + inbox.
router.post(
  '/send-template',
  requireAuth,
  requireRole('admin'),
  validate(sendTemplateSchema),
  controller.sendTemplate,
);

router.post(
  '/send-text',
  requireAuth,
  requireRole('admin'),
  validate(sendTextSchema),
  controller.sendText,
);

router.get(
  '/inbox',
  requireAuth,
  requireRole('admin'),
  validate(listMessagesSchema),
  controller.listMessages,
);

export default router;
