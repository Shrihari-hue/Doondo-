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
import advancesRouter from '@/modules/advances/advance.routes';
import insuranceRouter from '@/modules/insurance/insurance.routes';
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

// "Hired near you today" — anonymised social-proof feed for the Home
// rail. Returns the last 5 hires within ~10 km of the caller's saved
// home location.
router.get('/hired-nearby', requireAuth, async (req, res, next) => {
  try {
    const { listNearbyHires } = await import(
      '@/modules/applications/hiredNearby.service'
    );
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === 'string' && /^\d+$/.test(limitRaw)
        ? Math.min(20, Math.max(1, parseInt(limitRaw, 10)))
        : 5;
    const entries = await listNearbyHires({
      callerId: req.user!.id,
      limit,
    });
    res.json({ ok: true, data: { entries }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

// Advance / microloan stub — see modules/advances for the lifecycle.
// Mounted at /me so all seeker-financial endpoints share the prefix.
router.use('/', advancesRouter);

// Accident insurance opt-in.
router.use('/', insuranceRouter);

// Per-type push notification preferences.
router.get('/notification-prefs', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('@/modules/users/user.model');
    const u = await UserModel.findById(req.user!.id).select('notificationPrefs').lean();
    const prefs =
      (u as { notificationPrefs?: Record<string, boolean> } | null)?.notificationPrefs ?? {};
    res.json({
      prefs: {
        jobs: prefs.jobs ?? true,
        applications: prefs.applications ?? true,
        messages: prefs.messages ?? true,
        ratings: prefs.ratings ?? true,
        referrals: prefs.referrals ?? true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Trust Circle (Safety) ───────────────────────────────────────────────
// Up to 3 emergency contacts who get a push on SOS. Stored backend-side
// so an alert still fires even when the seeker's phone is offline (the
// mobile is the primary dispatcher, the server is the safety net).
router.get('/trust-circle', requireAuth, async (req, res, next) => {
  try {
    const { UserModel } = await import('@/modules/users/user.model');
    const u = await UserModel.findById(req.user!.id)
      .select('trustCircle isPeerResponder')
      .lean();
    res.json({
      ok: true,
      data: {
        trustCircle: ((u as { trustCircle?: unknown[] } | null)?.trustCircle ?? []).map(
          (c) => {
            const contact = c as { name: string; phone: string; relationship?: string | null };
            return {
              name: contact.name,
              phone: contact.phone,
              relationship: contact.relationship ?? null,
            };
          },
        ),
        isPeerResponder: Boolean(
          (u as { isPeerResponder?: boolean } | null)?.isPeerResponder,
        ),
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/trust-circle', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as {
      contacts?: Array<{ name?: unknown; phone?: unknown; relationship?: unknown }>;
    };
    const raw = Array.isArray(body.contacts) ? body.contacts.slice(0, 3) : [];
    const cleaned: Array<{ name: string; phone: string; relationship: string | null }> = [];
    for (const c of raw) {
      if (typeof c?.name !== 'string' || c.name.trim().length === 0) continue;
      if (typeof c?.phone !== 'string' || c.phone.trim().length < 6) continue;
      cleaned.push({
        name: c.name.trim().slice(0, 120),
        phone: c.phone.trim().slice(0, 30),
        relationship:
          typeof c.relationship === 'string' && c.relationship.trim().length > 0
            ? c.relationship.trim().slice(0, 40)
            : null,
      });
    }
    const { UserModel } = await import('@/modules/users/user.model');
    const updated = await UserModel.findByIdAndUpdate(
      req.user!.id,
      { $set: { trustCircle: cleaned } },
      { new: true },
    )
      .select('trustCircle isPeerResponder')
      .lean();
    res.json({
      ok: true,
      data: {
        trustCircle: cleaned,
        isPeerResponder: Boolean(
          (updated as { isPeerResponder?: boolean } | null)?.isPeerResponder,
        ),
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/peer-responder', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { enabled?: unknown };
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION_FAILED', message: '`enabled` must be a boolean.' } });
      return;
    }
    const { UserModel } = await import('@/modules/users/user.model');
    await UserModel.updateOne(
      { _id: req.user!.id },
      { $set: { isPeerResponder: body.enabled } },
    );
    res.json({ ok: true, data: { isPeerResponder: body.enabled }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post('/notification-prefs', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowed = ['jobs', 'applications', 'messages', 'ratings', 'referrals'];
    const update: Record<string, boolean> = {};
    for (const k of allowed) {
      if (typeof body[k] === 'boolean') update[`notificationPrefs.${k}`] = body[k] as boolean;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No valid prefs supplied.' });
      return;
    }
    const { UserModel } = await import('@/modules/users/user.model');
    await UserModel.updateOne({ _id: req.user!.id }, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

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

// One-photo profile — POST a base64 image, get back a structured
// partial profile. The mobile screen renders the result and the user
// confirms/edits before submitting via the regular PATCH /me/profile.
//
// No Zod schema here because the only field is a single very-large
// data URL — Express body limit + the inline check below are enough.
router.post('/profile/extract-from-photo', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { imageDataUrl?: unknown; locale?: unknown };
    if (
      typeof body.imageDataUrl !== 'string' ||
      !body.imageDataUrl.startsWith('data:image/')
    ) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'imageDataUrl must be a base64 image data URL.',
        },
        requestId: req.id,
      });
      return;
    }
    // Cap the inbound image size — the mobile compresses to ~700KB so
    // anything larger is suspicious and would bloat the vision call.
    if (body.imageDataUrl.length > 1_300_000) {
      res.status(413).json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Image is too large. Compress further on the device.',
        },
        requestId: req.id,
      });
      return;
    }
    const { extractProfileFromPhoto } = await import(
      '@/modules/profileExtract/profileExtract.service'
    );
    const extracted = await extractProfileFromPhoto({
      imageDataUrl: body.imageDataUrl,
      locale: typeof body.locale === 'string' ? body.locale : undefined,
    });
    res.json({ ok: true, data: { extracted }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});
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
