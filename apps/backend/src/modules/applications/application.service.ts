/**
 * Applications service.
 *
 * apply()
 *   1. Loads the job, asserts it exists and is 'active'.
 *   2. Tries to insert the Application. The unique index on (seekerId,
 *      jobId) is the source of truth for "already applied" — we don't
 *      pre-check, we let the DB enforce it and translate the duplicate
 *      key error to a clean 409.
 *   3. Bumps job.applicantsCount denormalised counter.
 *   4. Emits 'application:status_changed' to the seeker for parity with
 *      future status updates (so mobile can update its cache uniformly).
 *
 * listMine() returns the seeker's applications, optionally filtered by
 * status, hydrated with their job summaries — Phase 2's "My Applications"
 * tab needs both the application + the job in one fetch.
 *
 * Phase 3 will add employer-facing methods (markViewed, shortlist, hire,
 * reject) that drive the rest of the lifecycle. They live on this service
 * so all status transitions go through one validated code path.
 */

import { Types } from 'mongoose';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as walletService from '@/modules/wallet/wallet.service';
import { emitToUser } from '@/sockets/bus';
import {
  sendApplicationStatusPush,
  sendHireCelebrationPush,
  sendInterviewPush,
  sendSkillGapPush,
  sendTrustCircleHirePush,
  sendOfferMadePush,
  sendOfferResolvedPush,
  sendWorkerOnTheWayPush,
  sendBackfillPush,
  sendOfferCounteredPush,
} from '@/lib/push';
import { JobModel, type PublicJob } from '@/modules/jobs/job.model';
import {
  UserModel,
  type SeekerConstitution,
  type CraftPhoto,
  type PublicSkillDocument,
} from '@/modules/users/user.model';
import { getSavedTailoredResume } from '@/modules/resumeRewrite/resumeRewrite.service';
import {
  getOrCreateForApplication,
  postSystemMessage,
} from '@/modules/chat/chat.service';
import {
  ApplicationModel,
  type ApplicationStatus,
  type InterviewMode,
  type PublicApplication,
} from './application.model';

interface ApplyInput {
  seekerId: string;
  jobId: string;
  coverNote?: string | null;
  /**
   * When true the row is flagged `expressedAsInterest: true` and the
   * coverNote is forced to null — this path is for the one-tap
   * "I'm interested" press in Today mode. Employers can prioritise these
   * differently (typically by phoning the worker rather than waiting on
   * a cover note review).
   */
  asInterest?: boolean;
  /**
   * Optional declared team-member list (name + phone). Only persisted
   * when the seeker's profile workType === 'team' so we don't silently
   * carry stale teammates from a previous group apply.
   */
  teamMembers?: Array<{ name: string; phone: string }>;
  /**
   * Optional referrer user id, read from the share-link's ?ref= param.
   * Recorded as a pending Referral on apply; converted to a paid
   * bonus when this application reaches `hired`.
   */
  referrerId?: string;
}

export async function apply(input: ApplyInput): Promise<PublicApplication> {
  const job = await JobModel.findById(input.jobId);
  if (!job) throw errors.jobNotFound();
  if (job.status !== 'active') throw errors.jobNotOpen();

  // Block guard: an employer who blocked this worker doesn't receive their
  // applications. Fail closed but quietly — a generic forbidden, not a
  // "you're blocked" message that would invite arguing.
  const { isBlocked } = await import('@/modules/moderation/moderation.service');
  if (await isBlocked(job.employerId.toString(), input.seekerId)) {
    throw errors.forbidden('This application could not be submitted.');
  }

  // Snapshot teamSize from the seeker's profile when they're applying as
  // a team. Stored on the Application itself so the employer's card
  // stays correct even if the seeker flips back to solo later.
  let teamSizeSnapshot: number | null = null;
  try {
    const seeker = await UserModel.findById(input.seekerId)
      .select('workType teamSize')
      .lean();
    if (
      seeker &&
      (seeker as { workType?: string }).workType === 'team' &&
      typeof (seeker as { teamSize?: number }).teamSize === 'number' &&
      ((seeker as { teamSize: number }).teamSize as number) >= 2
    ) {
      teamSizeSnapshot = (seeker as { teamSize: number }).teamSize;
    }
  } catch {
    // Non-fatal — fall through with teamSizeSnapshot = null.
  }

  try {
    // Only persist the team-member declaration when this is genuinely a
    // team application (the seeker's profile says so). Carrying stale
    // teammates from an old apply on a solo profile would mislead the
    // employer.
    const teamMembers =
      teamSizeSnapshot && Array.isArray(input.teamMembers)
        ? input.teamMembers.slice(0, 4).map((m) => ({
            name: m.name.trim(),
            phone: m.phone.trim(),
          }))
        : [];

    // If the worker tailored their Smart Resume for this job, snapshot it
    // onto the application so the employer sees the job-tuned version.
    let tailoredResume: {
      summary: string;
      pitch: string;
      highlightedSkills: string[];
      matchedSkills: string[];
      workBlurbs: Array<{ company: string; role: string; blurb: string }>;
    } | null = null;
    try {
      const saved = await getSavedTailoredResume(
        input.seekerId,
        job._id.toString(),
      );
      if (saved) {
        tailoredResume = {
          summary: saved.summary,
          pitch: saved.pitch,
          highlightedSkills: saved.highlightedSkills,
          matchedSkills: saved.matchedSkills,
          workBlurbs: saved.workBlurbs,
        };
      }
    } catch {
      // Non-fatal — apply without the tailored resume.
    }

    const app = await ApplicationModel.create({
      seekerId: new Types.ObjectId(input.seekerId),
      jobId: job._id,
      employerId: job.employerId,
      coverNote: input.asInterest ? null : input.coverNote ?? null,
      expressedAsInterest: Boolean(input.asInterest),
      teamSizeSnapshot,
      teamMembers,
      tailoredResume,
      status: 'pending',
      appliedAt: new Date(),
    });

    // Bump denormalised counter — fire and forget; even if it fails the
    // application itself is the source of truth. Mongoose 8 queries are
    // lazy: `void` only discards the value, it does NOT trigger execution.
    // We need .exec() (or await) to actually send the update.
    JobModel.updateOne({ _id: job._id }, { $inc: { applicantsCount: 1 } })
      .exec()
      .catch((err) =>
        logger.warn({ err, jobId: job._id.toString() }, 'applicantsCount bump failed'),
      );

    logger.info(
      { applicationId: app.id, seekerId: input.seekerId, jobId: input.jobId },
      'application submitted',
    );

    // Record referral if a referrer id came in on the apply call.
    if (input.referrerId) {
      const { recordReferral } = await import(
        '@/modules/referrals/referral.service'
      );
      void recordReferral({
        referrerId: input.referrerId,
        refereeId: input.seekerId,
        jobId: input.jobId,
        applicationId: app.id,
      }).catch((err) =>
        logger.warn({ err, applicationId: app.id }, 'referral record failed'),
      );
    }

    // Emit to the seeker so their other devices stay in sync.
    emitToUser(input.seekerId, 'application:status_changed', {
      applicationId: app.id,
      jobId: input.jobId,
      status: 'pending' as ApplicationStatus,
      timestamp: app.appliedAt.toISOString(),
    });

    // Bump the seeker's apply-day streak. Fire-and-forget — the streak
    // service silently no-ops on a same-day re-apply.
    void (async () => {
      try {
        const { bumpStreak } = await import('@/modules/users/streaks.service');
        await bumpStreak(input.seekerId, 'apply');
      } catch (err) {
        logger.warn({ err, seekerId: input.seekerId }, 'apply streak bump failed');
      }
    })();

    // New-applicant SMS alert — only for employers who opted in. Indian
    // local employers often live in SMS, not app notifications, so this is
    // their reliable channel. Fire-and-forget; SMS is best-effort and must
    // never block or fail the application.
    void (async () => {
      try {
        const { wantsSmsApplicantAlerts } = await import(
          '@/modules/employerResponse/employerResponse.service'
        );
        if (!(await wantsSmsApplicantAlerts(job.employerId.toString()))) return;
        const employer = await UserModel.findById(job.employerId).select('phone').lean();
        const phone = (employer as { phone?: string | null } | null)?.phone;
        if (!phone) return;
        const { sendTransactionalSms } = await import('@/lib/transactionalSms');
        await sendTransactionalSms({
          phone,
          message: `Doondo: New applicant for "${job.title}". Open the app to review.`,
        });
      } catch (err) {
        logger.warn({ err, jobId: input.jobId }, 'new-applicant SMS alert failed');
      }
    })();

    return app.toPublicJSON();
  } catch (err) {
    if (isDuplicateKey(err)) throw errors.applicationAlreadyExists();
    throw err;
  }
}

