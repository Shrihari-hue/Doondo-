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
import * as scoreCredentialController from '@/modules/users/scoreCredential.controller';
import * as resumeRewriteService from '@/modules/resumeRewrite/resumeRewrite.service';
import * as festivalService from '@/modules/festivals/festival.service';
import * as skillDocumentService from '@/modules/me/skillDocument.service';
import * as sosService from '@/modules/sos/sos.service';
import { UserModel } from '@/modules/users/user.model';
import mentorsRouter from '@/modules/mentors/mentor.routes';
import paymentsRouter from '@/modules/payments/payment.routes';
import voiceAgentRouter from '@/modules/voiceAgent/voiceAgent.routes';
import reelsRouter from '@/modules/reels/reel.routes';
import communityRouter from '@/modules/community/post.routes';
import hiringRequestsRouter from '@/modules/hiringRequests/hiringRequest.routes';
import accountActivityRouter from '@/modules/accountActivity/accountActivity.routes';
import whatsappRouter from '@/modules/whatsapp/whatsapp.routes';
import * as employerInterestController from '@/modules/employerInterest/employerInterest.controller';
import {
  expressInterestSchema,
  employerIdParamSchema,
  interestIdParamSchema,
  listInterestedWorkersSchema,
} from '@/modules/employerInterest/employerInterest.schemas';
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
// Voice job-search agent — speak a search, hear results, apply by voice.
v1.use('/voice-agent', voiceAgentRouter);
// Hire Reels — worker intro videos + the employer discovery feed.
v1.use('/reels', reelsRouter);
// Community — the worker feed: posts, likes, comments, reposts.
v1.use('/community', communityRouter);
// Two-way discovery — the employer→worker outbound invite flow.
v1.use('/hiring-requests', hiringRequestsRouter);
v1.use('/accounts', accountActivityRouter);
// WhatsApp (Twilio) — inbound webhook + admin send/inbox.
v1.use('/whatsapp', whatsappRouter);

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

// ─── Two-way discovery — worker→employer "I'm interested" ───────────────────
// Worker side: raise / withdraw / check a standing interest in an employer
// (the inbound mirror of an employer's hiring request). Lets a worker reach
// out even when the employer has no live job posted.
v1.post(
  '/employers/:id/interest',
  requireAuth,
  requireRole('seeker'),
  validate(expressInterestSchema),
  employerInterestController.express,
);
v1.delete(
  '/employers/:id/interest',
  requireAuth,
  requireRole('seeker'),
  validate(employerIdParamSchema),
  employerInterestController.withdraw,
);
v1.get(
  '/employers/:id/interest/mine',
  requireAuth,
  requireRole('seeker'),
  validate(employerIdParamSchema),
  employerInterestController.getMine,
);
// Employer side: the inbound list of workers who want to work for them.
v1.get(
  '/me/interested-workers',
  requireAuth,
  requireRole('employer'),
  validate(listInterestedWorkersSchema),
  employerInterestController.listForEmployer,
);
v1.post(
  '/me/interested-workers/:id/viewed',
  requireAuth,
  requireRole('employer'),
  validate(interestIdParamSchema),
  employerInterestController.markViewed,
);
v1.post(
  '/me/interested-workers/:id/archive',
  requireAuth,
  requireRole('employer'),
  validate(interestIdParamSchema),
  employerInterestController.archive,
);

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

// ─── Doondo Score — shareable signed credential ─────────────────────────────
// `POST /me/score-credential` mints (or refreshes) a QR-encodable
// credential for the caller. `GET /score/verify/:code` is PUBLIC —
// anyone who scans the QR (in a browser or another app) can confirm the
// score is authentic.
v1.post('/me/score-credential', requireAuth, scoreCredentialController.issue);
v1.get('/score/verify/:code', scoreCredentialController.verify);

