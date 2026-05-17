/**
 * /me router. Mounted at /api/v1/me.
 *
 * The seeker's GET /me lives in the auth router (auth.routes.ts → /auth/me)
 * since it returns identity. This router is for mutations on the
 * authenticated user's own record.
 */

import { Router } from 'express';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './me.controller';
import walletRouter from '@/modules/wallet/wallet.routes';
import alertsRouter from '@/modules/alerts/alert.routes';
import { seekerAvailabilityRouter } from '@/modules/availabilities/availability.routes';
import { seekerEnrollmentsRouter } from '@/modules/courses/courses.routes';
import * as referralController from '@/modules/referrals/referral.controller';
import * as profileViewService from './profileView.service';
import * as skillSuggestionsService from './skillSuggestions.service';
import * as findFriendsService from './findFriends.service';
import {
  pushTokenSchema,
  updateEmployerLocationSchema,
  updateLocationSchema,
  updateProfileSchema,
  updateWorkHistorySchema,
  uploadResumeSchema,
} from './me.schemas';

const router = Router();

// Earnings ledger — lives under /me because that's where seeker-facing
// account data sits. Sub-router stays small + isolated from /me's own
// profile mutations.
router.use('/', walletRouter);

// Job alerts — seeker-only saved search criteria. Mounted as a sub-router
// so the URLs are /api/v1/me/alerts and /api/v1/me/alerts/:id.
router.use('/', alertsRouter);

// Availability beacon — seeker-only "I'm available right now" flag.
// URLs land at /api/v1/me/availability.
router.use('/', seekerAvailabilityRouter);

// Course enrollments — /api/v1/me/enrollments.
router.use('/', seekerEnrollmentsRouter);

// Referral history + summary — drives the Profile "Referral credit" row.
router.get('/referrals', requireAuth, referralController.listMyReferrals);

// Advance / microloan stub — see modules/advances for the lifecycle.
// Mounted at /me so all seeker-financial endpoints share the prefix.
import advancesRouter from '@/modules/advances/advance.routes';
router.use('/', advancesRouter);

// Accident insurance opt-in.
import insuranceRouter from '@/modules/insurance/insurance.routes';
router.use('/', insuranceRouter);

// Find Friends — body { phoneHashes: string[] } → matched users.
router.post('/find-friends', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { phoneHashes?: unknown };
    const hashes = Array.isArray(body.phoneHashes)
      ? body.phoneHashes.filter((h): h is string => typeof h === 'string' && /^[a-f0-9]{64}$/i.test(h))
      : [];
    const friends = await findFriendsService.findByHashes(req.user!.id, hashes);
    res.json({ friends });
  } catch (err) {
    next(err);
  }
});

// Skill suggestions — "add cooking → +30% job matches" rail on Profile.
router.get(
  '/skill-suggestions',
  requireAuth,
  requireRole('seeker'),
  async (req, res, next) => {
    try {
      const suggestions = await skillSuggestionsService.suggestForSeeker(req.user!.id);
      res.json({ suggestions });
    } catch (err) {
      next(err);
    }
  },
);

// Profile views — "N employers viewed your profile this week" widget.
// Seeker-only; reads aggregated counts only, never viewer identities.
router.get(
  '/profile-views',
  requireAuth,
  requireRole('seeker'),
  async (req, res, next) => {
    try {
      const summary = await profileViewService.summarize(req.user!.id);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/profile',
  requireAuth,
  validate(updateProfileSchema),
  controller.updateProfile,
);
router.post(
  '/location',
  requireAuth,
  validate(updateLocationSchema),
  controller.updateLocation,
);
router.post(
  '/employer-location',
  requireAuth,
  requireRole('employer'),
  validate(updateEmployerLocationSchema),
  controller.updateEmployerLocation,
);
router.post(
  '/push-token',
  requireAuth,
  validate(pushTokenSchema),
  controller.registerPushToken,
);
router.delete(
  '/push-token',
  requireAuth,
  validate(pushTokenSchema),
  controller.clearPushToken,
);

// Resume — seeker-only because employers don't have a resume of their own.
// Replace by re-POSTing; remove via DELETE.
router.post(
  '/resume',
  requireAuth,
  requireRole('seeker'),
  validate(uploadResumeSchema),
  controller.uploadResume,
);
router.delete('/resume', requireAuth, requireRole('seeker'), controller.removeResume);

// Resume Builder — replace the seeker's work history with the supplied list.
// PUT semantics: array on the wire is the array stored. Empty array clears.
router.put(
  '/work-history',
  requireAuth,
  requireRole('seeker'),
  validate(updateWorkHistorySchema),
  controller.updateWorkHistory,
);

export default router;