// ─── Cash-paid confirmation ─────────────────────────────────────────────────

export type PaymentAction = 'seeker_confirm' | 'employer_confirm' | 'dispute';

interface ConfirmPaymentInput {
  applicationId: string;
  callerId: string;
  action: PaymentAction;
  /** Required for action === 'dispute'. */
  disputeNote?: string;
}

/**
 * Marks payment confirmation on an Application. The caller is
 * authorised based on which side they are on the application:
 *   - seeker_confirm: only the seekerId may call
 *   - employer_confirm: only the employerId may call
 *   - dispute: only the seekerId may call (with optional note)
 *
 * Only allowed when the application has reached `hired`. Idempotent —
 * re-confirming overwrites the timestamp with the latest moment.
 */
export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (app.status !== 'hired') {
    throw errors.conflict(
      'Can only mark payment after the application is hired.',
    );
  }

  const callerObjectId = new Types.ObjectId(input.callerId);
  // The model declares these as Schema.Types.ObjectId (constructor type);
  // at runtime they're Types.ObjectId instances. Cast through unknown so
  // we can use .equals() — codebase convention.
  const isSeeker = (app.seekerId as unknown as Types.ObjectId).equals(callerObjectId);
  const isEmployer = (app.employerId as unknown as Types.ObjectId).equals(callerObjectId);

  if (input.action === 'seeker_confirm' && !isSeeker) throw errors.forbidden();
  if (input.action === 'employer_confirm' && !isEmployer) throw errors.forbidden();
  if (input.action === 'dispute' && !isSeeker) throw errors.forbidden();

  const now = new Date();
  const next = {
    seekerConfirmedAt: app.paymentConfirmation?.seekerConfirmedAt ?? null,
    employerConfirmedAt: app.paymentConfirmation?.employerConfirmedAt ?? null,
    disputedAt: app.paymentConfirmation?.disputedAt ?? null,
    disputeNote: app.paymentConfirmation?.disputeNote ?? null,
  };

  if (input.action === 'seeker_confirm') {
    next.seekerConfirmedAt = now;
    // Confirming clears any previous dispute the seeker raised.
    next.disputedAt = null;
    next.disputeNote = null;
  } else if (input.action === 'employer_confirm') {
    next.employerConfirmedAt = now;
  } else if (input.action === 'dispute') {
    next.disputedAt = now;
    next.disputeNote = input.disputeNote?.trim() || null;
    // A dispute supersedes the seeker's own previous confirm (if any).
    next.seekerConfirmedAt = null;
  }

  app.paymentConfirmation = next;
  await app.save();
  return app.toPublicJSON();
}

export interface SetNextShiftInput {
  employerId: string;
  applicationId: string;
  /** ISO datetime of the shift start. */
  startAt: string;
}

/**
 * Employer sets (or moves) the concrete start time of a hired worker's
 * next shift. Setting it arms the night-before confirmation ping; moving
 * it resets the confirmation cycle so the worker is asked afresh for the
 * new time.
 */
export async function setNextShift(
  input: SetNextShiftInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.employerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.employerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') {
    throw errors.conflict('Can only schedule a shift for a hired worker.');
  }
  const when = new Date(input.startAt);
  if (Number.isNaN(when.getTime())) {
    throw errors.validation({ startAt: input.startAt }, 'startAt must be a valid date.');
  }
  if (when.getTime() < Date.now() - 60_000) {
    throw errors.validation({ startAt: input.startAt }, 'Shift time must be in the future.');
  }
  app.nextShiftAt = when;
  app.shiftConfirmation = { promptedAt: null, confirmedAt: null, declinedAt: null };
  await app.save();
  return app.toPublicJSON();
}

export interface ConfirmShiftInput {
  seekerId: string;
  applicationId: string;
  /** true = "I'm coming", false = "I can't make it". */
  coming: boolean;
}

/**
 * Worker confirms (or declines) their next shift in response to the
 * night-before ping. Recording a decline early is the whole point — it
 * turns a silent no-show into a managed gap the employer can backfill.
 */
