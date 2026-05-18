/**
 * v1 router — composes every module router under /api/v1.
 *
 * As Phase 2+ adds modules (jobs, applications, employer, chat, wallet,
 * verification, training, safety), they get mounted here.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import authRouter from '@/modules/auth/auth.routes';
import jobsRouter from '@/modules/jobs/job.routes';
import applicationsRouter from '@/modules/applications/application.routes';
import meRouter from '@/modules/me/me.routes';
import chatRouter from '@/modules/chat/chat.routes';
import verificationRouter from '@/modules/verification/verification.routes';
import ratingsRouter from '@/modules/ratings/rating.routes';
import notificationsRouter from '@/modules/notifications/notification.routes';
import * as applicationsController from '@/modules/applications/application.controller';
import * as ratingsController from '@/modules/ratings/rating.controller';
import * as employersController from '@/modules/employers/employer.controller';
import { availabilitiesRouter } from '@/modules/availabilities/availability.routes';
import * as contactController from '@/modules/contact/contact.controller';
import { coursesRouter } from '@/modules/courses/courses.routes';
import * as coursesController from '@/modules/courses/courses.controller';
import * as endorsementController from '@/modules/endorsements/endorsement.controller';
import * as skillTestController from '@/modules/skillTests/skillTests.controller';
import * as profileViewService from '@/modules/me/profileView.service';
import * as doondoScoreService from '@/modules/users/doondoScore.service';
import * as sosService from '@/modules/sos/sos.service';
import mentorsRouter from '@/modules/mentors/mentor.routes';
import paymentsRouter from '@/modules/payments/payment.routes';
import {
  applicantsForJobSchema,
  applyParamsSchema,
} from '@/modules/applications/application.schemas';

const v1 = Router();

v1.use('/auth', authRouter);
v1.use('/jobs', jobsRouter);
v1.use('/applications', applicationsRouter);
v1.use('/me', meRouter);
v1.use('/conversations', chatRouter);
v1.use('/verification', verificationRouter);
v1.use('/ratings', ratingsRouter);
v1.use('/notifications', notificationsRouter);
// "Workers available right now" — employer-only lookup. Seeker-side
// reads/mutations live under /me/availability instead.
v1.use('/availabilities', availabilitiesRouter);
v1.use('/courses', coursesRouter);
v1.use('/mentors', mentorsRouter);
v1.use('/payments', paymentsRouter);

// Earned-badges helper — employer-side card on ApplicantDetail uses this.
v1.get('/seekers/:id/badges', requireAuth, coursesController.listSeekerBadges);

// Profile-view impression — employer hits this on ApplicantDetail mount.
// Idempotent within a UTC day per (seeker, viewer); see profileView.service.
v1.post(
  '/seekers/:id/view',
  requireAuth,
  requireRole('employer'),
  async (req, res, next) => {
    try {
      await profileViewService.recordView({
        seekerId: req.params.id!,
        viewerId: req.user!.id,
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Trade endorsements — employers vouch for seekers per-trade.
v1.get('/seekers/:id/endorsements', endorsementController.listForSeeker);
v1.post(
  '/seekers/:id/endorse',
  requireAuth,
  requireRole('employer'),
  endorsementController.endorseSeeker,
);

// Per-photo verification — same trust loop as endorsements but scoped
// to a specific work-sample photo.
v1.get('/seekers/:id/photo-verifications', endorsementController.listPhotoVerifications);
v1.post(
  '/seekers/:id/verify-photo',
  requireAuth,
  requireRole('employer'),
  endorsementController.verifySeekerPhoto,
);

// Skill tests — catalogue + attempt submission + passed-list.
v1.get('/skill-tests', skillTestController.list);
v1.get('/skill-tests/:id', skillTestController.detail);
v1.post(
  '/skill-tests/:id/attempts',
  requireAuth,
  requireRole('seeker'),
  skillTestController.submitAttempt,
);
v1.get(
  '/me/skill-test-attempts',
  requireAuth,
  requireRole('seeker'),
  skillTestController.listMyAttempts,
);
v1.get('/seekers/:id/passed-tests', skillTestController.listPassedForSeeker);

// Contact reveal — seeker calling an employer (gated by Application)
// and employer calling a seeker (gated by Application OR active beacon).
v1.get('/jobs/:id/contact', requireAuth, contactController.revealEmployerContact);
v1.get(
  '/seekers/:id/contact',
  requireAuth,
  requireRole('employer'),
  contactController.revealSeekerContact,
);

// Public employer detail. Anyone (even unauthenticated) can pull this up —
// it's the same trust signal a seeker uses to decide whether to apply.
v1.get('/employers/:id', employersController.getEmployerProfile);

// ─── SOS (safety) ───────────────────────────────────────────────────────────
// `POST /sos/trigger` fans the alert to Trust Circle + 2 nearest verified
// peers. Returns the unmatched trust-circle contacts so the mobile can open
// SMS composers for them as a fallback.
v1.post('/sos/trigger', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { lat?: number; lng?: number; note?: string };
    const lat = typeof body.lat === 'number' ? body.lat : undefined;
    const lng = typeof body.lng === 'number' ? body.lng : undefined;
    const result = await sosService.triggerSos({
      userId: req.user!.id,
      lat,
      lng,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
    res.status(201).json({ ok: true, data: result, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

v1.get('/sos/mine', requireAuth, async (req, res, next) => {
  try {
    const alerts = await sosService.listMyAlerts(req.user!.id);
    res.json({ ok: true, data: { alerts }, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

v1.post(
  '/sos/:id/resolve',
  requireAuth,
  validate(
    z.object({
      params: z.object({
        id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const alert = await sosService.resolveAlert({
        alertId: req.params.id!,
        callerId: req.user!.id,
      });
      res.json({ ok: true, data: { alert }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// Doondo Score — portable employability number. Public read so a
// seeker can share their score outside the app (QR code, link, future
// employer integrations). Returns the same shape for /me/doondo-score
// (auth required, looks up the caller) and /users/:id/doondo-score
// (any id, no auth required).
v1.get(
  '/me/doondo-score',
  requireAuth,
  async (req, res, next) => {
    try {
      const score = await doondoScoreService.computeForUser(req.user!.id);
      res.json({ ok: true, data: score, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
v1.get(
  '/users/:id/doondo-score',
  validate(
    z.object({
      params: z.object({
        id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const score = await doondoScoreService.computeForUser(req.params.id!);
      res.json({ ok: true, data: score, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// Per-user ratings read endpoint — lives under /users/:id/ratings because
// that's the natural URL for "this user's reviews".
v1.get(
  '/users/:id/ratings',
  validate(
    z.object({
      params: z.object({
        id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
      }),
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
        })
        .default({}),
    }),
  ),
  ratingsController.listForUser,
);

// Aggregated structured-tag summary for a user — "Workers say…"
// signals on the EmployerDetail screen. Public so unauthenticated
// browsers see the same trust info a seeker uses to decide.
v1.get(
  '/users/:id/tag-summary',
  validate(
    z.object({
      params: z.object({
        id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
      }),
      query: z
        .object({
          role: z.enum(['employer', 'seeker']).default('employer'),
        })
        .default({}),
    }),
  ),
  ratingsController.tagSummary,
);

// Apply lives URL-wise under /jobs/:id/apply (the natural place a client
// looks for it) but its controller belongs to the applications module.
// We mount it here directly so both URL groups stay consistent.
v1.post(
  '/jobs/:id/apply',
  requireAuth,
  requireRole('seeker'),
  validate(applyParamsSchema),
  applicationsController.apply,
);

// "I'm interested" — Today-mode one-tap variant. Same URL family as
// /apply but a different verb so employers can distinguish them in
// their dashboard. Reuses the apply params validator (just :id).
v1.post(
  '/jobs/:id/express-interest',
  requireAuth,
  requireRole('seeker'),
  validate(applyParamsSchema),
  applicationsController.expressInterest,
);

// Employer reads "applicants for this job" — same URL grouping reasoning.
v1.get(
  '/jobs/:id/applicants',
  requireAuth,
  requireRole('employer'),
  validate(applicantsForJobSchema),
  applicationsController.listApplicantsForJob,
);

// Future Phase 2+ mount points:
// v1.use('/wallet', walletRouter);       // Phase 6
// v1.use('/training', trainingRouter);   // Phase 6
// v1.use('/safety', safetyRouter);       // Phase 7

export default v1;
