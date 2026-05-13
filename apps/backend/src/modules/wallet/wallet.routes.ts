/**
 * Wallet routes.
 *   GET /api/v1/me/earnings  → ledger + summary
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import * as controller from './wallet.controller';

const router = Router();

router.get('/earnings', requireAuth, controller.listMyEarnings);

export default router;