export async function confirmShift(
  input: ConfirmShiftInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.seekerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.seekerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') throw errors.conflict('No shift to confirm.');
  if (!app.nextShiftAt) throw errors.conflict('No shift has been scheduled yet.');

  const now = new Date();
  app.shiftConfirmation = {
    promptedAt: app.shiftConfirmation?.promptedAt ?? now,
    confirmedAt: input.coming ? now : null,
    declinedAt: input.coming ? null : now,
  };
  await app.save();

  // No-show backfill: a decline opens the slot, so auto-offer it to the
  // next candidate in this job's pipeline and tell the employer. Fire-and-
  // forget — the decline itself is already recorded.
  if (!input.coming) {
    void autoBackfill(app).catch((err) =>
      logger.warn({ err, applicationId: app.id }, 'auto-backfill failed'),
    );
  }

  return app.toPublicJSON();
}

/**
 * Pick the next pipeline candidate for a job whose hired worker just
 * declined, extend them an offer, and notify the employer. Preference
 * order: shortlisted → viewed → pending, then earliest applied. Skips
 * anyone already hired, closed, or sitting on a pending offer.
 */
async function autoBackfill(declined: {
  _id: unknown;
  jobId: unknown;
  employerId: unknown;
  seekerId: unknown;
}): Promise<void> {
  const jobId = declined.jobId as Types.ObjectId;
  const employerId = (declined.employerId as Types.ObjectId).toString();

  const candidates = await ApplicationModel.find({
    jobId,
    _id: { $ne: declined._id },
    status: { $in: ['shortlisted', 'viewed', 'pending'] },
    $or: [{ offer: null }, { 'offer.outcome': { $ne: 'pending' } }],
  }).lean();
  if (candidates.length === 0) return;

  const rank: Record<string, number> = { shortlisted: 0, viewed: 1, pending: 2 };
  candidates.sort((a, b) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (r !== 0) return r;
    return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
  });
  const next = candidates[0];
  if (!next) return;

  const nextAppId = (next._id as unknown as Types.ObjectId).toString();
  // Default backfill window: 12 hours to respond.
  await makeOffer({ employerId, applicationId: nextAppId, ttlHours: 12 });

  const [declinedUser, nextUser] = await Promise.all([
    UserModel.findById(declined.seekerId as Types.ObjectId).select('name').lean(),
    UserModel.findById(next.seekerId as unknown as Types.ObjectId).select('name').lean(),
  ]);
  void sendBackfillPush({
    recipientId: employerId,
    applicationId: nextAppId,
    declinedName: (declinedUser as { name?: string } | null)?.name,
    nextName: (nextUser as { name?: string } | null)?.name,
  }).catch(() => undefined);
}

export interface MarkOnTheWayInput {
  seekerId: string;
  applicationId: string;
  /** The worker's current coordinates when they tapped "on my way". */
  lat: number;
  lng: number;
}

/** Haversine distance in km between two [lng,lat] points. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Worker raises "I'm on my way". We estimate an ETA from their current
 * position to the job at a nominal local-travel speed — a foreground,
 * worker-initiated signal, NOT a live background feed. The employer gets
 * a heads-up push and the en-route status on the applicant card.
 */
export async function markOnTheWay(
  input: MarkOnTheWayInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.seekerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.seekerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') throw errors.conflict('You can set this once hired.');

  // Estimate ETA from the job location, when we have it. ~18 km/h is a
  // reasonable blended speed for short urban trips (walk/auto/bike).
  const job = await JobModel.findById(app.jobId).select('location title').lean();
  const jobCoords = (job as { location?: { geo?: { coordinates?: [number, number] } } } | null)
    ?.location?.geo?.coordinates;
  // (0,0) is the mobile's "location unavailable" sentinel — don't treat it
  // as a real position (it would yield a nonsense cross-globe ETA). Fall
  // back to the default estimate instead.
  const hasCoords = jobCoords && !(input.lat === 0 && input.lng === 0);
  let etaMinutes = 15;
  if (hasCoords) {
    const km = distanceKm([input.lng, input.lat], jobCoords!);
    etaMinutes = Math.max(1, Math.min(600, Math.round((km / 18) * 60)));
  }

  app.onTheWay = { startedAt: new Date(), etaMinutes };
  await app.save();

  void sendWorkerOnTheWayPush({
    recipientId: app.employerId.toString(),
    applicationId: (app._id as Types.ObjectId).toString(),
    etaMinutes,
  }).catch(() => undefined);

  return app.toPublicJSON();
}

/**
 * Worker acknowledges the job's pre-shift checklist ("bring tools, wear
 * uniform, know the address"). Records the moment so the employer sees the
 * worker has read and accepted the prep — an early no-show-risk signal.
 */
export async function acknowledgeChecklist(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(applicationId);
  if (!app) throw errors.applicationNotFound();
  if (!(app.seekerId as unknown as Types.ObjectId).equals(new Types.ObjectId(seekerId))) {
    throw errors.forbidden();
  }
  if (app.status !== 'hired') throw errors.conflict('Acknowledge once you are hired.');
  app.prepAcknowledgedAt = new Date();
  await app.save();
  return app.toPublicJSON();
}

export interface MakeOfferInput {
  employerId: string;
  applicationId: string;
  /** Hours until the offer lapses. */
  ttlHours: number;
  /** Wage to offer (paise). Defaults to the job's posted pay. */
  wageAmount?: number;
}

/**
 * Employer extends a time-boxed offer to a candidate. The offer carries a
 * deadline; the worker accepts (→ hired) or declines, and the expiry
 * sweep lapses it if neither happens. Re-offering replaces a prior
 * lapsed/declined offer with a fresh window.
 */
export async function makeOffer(
  input: MakeOfferInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.employerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.employerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (app.status === 'hired') throw errors.conflict('This worker is already hired.');
  if (app.status === 'rejected' || app.status === 'withdrawn') {
    throw errors.conflict('Cannot offer — this application is closed.');
  }
  if (app.offer && app.offer.outcome === 'pending') {
    throw errors.conflict('An offer is already pending with this candidate.');
  }

  // Default the offered wage to the job's posted pay unless overridden.
  let wageAmount = input.wageAmount ?? null;
  if (wageAmount == null) {
    const job = await JobModel.findById(app.jobId).select('pay').lean();
    wageAmount = (job as { pay?: { amount?: number } } | null)?.pay?.amount ?? null;
  }

  const now = new Date();
  app.offer = {
    madeAt: now,
    expiresAt: new Date(now.getTime() + input.ttlHours * 60 * 60 * 1000),
    respondedAt: null,
    outcome: 'pending',
    wageAmount,
    counterWageAmount: null,
  };
  await app.save();

  void sendOfferMadePush({
    recipientId: app.seekerId.toString(),
    applicationId: (app._id as Types.ObjectId).toString(),
    expiresAt: app.offer.expiresAt,
  }).catch(() => undefined);

  return app.toPublicJSON();
}

