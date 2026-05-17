/**
 * Wallet routes.
 *   GET /api/v1/me/earnings  → ledger + summary
 */

import { Router } from 'express';
import { requireAuth } from '@/middleware/auth';
import * as controller from './wallet.controller';

const router = Router();

router.get('/earnings', requireAuth, controller.listMyEarnings);
// Cash income diary — self-reported earnings outside Doondo.
router.post('/earnings/cash', requireAuth, controller.logCashEarning);
router.delete('/earnings/cash/:id', requireAuth, controller.deleteCashEarning);

export default router;
