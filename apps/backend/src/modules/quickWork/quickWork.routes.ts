/**
 * Quick Work router — mounted at /quick-work from v1.ts.
 *
 *   POST   /quick-work/requests            employer creates a DRAFT
 *   PATCH  /quick-work/requests/:id        employer fills in the draft progressively
 *   GET    /quick-work/requests/mine       employer's (or ?role=worker's) own requests
 *   GET    /quick-work/requests/:id        detail — employer or matched worker only
 *   POST   /quick-work/requests/:id/post   DRAFT -> POSTED
 *   POST   /quick-work/requests/:id/cancel status-aware cancellation (either party)
 *
 * Matching/offers/arrival/execution endpoints are added in later phases
 * (quickWorkMatching.routes.ts, mounted separately) per employer-plan.md §30.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './quickWork.controller';
import * as offersController from './quickWorkOffers.controller';
import {
  arrivingSchema,
  cancelSchema,
  completeSchema,
  createDraftSchema,
  disputeSchema,
  listMineSchema,
  removeMediaSchema,
  reportNoShowSchema,
  requestIdParamSchema,
  updateDraftSchema,
  uploadMediaSchema,
} from './quickWork.schemas';

const router = Router();

router.post('/requests', requireAuth, requireRole('employer'), validate(createDraftSchema), controller.createDraft);
router.patch('/requests/:id', requireAuth, requireRole('employer'), validate(updateDraftSchema), controller.updateDraft);
router.get('/requests/mine', requireAuth, validate(listMineSchema), controller.listMine);
router.get('/requests/:id', requireAuth, validate(requestIdParamSchema), controller.getById);
router.post('/requests/:id/post', requireAuth, requireRole('employer'), validate(requestIdParamSchema), controller.post);
router.post('/requests/:id/cancel', requireAuth, validate(cancelSchema), controller.cancel);
router.post(
  '/requests/:id/retry-matching',
  requireAuth,
  requireRole('employer'),
  validate(requestIdParamSchema),
  offersController.retryMatching,
);

// Worker-side offer inbox — employer-plan.md §12, seeker-plan.md §29.
router.get('/offers/incoming', requireAuth, requireRole('seeker'), offersController.listIncoming);
router.post('/offers/:id/accept', requireAuth, requireRole('seeker'), validate(requestIdParamSchema), offersController.accept);
router.post('/offers/:id/decline', requireAuth, requireRole('seeker'), validate(requestIdParamSchema), offersController.decline);

// Worker execution flow — employer-plan.md §14-16, seeker-plan.md §13-18.
router.post('/requests/:id/arriving', requireAuth, requireRole('seeker'), validate(arrivingSchema), controller.arriving);
router.post('/requests/:id/arrived', requireAuth, requireRole('seeker'), validate(requestIdParamSchema), controller.arrived);
router.post('/requests/:id/start', requireAuth, requireRole('seeker'), validate(requestIdParamSchema), controller.start);
router.post('/requests/:id/complete', requireAuth, requireRole('seeker'), validate(completeSchema), controller.complete);

// Dispute — either party, employer-plan.md §21.
router.post('/requests/:id/dispute', requireAuth, validate(disputeSchema), controller.dispute);

// Price approval — employer only, gate before payment/intent creation.
router.post(
  '/requests/:id/approve-price',
  requireAuth,
  requireRole('employer'),
  validate(requestIdParamSchema),
  controller.approvePrice,
);

// No-show — worker reports the customer as unavailable on site.
router.post(
  '/requests/:id/report-no-show',
  requireAuth,
  requireRole('seeker'),
  validate(reportNoShowSchema),
  controller.reportNoShow,
);

// Media — employer only, draft only.
router.post('/requests/:id/media', requireAuth, requireRole('employer'), validate(uploadMediaSchema), controller.uploadMedia);
router.delete('/requests/:id/media', requireAuth, requireRole('employer'), validate(removeMediaSchema), controller.removeMedia);

export default router;