export interface RespondToOfferInput {
  seekerId: string;
  applicationId: string;
  /** accept → hired · decline → closed · counter → propose a new wage. */
  action: 'accept' | 'decline' | 'counter';
  /** Required when action === 'counter': the worker's wage (paise). */
  counterAmount?: number;
}

/**
 * Worker responds to a pending offer: accept (→ hired), decline (frees the
 * slot), or counter with a different wage (ball goes back to the employer).
 * A lapsed offer can no longer be acted on.
 */
export async function respondToOffer(
  input: RespondToOfferInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.seekerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.seekerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (!app.offer || app.offer.outcome !== 'pending') {
    throw errors.conflict('No pending offer to respond to.');
  }
  if (app.offer.expiresAt.getTime() <= Date.now()) {
    app.offer.outcome = 'expired';
    await app.save();
    throw errors.conflict('This offer has expired.');
  }

  const now = new Date();
  const employerId = (app.employerId as unknown as Types.ObjectId).toString();
  const appId = (app._id as Types.ObjectId).toString();

  // ── Counter: record the worker's wage and hand it back to the employer ──
  if (input.action === 'counter') {
    if (!input.counterAmount || input.counterAmount <= 0) {
      throw errors.validation({ counterAmount: input.counterAmount }, 'A counter wage is required.');
    }
    app.offer.respondedAt = now;
    app.offer.outcome = 'countered';
    app.offer.counterWageAmount = Math.round(input.counterAmount);
    await app.save();
    void sendOfferCounteredPush({
      recipientId: employerId,
      applicationId: appId,
      amountPaise: app.offer.counterWageAmount,
    }).catch(() => undefined);
    return app.toPublicJSON();
  }

  app.offer.respondedAt = now;
  app.offer.outcome = input.action === 'accept' ? 'accepted' : 'declined';
  await app.save();

  void sendOfferResolvedPush({
    recipientId: employerId,
    applicationId: appId,
    outcome: input.action === 'accept' ? 'accepted' : 'declined',
  }).catch(() => undefined);

  if (input.action !== 'accept') {
    return app.toPublicJSON();
  }

  // Accept → hire via the canonical path (fires every hire side-effect).
  if (app.status === 'pending' || app.status === 'viewed') {
    await transitionByEmployer(employerId, input.applicationId, 'shortlisted');
  }
  return transitionByEmployer(employerId, input.applicationId, 'hired');
}

export interface RespondToCounterInput {
  employerId: string;
  applicationId: string;
  /** true = accept the worker's counter wage (→ hired) · false = decline. */
  accept: boolean;
}

/**
 * Employer responds to a worker's wage counter: accept it (the agreed wage
 * becomes the countered amount and the worker is hired) or decline. To
 * re-counter, the employer simply makes a fresh offer at a new wage.
 */
export async function respondToCounter(
  input: RespondToCounterInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (
    !(app.employerId as unknown as Types.ObjectId).equals(
      new Types.ObjectId(input.employerId),
    )
  ) {
    throw errors.forbidden();
  }
  if (!app.offer || app.offer.outcome !== 'countered') {
    throw errors.conflict('No counter-offer to respond to.');
  }

  const employerId = (app.employerId as unknown as Types.ObjectId).toString();
  if (!input.accept) {
    app.offer.outcome = 'declined';
    await app.save();
    return app.toPublicJSON();
  }

  // Accept the counter: the agreed wage is the worker's counter, then hire.
  app.offer.wageAmount = app.offer.counterWageAmount ?? app.offer.wageAmount;
  app.offer.outcome = 'accepted';
  await app.save();

  if (app.status === 'pending' || app.status === 'viewed') {
    await transitionByEmployer(employerId, input.applicationId, 'shortlisted');
  }
  return transitionByEmployer(employerId, input.applicationId, 'hired');
}

// ─── Mass-apply ─────────────────────────────────────────────────────────────

export type MassApplyOutcome =
  | { jobId: string; status: 'applied'; application: PublicApplication }
  | { jobId: string; status: 'already_applied' }
  | { jobId: string; status: 'job_not_found' }
  | { jobId: string; status: 'job_not_open' }
  | { jobId: string; status: 'failed'; reason: string };

export interface MassApplyResult {
  total: number;
  applied: number;
  alreadyApplied: number;
  skipped: number;
  results: MassApplyOutcome[];
}

interface MassApplyInput {
  seekerId: string;
  jobIds: string[];
  coverNote?: string | null;
}

/**
 * Mass-apply — submit one application per jobId. Partial success is normal:
 * any single job that's missing, closed, or already applied to lands in
 * `results` with its own status code. The caller renders the outcome sheet
 * from that array.
 *
 * We process serially rather than in parallel so duplicate-key races on
 * the same seekerId are deterministic (rare but possible if the same job
 * is in the list twice, which we also de-dupe defensively).
 */
