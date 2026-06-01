/**
 * Applications controller — thin HTTP layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { errors } from '@/lib/errors';
import * as applicationService from './application.service';
import * as skillGapService from './skillGap.service';
import * as shiftCheckInService from './shiftCheckIn.service';

const ok = (req: Request, res: Response, status: number, data: unknown) => {
  res.status(status).json({ ok: true, data, requestId: req.id });
};

export async function apply(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.apply({
      seekerId: req.user.id,
      jobId: req.params.id!,
      coverNote: req.body?.coverNote ?? null,
      teamMembers: Array.isArray(req.body?.teamMembers) ? req.body.teamMembers : undefined,
      referrerId: req.body?.referrerId,
    });
    ok(req, res, 201, { application });
  } catch (err) {
    next(err);
  }
}

/**
 * Cash-paid confirmation — seekers OR employers tap "Mark as paid"
 * after the gig is done. Both sides confirming gives a real "Paid ✓"
 * badge. Seeker can also flag "disputed" with a note when an employer
 * marked it paid but they haven't actually received money.
 */
export async function confirmPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = req.body as { action?: string; disputeNote?: string };
    if (
      body.action !== 'seeker_confirm' &&
      body.action !== 'employer_confirm' &&
      body.action !== 'dispute'
    ) {
      throw errors.validation(
        { action: body.action },
        'action must be seeker_confirm | employer_confirm | dispute',
      );
    }
    const application = await applicationService.confirmPayment({
      applicationId: req.params.id!,
      callerId: req.user.id,
      action: body.action,
      disputeNote: body.disputeNote,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/**
 * Employer sets / moves a hired worker's next shift time. Arms the
 * night-before confirmation ping.
 */
export async function setNextShift(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const startAt = (req.body as { startAt?: string })?.startAt;
    if (!startAt) {
      throw errors.validation({ startAt }, 'startAt is required.');
    }
    const application = await applicationService.setNextShift({
      employerId: req.user.id,
      applicationId: req.params.id!,
      startAt,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/**
 * Worker confirms or declines their next shift (night-before ping reply).
 */
export async function confirmShift(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const coming = (req.body as { coming?: unknown })?.coming;
    if (typeof coming !== 'boolean') {
      throw errors.validation({ coming }, 'coming must be a boolean.');
    }
    const application = await applicationService.confirmShift({
      seekerId: req.user.id,
      applicationId: req.params.id!,
      coming,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/** Employer extends a time-boxed offer. Body: { ttlHours }. */
export async function makeOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const ttlRaw = (req.body as { ttlHours?: unknown })?.ttlHours;
    const ttlHours = Number(ttlRaw);
    if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 168) {
      throw errors.validation({ ttlHours: ttlRaw }, 'ttlHours must be 1–168.');
    }
    const application = await applicationService.makeOffer({
      employerId: req.user.id,
      applicationId: req.params.id!,
      ttlHours,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/** Worker raises "I'm on my way". Body: { lat, lng }. */
export async function markOnTheWay(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = req.body as { lat?: unknown; lng?: unknown };
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw errors.validation({ lat: body.lat, lng: body.lng }, 'Valid lat/lng required.');
    }
    const application = await applicationService.markOnTheWay({
      seekerId: req.user.id,
      applicationId: req.params.id!,
      lat,
      lng,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/** Worker accepts or declines a pending offer. Body: { accept }. */
export async function respondToOffer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const accept = (req.body as { accept?: unknown })?.accept;
    if (typeof accept !== 'boolean') {
      throw errors.validation({ accept }, 'accept must be a boolean.');
    }
    const application = await applicationService.respondToOffer({
      seekerId: req.user.id,
      applicationId: req.params.id!,
      accept,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/**
 * One-tap "I'm interested" — the Today-mode lightweight equivalent of
 * Apply. Same underlying record but flagged so employers can show
 * these in a different lane (typically by phoning the worker rather
 * than waiting on a cover-note review). Idempotent thanks to the
 * (seekerId, jobId) unique index — a second tap returns the existing
 * application.
 */
export async function expressInterest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.apply({
      seekerId: req.user.id,
      jobId: req.params.id!,
      asInterest: true,
    });
    ok(req, res, 201, { application });
  } catch (err) {
    next(err);
  }
}

export async function massApply(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const result = await applicationService.massApply({
      seekerId: req.user.id,
      jobIds: req.body.jobIds,
      coverNote: req.body?.coverNote ?? null,
    });
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function scheduleInterview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.scheduleInterview({
      employerId: req.user.id,
      applicationId: req.params.id!,
      scheduledFor: req.body.scheduledFor,
      mode: req.body.mode,
      location: req.body.location ?? null,
      meetingLink: req.body.meetingLink ?? null,
      notes: req.body.notes ?? null,
    });
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

export async function cancelInterview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.cancelInterview(
      req.user.id,
      req.params.id!,
    );
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

export async function listMine(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const applications = await applicationService.listMine(req.user.id, {
      status: q.status,
      limit: q.limit ?? 20,
    });
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.findById(req.user.id, req.params.id!);
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

/**
 * Skill-gap read endpoint — used by the seeker's MyApplications screen
 * after a rejection to surface "you were missing X — try this course".
 * Returns an empty result when the application isn't rejected or when
 * the seeker matched every required skill.
 */
export async function skillGap(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const result = await skillGapService.computeForApplication({
      seekerId: req.user.id,
      applicationId: req.params.id!,
    });
    ok(req, res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function withdraw(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const application = await applicationService.withdraw(req.user.id, req.params.id!);
    ok(req, res, 200, { application });
  } catch (err) {
    next(err);
  }
}

// ─── Shift check-in (Session 3) ─────────────────────────────────────────────

/**
 * POST /applications/:id/check-in or /check-out — record a shift event.
 * Body: { selfieDataUrl, lat, lng, timestamp? }
 */
function shiftHandler(kind: 'check_in' | 'check_out') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = req.body as {
        selfieDataUrl?: string;
        lat?: number;
        lng?: number;
        timestamp?: string;
      };
      if (typeof body.selfieDataUrl !== 'string') {
        throw errors.validation(
          { selfieDataUrl: 'required' },
          'A selfie is required to check in.',
        );
      }
      if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
        throw errors.validation(
          { lat: typeof body.lat, lng: typeof body.lng },
          'Location is required to check in.',
        );
      }
      const checkIn = await shiftCheckInService.createCheckIn({
        callerId: req.user.id,
        applicationId: req.params.id!,
        kind,
        selfieDataUrl: body.selfieDataUrl,
        lat: body.lat,
        lng: body.lng,
        timestamp: body.timestamp,
      });
      ok(req, res, 201, { checkIn });
    } catch (err) {
      next(err);
    }
  };
}

export const checkIn = shiftHandler('check_in');
export const checkOut = shiftHandler('check_out');

export async function listCheckIns(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const checkIns = await shiftCheckInService.listForApplication({
      callerId: req.user.id,
      applicationId: req.params.id!,
    });
    ok(req, res, 200, { checkIns });
  } catch (err) {
    next(err);
  }
}

// ─── Employer (Phase 3) ──────────────────────────────────────────────────────

function transitionHandler(next: 'viewed' | 'shortlisted' | 'rejected' | 'hired') {
  return async (req: Request, res: Response, n: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw errors.unauthorized();
      const application = await applicationService.transitionByEmployer(
        req.user.id,
        req.params.id!,
        next,
      );
      ok(req, res, 200, { application });
    } catch (err) {
      n(err);
    }
  };
}

export const markViewed = transitionHandler('viewed');
export const shortlist = transitionHandler('shortlisted');
export const reject = transitionHandler('rejected');
export const hire = transitionHandler('hired');

export async function listApplicantsForJob(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const applications = await applicationService.listApplicantsForJob(
      req.user.id,
      req.params.id!,
      { status: q.status, limit: q.limit ?? 50 },
    );
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}

export async function listApplicantsForEmployer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw errors.unauthorized();
    const q = req.query as { status?: never; limit?: number };
    const applications = await applicationService.listApplicantsForEmployer(req.user.id, {
      status: q.status,
      limit: q.limit ?? 50,
    });
    ok(req, res, 200, { applications });
  } catch (err) {
    next(err);
  }
}