// ─── Festival Mode ──────────────────────────────────────────────────────────
// The festival calendar lives server-side (festival.config) so lunar
// dates are a config edit, not an app release. This returns the festival
// active for the caller right now — region-aware, so a Bengaluru worker
// isn't shown a Tamil Nadu festival — plus the next one for a countdown.
v1.get('/festivals/active', requireAuth, async (req, res, next) => {
  try {
    const state = await festivalService.getFestivalStateForUser(req.user!.id);
    res.json({ ok: true, data: state, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Preferred app language ─────────────────────────────────────────────────
// Synced by the mobile app whenever the worker changes the UI language.
// Drives in-chat auto-translation — an incoming message is translated
// into the recipient's locale.
v1.put(
  '/me/locale',
  requireAuth,
  validate(
    z.object({
      body: z.object({ locale: z.enum(['en', 'hi', 'ta', 'te', 'kn']) }),
    }),
  ),
  async (req, res, next) => {
    try {
      const locale = req.body.locale as string;
      await UserModel.updateOne({ _id: req.user!.id }, { $set: { locale } });
      res.json({ ok: true, data: { locale }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Skill-proof documents ──────────────────────────────────────────────────
// A worker attaches a certificate / licence / training doc / photo to a
// skill they claim. The file goes to cloud storage (fileStorage) and only
// the URL is kept on the user. Employers see these per-skill on the
// applicant view, which makes a claimed trade credible.
v1.post(
  '/me/skill-documents',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        skill: z.string().trim().min(1).max(60),
        dataUrl: z
          .string()
          .min(20)
          .max(1_550_000)
          .regex(
            /^data:[\w.+-]+\/[\w.+-]+;base64,/i,
            'dataUrl must be a base64 data URL',
          ),
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(1).max(80),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const user = await skillDocumentService.addSkillDocument(
        req.user!.id,
        req.body,
      );
      res.status(201).json({ ok: true, data: { user }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
v1.delete(
  '/me/skill-documents/:id',
  requireAuth,
  requireRole('seeker'),
  validate(z.object({ params: z.object({ id: z.string().min(1).max(80) }) })),
  async (req, res, next) => {
    try {
      const user = await skillDocumentService.removeSkillDocument(
        req.user!.id,
        req.params.id!,
      );
      res.json({ ok: true, data: { user }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Smart Resume — per-job AI resume rewrite ───────────────────────────────
// On-demand: the worker taps "Tailor for this job" and we return a
// job-tuned resume (summary, relevance-ranked skills, re-worded work
// blurbs) for them to review. Nothing is persisted — the worker decides
// what to do with the draft.
v1.post(
  '/me/resume/tailor',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      body: z.object({
        jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job id'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const result = await resumeRewriteService.tailorResumeForJob(
        req.user!.id,
        req.body.jobId as string,
      );
      res.json({ ok: true, data: result, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);

// Saved tailored resume per job — GET loads the worker's reviewed copy
// (so re-opening Smart Resume is instant), PUT upserts their edited
// version. The apply path snapshots it onto the Application.
v1.get(
  '/me/resume/tailored/:jobId',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({
        jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job id'),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const resume = await resumeRewriteService.getSavedTailoredResume(
        req.user!.id,
        req.params.jobId!,
      );
      res.json({ ok: true, data: { resume }, requestId: req.id });
    } catch (err) {
      next(err);
    }
  },
);
v1.put(
  '/me/resume/tailored/:jobId',
  requireAuth,
  requireRole('seeker'),
  validate(
    z.object({
      params: z.object({
        jobId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job id'),
      }),
      body: z.object({
        summary: z.string().trim().min(1).max(2000),
        pitch: z.string().trim().max(600).default(''),
        highlightedSkills: z.array(z.string().max(60)).max(40).default([]),
        matchedSkills: z.array(z.string().max(60)).max(40).default([]),
        workBlurbs: z
          .array(
            z.object({
              company: z.string().trim().max(160),
              role: z.string().trim().max(160),
              blurb: z.string().trim().max(600),
            }),
          )
          .max(10)
          .default([]),
        provider: z.string().max(20).optional(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      const resume = await resumeRewriteService.saveTailoredResume(
        req.user!.id,
        req.params.jobId!,
        req.body,
      );
      res.json({ ok: true, data: { resume }, requestId: req.id });
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