export async function massApply(input: MassApplyInput): Promise<MassApplyResult> {
  const uniqueJobIds = [...new Set(input.jobIds)];

  const jobs = await JobModel.find({
    _id: { $in: uniqueJobIds.map((id) => new Types.ObjectId(id)) },
  }).select('_id status employerId');
  const jobById = new Map(jobs.map((j) => [j._id.toString(), j]));

  const results: MassApplyOutcome[] = [];

  for (const jobId of uniqueJobIds) {
    const job = jobById.get(jobId);
    if (!job) {
      results.push({ jobId, status: 'job_not_found' });
      continue;
    }
    if (job.status !== 'active') {
      results.push({ jobId, status: 'job_not_open' });
      continue;
    }
    try {
      const app = await ApplicationModel.create({
        seekerId: new Types.ObjectId(input.seekerId),
        jobId: job._id,
        employerId: job.employerId,
        coverNote: input.coverNote ?? null,
        status: 'pending',
        appliedAt: new Date(),
      });
      JobModel.updateOne({ _id: job._id }, { $inc: { applicantsCount: 1 } })
        .exec()
        .catch((err) =>
          logger.warn({ err, jobId }, 'applicantsCount bump failed (mass-apply)'),
        );
      emitToUser(input.seekerId, 'application:status_changed', {
        applicationId: app.id,
        jobId,
        status: 'pending' as ApplicationStatus,
        timestamp: app.appliedAt.toISOString(),
      });
      results.push({ jobId, status: 'applied', application: app.toPublicJSON() });
    } catch (err) {
      if (isDuplicateKey(err)) {
        results.push({ jobId, status: 'already_applied' });
        continue;
      }
      logger.error(
        { err, jobId, seekerId: input.seekerId },
        'mass-apply: single job failed',
      );
      results.push({
        jobId,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  const applied = results.filter((r) => r.status === 'applied').length;
  const alreadyApplied = results.filter((r) => r.status === 'already_applied').length;
  const skipped = results.length - applied - alreadyApplied;

  logger.info(
    { seekerId: input.seekerId, total: results.length, applied, alreadyApplied, skipped },
    'mass-apply complete',
  );

  return {
    total: results.length,
    applied,
    alreadyApplied,
    skipped,
    results,
  };
}

export async function listMine(
  seekerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<PublicApplication & { job?: PublicJob }>> {
  const q: Record<string, unknown> = { seekerId: new Types.ObjectId(seekerId) };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q)
    .sort({ createdAt: -1 })
    .limit(filter.limit);

  if (apps.length === 0) return [];

  // Hydrate jobs in one round-trip.
  const jobIds = [...new Set(apps.map((a) => a.jobId.toString()))];
  const jobs = await JobModel.find({ _id: { $in: jobIds } });
  const employerIds = [...new Set(jobs.map((j) => j.employerId.toString()))];
  const employers = await UserModel.find({ _id: { $in: employerIds } })
    .select('name isVerified')
    .lean();
  const employerMap = new Map(
    employers.map((e) => [
      (e._id as Types.ObjectId).toString(),
      {
        id: (e._id as Types.ObjectId).toString(),
        name: e.name,
        isVerified: Boolean(e.isVerified),
      },
    ]),
  );
  const jobMap = new Map(
    jobs.map((j) => [
      j.id,
      { ...j.toPublicJSON(), employer: employerMap.get(j.employerId.toString()) },
    ]),
  );

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    job: jobMap.get(a.jobId.toString()),
  }));
}

export async function findById(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication & { job?: PublicJob }> {
  const app = await ApplicationModel.findOne({
    _id: applicationId,
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!app) throw errors.applicationNotFound();

  const job = await JobModel.findById(app.jobId);
  if (!job) {
    return app.toPublicJSON();
  }
  const employer = await UserModel.findById(job.employerId)
    .select('name isVerified')
    .lean();
  return {
    ...app.toPublicJSON(),
    job: {
      ...job.toPublicJSON(),
      employer: employer
        ? {
            id: (employer._id as Types.ObjectId).toString(),
            name: employer.name,
            isVerified: Boolean(employer.isVerified),
          }
        : undefined,
    },
  };
}

export async function withdraw(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findOne({
    _id: applicationId,
    seekerId: new Types.ObjectId(seekerId),
  });
  if (!app) throw errors.applicationNotFound();

  if (app.status === 'withdrawn' || app.status === 'rejected' || app.status === 'hired') {
    throw errors.applicationInvalidTransition(app.status, 'withdrawn');
  }

  app.status = 'withdrawn';
  app.withdrawnAt = new Date();
  await app.save();

  JobModel.updateOne(
    { _id: app.jobId, applicantsCount: { $gt: 0 } },
    { $inc: { applicantsCount: -1 } },
  )
    .exec()
    .catch((err) =>
      logger.warn(
        { err, jobId: app.jobId.toString() },
        'applicantsCount decrement failed (withdraw)',
      ),
    );

  emitToUser(seekerId, 'application:status_changed', {
    applicationId: app.id,
    jobId: app.jobId.toString(),
    status: 'withdrawn' as ApplicationStatus,
    timestamp: app.withdrawnAt.toISOString(),
  });

  return app.toPublicJSON();
}

// ─── Employer-side operations (Phase 3) ─────────────────────────────────────

/**
 * Transition an application's status. Validates ownership (employer must
 * own the job the application is for) and the state machine, sets the
 * matching timestamp, emits the live socket event to the seeker, and
 * (on hire) bumps the job to `filled`.
 *
 * Allowed transitions:
 *   pending     → viewed | rejected
 *   viewed      → shortlisted | rejected
 *   shortlisted → hired | rejected
 *
 * `withdrawn` is seeker-only (handled in withdraw()) and terminal in
 * both directions. `hired` and `rejected` are terminal.
 */
const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['viewed', 'rejected', 'shortlisted'],
  viewed: ['shortlisted', 'rejected'],
  shortlisted: ['hired', 'rejected'],
  rejected: [],
  hired: [],
  withdrawn: [],
};

export async function transitionByEmployer(
  employerId: string,
  applicationId: string,
  next: ApplicationStatus,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(applicationId);
  if (!app) throw errors.applicationNotFound();
  if (app.employerId.toString() !== employerId) throw errors.forbidden();

  const cur = app.status;
  const allowed = ALLOWED_TRANSITIONS[cur].includes(next);
  if (!allowed) {
    throw errors.applicationInvalidTransition(cur, next);
  }

  const now = new Date();
  app.status = next;
  switch (next) {
    case 'viewed':
      app.viewedAt = now;
      break;
    case 'shortlisted':
      app.shortlistedAt = now;
      break;
    case 'rejected':
      app.rejectedAt = now;
      // Compute the missing-skill snapshot at the moment of rejection so
      // it's stable even if the seeker later adds the skill to their
      // profile. Best-effort: a lookup failure here is non-fatal —
      // skipping the snapshot means the seeker's UI falls back to a
      // generic rejection message, which is still acceptable.
      try {
        const { diffSkills } = await import('./skillGap.service');
        const [jobForGap, seekerForGap] = await Promise.all([
          JobModel.findById(app.jobId).select('skills').lean(),
          UserModel.findById(app.seekerId).select('skills').lean(),
        ]);
        const jobSkills = (jobForGap?.skills as string[] | undefined) ?? [];
        const seekerSkills =
          (seekerForGap as { skills?: string[] } | null)?.skills ?? [];
        const missing = diffSkills(jobSkills, seekerSkills);
        app.rejectionReasons = missing.length > 0 ? missing : null;
      } catch (err) {
        logger.warn(
          { err, applicationId: app.id },
          'rejection skill-gap snapshot failed (non-fatal)',
        );
      }
      break;
    case 'hired':
      app.hiredAt = now;
      break;
    default:
      break;
  }
  await app.save();

  // On hire, mark the job filled — frees other seekers from seeing it.
  if (next === 'hired') {
    JobModel.updateOne({ _id: app.jobId }, { $set: { status: 'filled' } })
      .exec()
      .catch((err) =>
        logger.warn(
          { err, jobId: app.jobId.toString() },
          'job status -> filled failed (hire)',
        ),
      );

    // Record the seeker's earnings ledger entry. Idempotent via the
    // unique (userId, applicationId, kind='hire_payment') index — calling
    // twice for the same application is a no-op.
    void (async () => {
      try {
        const job = await JobModel.findById(app.jobId).select('pay title');
        if (!job) return;
        await walletService.creditOnHire({
          userId: app.seekerId.toString(),
          applicationId: app.id,
          jobId: app.jobId.toString(),
          amount: job.pay?.amount ?? 0,
          jobTitle: job.title,
        });
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'wallet credit failed');
      }
    })();

    // NOTE: the referral bonus is NOT credited here anymore. A hire that
    // never shows up shouldn't pay out — the payout now fires when the
    // referee completes their first shift check-in (see
    // shiftCheckIn.service → referrals.creditOnFirstShift).

    // Fan-out "hired near you" social-proof pings to up to 50 verified
    // seekers within 10 km of the job. Best-effort; the hire itself is
    // already persisted.
    void (async () => {
      try {
        const { fanOutOnHire } = await import('./hiredNearby.service');
        await fanOutOnHire({ applicationId: app.id });
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'hired-nearby fan-out failed');
      }
    })();

    // Quiet proud ping to the seeker's Trust Circle contacts who are
    // themselves on Doondo. Mirrors the existing shift-start/end safety
    // loop, but for the celebratory job-landed moment.
    void (async () => {
      try {
        const seeker = await UserModel.findById(app.seekerId)
          .select('name trustCircle')
          .lean();
        const trust = Array.isArray((seeker as { trustCircle?: unknown[] } | null)?.trustCircle)
          ? ((seeker as { trustCircle: Array<{ phone: string }> }).trustCircle)
          : [];
        if (trust.length === 0) return;

        const { hashPhone } = await import('@/modules/me/findFriends.service');
        const hashes = trust.map((c) => hashPhone(c.phone));
        const matched = await UserModel.find({
          phoneHash: { $in: hashes },
          isActive: true,
        })
          .select('_id')
          .lean();

        const job = await JobModel.findById(app.jobId)
          .select('title employerId')
          .lean();
        const employer = job?.employerId
          ? await UserModel.findById(job.employerId).select('companyName name').lean()
          : null;
        const workerFirstName =
          ((seeker as { name?: string } | null)?.name ?? 'Your contact').split(' ')[0] ??
          'Your contact';
        const employerName =
          (employer as { companyName?: string | null; name?: string | null } | null)?.companyName ??
          (employer as { companyName?: string | null; name?: string | null } | null)?.name ??
          null;

        for (const m of matched) {
          if ((m._id as Types.ObjectId).toString() === app.seekerId.toString()) continue;
          void sendTrustCircleHirePush({
            recipientId: (m._id as Types.ObjectId).toString(),
            workerFirstName,
            jobTitle: (job as { title?: string } | null)?.title,
            employerName,
          });
        }
      } catch (err) {
        logger.warn({ err, applicationId: app.id }, 'trust circle hire ping failed');
      }
    })();
  }

  // Auto-unlock chat on shortlist or hire. Idempotent — re-running on
  // shortlist→hire returns the same conversation.
  if (next === 'shortlisted' || next === 'hired') {
    try {
      await getOrCreateForApplication({
        employerId: new Types.ObjectId(employerId),
        seekerId: app.seekerId as unknown as Types.ObjectId,
        jobId: app.jobId as unknown as Types.ObjectId,
      });
    } catch (err) {
      logger.warn({ err, applicationId: app.id }, 'chat auto-unlock failed');
    }
  }

  logger.info(
    { applicationId: app.id, status: next, employerId, seekerId: app.seekerId.toString() },
    'application transitioned',
  );

  // Notify the seeker live (socket).
  emitToUser(app.seekerId.toString(), 'application:status_changed', {
    applicationId: app.id,
    jobId: app.jobId.toString(),
    status: next,
    timestamp: now.toISOString(),
  });

  // Push (best-effort) — for users who have the app closed or backgrounded.
  // We hydrate the job title for a friendlier message body.
  //
  // Rejection special case: when we have a skill-gap snapshot AND can
  // recommend a course, we send the skill-gap push (which deep-links
  // to CourseDetail) instead of the generic rejection push. The
  // generic push is still sent when there's no actionable gap.
  void (async () => {
    const job = await JobModel.findById(app.jobId).select('title').lean();
    if (next === 'hired') {
      try {
        const employer = await UserModel.findById(app.employerId)
          .select('companyName name')
          .lean();
        const employerName =
          (employer as { companyName?: string | null; name?: string | null } | null)?.companyName ??
          (employer as { companyName?: string | null; name?: string | null } | null)?.name ??
          null;
        void sendHireCelebrationPush({
          recipientId: app.seekerId.toString(),
          applicationId: app.id,
          jobTitle: job?.title,
          employerName,
        });
        return;
      } catch (err) {
        logger.warn(
          { err, applicationId: app.id },
          'hire celebration push failed, falling back to generic',
        );
      }
    }
    if (next === 'rejected' && Array.isArray(app.rejectionReasons) && app.rejectionReasons.length > 0) {
      try {
        const { rankCoursesForGap } = await import('./skillGap.service');
        const top = rankCoursesForGap(app.rejectionReasons, job?.title ?? null)[0];
        if (top) {
          const primary = top.addressesSkills[0] ?? app.rejectionReasons[0]!;
          void sendSkillGapPush({
            recipientId: app.seekerId.toString(),
            jobTitle: job?.title,
            missingSkill: primary,
            courseId: top.course.id,
            courseTitle: top.course.title,
            durationMinutes: top.course.totalDurationMinutes,
            applicationId: app.id,
          });
          return;
        }
      } catch (err) {
        logger.warn(
          { err, applicationId: app.id },
          'skill-gap push failed, falling back to generic',
        );
      }
    }
    void sendApplicationStatusPush({
      recipientId: app.seekerId.toString(),
      status: next,
      jobTitle: job?.title,
      applicationId: app.id,
    });
  })();

  return app.toPublicJSON();
}

