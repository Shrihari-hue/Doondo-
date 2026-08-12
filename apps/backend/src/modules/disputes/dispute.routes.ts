/**
 * /disputes router. Mounted at /api/v1/disputes.
 *
 * Two-sided — both employers and workers use it, so it's gated by
 * requireAuth (not a single role); the caller's role decides which side
 * of the dispute they are.
 *
 *   POST /disputes              — raise a dispute on a hire
 *   GET  /disputes              — list my disputes (?status, ?applicationId)
 *   GET  /disputes/:id          — one dispute (must be a party)
 *   POST /disputes/:id/respond  — add a reply
 *   POST /disputes/:id/resolve  — close it (resolved | dismissed)
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { disputeCategoryEnum, disputeStatusEnum } from '@/db/schema';
import {
  raiseDispute,
  listDisputes,
  getDispute,
  respondToDispute,
  resolveDispute,
  type PartyRole,
} from './dispute.service';

const DISPUTE_CATEGORIES = disputeCategoryEnum.enumValues;
const DISPUTE_STATUSES = disputeStatusEnum.enumValues;

const router = Router();

const objectId = z.string().uuid('Invalid id');
const MAX_PHOTO_CHARS = 600_000;

/** Disputes only make sense for the two hiring roles. */
function partyRole(role: string | undefined): PartyRole {
  if (role === 'employer' || role === 'seeker') return role;
  // Surfaces as a 403 — an account with no hiring role can't be a party.
  throw Object.assign(new Error('Only employers and workers can use disputes'), { status: 403 });
}

router.post(
  '/',
  requireAuth,
  validate(
    z.object({
      body: z.object({
        applicationId: objectId,
        category: z.enum(DISPUTE_CATEGORIES),
        description: z.string().trim().min(1).max(1000),
        photoDataUrls: z.array(z.string().max(MAX_PHOTO_CHARS)).max(3).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as {
        applicationId: string;
        category: (typeof DISPUTE_CATEGORIES)[number];
        description: string;
        photoDataUrls?: string[];
      };
      const dispute = await raiseDispute({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        applicationId: body.applicationId,
        category: body.category,
        description: body.description,
        photoDataUrls: body.photoDataUrls,
      });
      res.status(201).json({ ok: true, data: { dispute }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requireAuth,
  validate(
    z.object({
      query: z.object({
        status: z.enum(DISPUTE_STATUSES).optional(),
        applicationId: objectId.optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const q = req.query as { status?: (typeof DISPUTE_STATUSES)[number]; applicationId?: string };
      const disputes = await listDisputes({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        status: q.status,
        applicationId: q.applicationId,
      });
      res.json({ ok: true, data: { disputes }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  requireAuth,
  validate(z.object({ params: z.object({ id: objectId }) })),
  async (req, res, next) => {
    try {
      const dispute = await getDispute({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        id: req.params.id!,
      });
      res.json({ ok: true, data: { dispute }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/respond',
  requireAuth,
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({ text: z.string().trim().min(1).max(1000) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const dispute = await respondToDispute({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        id: req.params.id!,
        text: (req.body as { text: string }).text,
      });
      res.json({ ok: true, data: { dispute }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/resolve',
  requireAuth,
  validate(
    z.object({
      params: z.object({ id: objectId }),
      body: z.object({
        outcome: z.enum(['resolved', 'dismissed']),
        note: z.string().trim().max(1000).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const body = req.body as { outcome: 'resolved' | 'dismissed'; note?: string };
      const dispute = await resolveDispute({
        userId: req.user!.id,
        role: partyRole(req.user!.role),
        id: req.params.id!,
        outcome: body.outcome,
        note: body.note,
      });
      res.json({ ok: true, data: { dispute }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
