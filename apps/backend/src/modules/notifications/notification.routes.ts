/**
 * Notifications routes — all authenticated.
 *
 * GET   /api/v1/notifications              feed
 * GET   /api/v1/notifications/unread-count badge count
 * POST  /api/v1/notifications/read-all     mark all read
 * POST  /api/v1/notifications/:id/read     mark one read
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './notification.controller';

const router = Router();

const listQuery = z.object({
  query: z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      before: z.string().optional(),
    })
    .default({}),
});

const idParam = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id'),
  }),
});

router.get('/', requireAuth, validate(listQuery), controller.list);
router.get('/unread-count', requireAuth, controller.unreadCount);
router.post('/read-all', requireAuth, controller.markAllRead);
router.post('/:id/read', requireAuth, validate(idParam), controller.markRead);

export default router;