interface ApplicantListEntry extends PublicApplication {
  /** Hydrated seeker summary (name, photo, skills, location, resume). */
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    location: { city: string | null; area: string | null } | null;
    /** Resume metadata + download URL (present when uploaded). */
    resumeUrl: string | null;
    resumeFilename: string | null;
    resumeMimeType: string | null;
    resumeSizeBytes: number | null;
    resumeUploadedAt: string | null;
    /** Work history entries from the Resume Builder. Empty when unused. */
    workHistory: Array<{
      company: string;
      role: string;
      startDate: string;
      endDate: string | null;
      current: boolean;
      description: string | null;
    }>;
    /** Photos of the seeker's work — up to 6 entries, tagged by craft skill. */
    workPhotos: CraftPhoto[];
    /** Worker-uploaded proof files (certificates, licences, photos) per skill. */
    skillDocuments: PublicSkillDocument[];
    /** The seeker's Doondo Constitution — their stated work boundaries. */
    constitution: SeekerConstitution;
  };
}

/** Normalise stored skill-document sub-docs into their wire shape. */
function publicSkillDocuments(raw: unknown): PublicSkillDocument[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  return raw.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const ex =
      o.extracted && typeof o.extracted === 'object'
        ? (o.extracted as Record<string, unknown>)
        : null;
    return {
      id: String(o.id ?? ''),
      skill: String(o.skill ?? ''),
      url: String(o.url ?? ''),
      fileName: String(o.fileName ?? ''),
      mimeType: String(o.mimeType ?? ''),
      kind: o.kind === 'photo' ? 'photo' : 'document',
      sizeBytes: typeof o.sizeBytes === 'number' ? o.sizeBytes : 0,
      uploadedAt:
        o.uploadedAt instanceof Date
          ? o.uploadedAt.toISOString()
          : String(o.uploadedAt ?? ''),
      extracted: ex
        ? {
            title: str(ex.title),
            issuer: str(ex.issuer),
            issuedOn: str(ex.issuedOn),
          }
        : null,
    };
  });
}

/** Normalise a stored constitution sub-doc into a complete, defaulted object. */
function publicConstitution(raw: unknown): SeekerConstitution {
  const c = (raw ?? {}) as Partial<SeekerConstitution>;
  return {
    maxDistanceKm:
      typeof c.maxDistanceKm === 'number' ? c.maxDistanceKm : null,
    noNightShifts: c.noNightShifts === true,
    noSundays: c.noSundays === true,
    requiresPpe: c.requiresPpe === true,
    requiresContract: c.requiresContract === true,
  };
}

/**
 * List ALL applicants across ALL of the employer's jobs in one query.
 * Used by the employer's Applicants tab. Hydrates seeker + job summaries
 * so the client renders a flat list without follow-up requests.
 */
export async function listApplicantsForEmployer(
  employerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<ApplicantListEntry & { job?: import('@/modules/jobs/job.model').PublicJob }>> {
  const q: Record<string, unknown> = {
    employerId: new Types.ObjectId(employerId),
  };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q).sort({ createdAt: -1 }).limit(filter.limit);
  if (apps.length === 0) return [];

  const seekerIds = [...new Set(apps.map((a) => a.seekerId.toString()))];
  const jobIds = [...new Set(apps.map((a) => a.jobId.toString()))];

  const [seekers, jobs] = await Promise.all([
    UserModel.find({ _id: { $in: seekerIds } })
      .select('name photoUrl skills isVerified location resumeFilename resumeMimeType resumeSizeBytes resumeUploadedAt workHistory workPhotos constitution skillDocuments +resumeUrl')
      .lean(),
    JobModel.find({ _id: { $in: jobIds } }),
  ]);

  const seekerMap = new Map(
    seekers.map((s) => [
      (s._id as Types.ObjectId).toString(),
      {
        id: (s._id as Types.ObjectId).toString(),
        name: s.name,
        photoUrl: s.photoUrl ?? null,
        skills: s.skills ?? [],
        isVerified: Boolean(s.isVerified),
        location: s.location
          ? { city: s.location.city ?? null, area: s.location.area ?? null }
          : null,
        resumeUrl: s.resumeUrl ?? null,
        resumeFilename: s.resumeFilename ?? null,
        resumeMimeType: s.resumeMimeType ?? null,
        resumeSizeBytes: s.resumeSizeBytes ?? null,
        resumeUploadedAt: s.resumeUploadedAt
          ? (s.resumeUploadedAt as Date).toISOString()
          : null,
        workHistory: (s.workHistory ?? []).map((w) => ({
          company: w.company,
          role: w.role,
          startDate: w.startDate,
          endDate: w.endDate ?? null,
          current: Boolean(w.current),
          description: w.description ?? null,
        })),
        workPhotos: s.workPhotos ?? [],
        skillDocuments: publicSkillDocuments(s.skillDocuments),
        constitution: publicConstitution(s.constitution),
      },
    ]),
  );
  const jobMap = new Map(jobs.map((j) => [j.id, j.toPublicJSON()]));

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    seeker: seekerMap.get(a.seekerId.toString()),
    job: jobMap.get(a.jobId.toString()),
  }));
}

/**
 * List all applicants for one of the employer's jobs. Asserts ownership.
 */
export async function listApplicantsForJob(
  employerId: string,
  jobId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<ApplicantListEntry[]> {
  const job = await JobModel.findById(jobId).select('employerId').lean();
  if (!job) throw errors.jobNotFound();
  if (job.employerId.toString() !== employerId) throw errors.forbidden();

  const q: Record<string, unknown> = {
    jobId: new Types.ObjectId(jobId),
    employerId: new Types.ObjectId(employerId),
  };
  if (filter.status) q.status = filter.status;

  const apps = await ApplicationModel.find(q).sort({ createdAt: -1 }).limit(filter.limit);
  if (apps.length === 0) return [];

  const seekerIds = [...new Set(apps.map((a) => a.seekerId.toString()))];
  const seekers = await UserModel.find({ _id: { $in: seekerIds } })
    .select('name photoUrl skills isVerified location resumeFilename resumeMimeType resumeSizeBytes resumeUploadedAt constitution skillDocuments +resumeUrl')
    .lean();
  const seekerMap = new Map(
    seekers.map((s) => [
      (s._id as Types.ObjectId).toString(),
      {
        id: (s._id as Types.ObjectId).toString(),
        name: s.name,
        photoUrl: s.photoUrl ?? null,
        skills: s.skills ?? [],
        isVerified: Boolean(s.isVerified),
        location: s.location
          ? { city: s.location.city ?? null, area: s.location.area ?? null }
          : null,
        resumeUrl: s.resumeUrl ?? null,
        resumeFilename: s.resumeFilename ?? null,
        resumeMimeType: s.resumeMimeType ?? null,
        resumeSizeBytes: s.resumeSizeBytes ?? null,
        resumeUploadedAt: s.resumeUploadedAt
          ? (s.resumeUploadedAt as Date).toISOString()
          : null,
        workHistory: (s.workHistory ?? []).map((w) => ({
          company: w.company,
          role: w.role,
          startDate: w.startDate,
          endDate: w.endDate ?? null,
          current: Boolean(w.current),
          description: w.description ?? null,
        })),
        workPhotos: s.workPhotos ?? [],
        skillDocuments: publicSkillDocuments(s.skillDocuments),
        constitution: publicConstitution(s.constitution),
      },
    ]),
  );

  return apps.map((a) => ({
    ...a.toPublicJSON(),
    seeker: seekerMap.get(a.seekerId.toString()),
  }));
}

// ─── Interview scheduling (employer) ────────────────────────────────────────

interface ScheduleInterviewInput {
  employerId: string;
  applicationId: string;
  scheduledFor: string; // ISO
  mode: InterviewMode;
  location?: string | null;
  meetingLink?: string | null;
  notes?: string | null;
}

/**
 * Upsert the interview on an application. First call schedules; subsequent
 * calls reschedule. Side effects (all best-effort, parallel):
 *   - Push notification to the seeker
 *   - System message into the chat thread
 *   - Live socket event so the seeker's app updates without a fetch
 *
 * The application's status is NOT auto-bumped to 'shortlisted' — interviews
 * can happen at any stage (already shortlisted, even reopened). The employer
 * controls status separately.
 */
export async function scheduleInterview(
  input: ScheduleInterviewInput,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(input.applicationId);
  if (!app) throw errors.applicationNotFound();
  if (app.employerId.toString() !== input.employerId) throw errors.forbidden();

  const isReschedule = Boolean(app.interview && app.interview.status === 'scheduled');

  app.interview = {
    scheduledFor: new Date(input.scheduledFor),
    mode: input.mode,
    location: input.location ?? null,
    meetingLink: input.meetingLink ?? null,
    notes: input.notes ?? null,
    status: 'scheduled',
    scheduledAt: new Date(),
    cancelledAt: null,
    // Cleared on reschedule so the new time gets its own reminder.
    reminderSentAt: null,
  };
  await app.save();

  // Side effects fire in parallel so we don't block the response on push/chat.
  void hydrateAndNotifyInterview(app, isReschedule ? 'rescheduled' : 'scheduled');

  return app.toPublicJSON();
}

/**
 * Cancel the currently-scheduled interview. No-op if there's nothing to
 * cancel. Fires the same side-effect trio so the seeker knows immediately.
 */
export async function cancelInterview(
  employerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const app = await ApplicationModel.findById(applicationId);
  if (!app) throw errors.applicationNotFound();
  if (app.employerId.toString() !== employerId) throw errors.forbidden();
  if (!app.interview || app.interview.status !== 'scheduled') {
    // Idempotent — nothing to cancel.
    return app.toPublicJSON();
  }

  app.interview = {
    ...app.interview,
    status: 'cancelled',
    cancelledAt: new Date(),
  };
  await app.save();

  void hydrateAndNotifyInterview(app, 'cancelled');

  return app.toPublicJSON();
}

/**
 * Side-effect orchestrator. Looks up the job + employer summaries so the
 * push, system message, and socket payload all read humanly.
 */
async function hydrateAndNotifyInterview(
  app: import('./application.model').ApplicationDocument,
  kind: 'scheduled' | 'rescheduled' | 'cancelled',
): Promise<void> {
  try {
    const [job, employer, conversation] = await Promise.all([
      JobModel.findById(app.jobId).select('title employerId').lean(),
      UserModel.findById(app.employerId).select('name companyName').lean(),
      // Conversation is created lazily on shortlist — get-or-create here
      // guarantees there's a thread even if the employer skipped that step.
      getOrCreateForApplication({
        employerId: app.employerId as unknown as Types.ObjectId,
        seekerId: app.seekerId as unknown as Types.ObjectId,
        jobId: app.jobId as unknown as Types.ObjectId,
      }),
    ]);
    const employerLabel = employer?.companyName ?? employer?.name ?? 'The employer';
    const jobTitle = job?.title ?? 'this role';
    const interview = app.interview!;
    const whenIso = interview.scheduledFor.toISOString();
    const whenStr = interview.scheduledFor.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });

    const modeLabel =
      interview.mode === 'in_person'
        ? 'In-person'
        : interview.mode === 'video'
          ? 'Video'
          : 'Phone';

    const locationLine =
      interview.mode === 'in_person' && interview.location
        ? ` at ${interview.location}`
        : interview.mode === 'video' && interview.meetingLink
          ? ` — ${interview.meetingLink}`
          : '';

    const systemBody =
      kind === 'cancelled'
        ? `${employerLabel} cancelled the interview for ${jobTitle}.`
        : kind === 'rescheduled'
          ? `${employerLabel} rescheduled the interview for ${jobTitle}. ${modeLabel} interview on ${whenStr}${locationLine}.`
          : `${employerLabel} scheduled an interview for ${jobTitle}. ${modeLabel} interview on ${whenStr}${locationLine}.`;

    void postSystemMessage(conversation.id, systemBody).catch((err: unknown) => {
      logger.warn({ err }, 'interview system message failed');
    });

    void sendInterviewPush({
      recipientId: app.seekerId.toString(),
      kind,
      jobTitle,
      whenIso,
      applicationId: app.id,
    }).catch((err: unknown) => {
      logger.warn({ err }, 'interview push failed');
    });

    emitToUser(app.seekerId.toString(), 'application:interview', {
      applicationId: app.id,
      kind,
      interview: kind === 'cancelled' ? null : app.toPublicJSON().interview,
    });
  } catch (err) {
    logger.warn({ err, applicationId: app.id }, 'interview side-effects failed');
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}
