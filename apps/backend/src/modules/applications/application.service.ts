/** Applications service — Postgres/Drizzle implementation. */
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import * as walletService from '@/modules/wallet/wallet.service';
import { emitToUser } from '@/sockets/bus';
import {
  sendApplicationStatusPush,
  sendInterviewPush,
  sendOfferCounteredPush,
  sendOfferMadePush,
  sendOfferResolvedPush,
  sendWorkerOnTheWayPush,
} from '@/lib/push';
import { getDb } from '@/db/client';
import {
  applications,
  jobs,
  users,
  type ApplicationStatus,
  type InterviewMode,
  type PaymentMetadataJson,
  type TailoredResumeJson,
  type TeamMemberJson,
} from '@/db/schema';
import { toPublicJob } from '@/modules/jobs/job.serializers';
import type { PublicJob } from '@/modules/jobs/job.model';
import type { PublicApplication } from './application.model';
import { getSavedTailoredResume } from '@/modules/resumeRewrite/resumeRewrite.service';

interface ApplyInput {
  seekerId: string;
  jobId: string;
  coverNote?: string | null;
  asInterest?: boolean;
  teamMembers?: Array<{ name: string; phone: string }>;
  referrerId?: string;
}
export type PaymentAction = 'seeker_confirm' | 'employer_confirm' | 'dispute';
interface ConfirmPaymentInput {
  applicationId: string;
  callerId: string;
  action: PaymentAction;
  disputeNote?: string;
}
export interface SetNextShiftInput {
  employerId: string;
  applicationId: string;
  startAt: string;
}
export interface ConfirmShiftInput {
  seekerId: string;
  applicationId: string;
  coming: boolean;
}
export interface MarkOnTheWayInput {
  seekerId: string;
  applicationId: string;
  lat: number;
  lng: number;
}
export interface MakeOfferInput {
  employerId: string;
  applicationId: string;
  ttlHours: number;
  wageAmount?: number;
}
export interface RespondToOfferInput {
  seekerId: string;
  applicationId: string;
  action: 'accept' | 'decline' | 'counter';
  counterAmount?: number;
}
export interface RespondToCounterInput {
  employerId: string;
  applicationId: string;
  accept: boolean;
}
interface MassApplyInput {
  seekerId: string;
  jobIds: string[];
  coverNote?: string | null;
}
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
interface ScheduleInterviewInput {
  employerId: string;
  applicationId: string;
  scheduledFor: string;
  mode: InterviewMode;
  location?: string | null;
  meetingLink?: string | null;
  notes?: string | null;
}

type AppRow = typeof applications.$inferSelect;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
function publicApp(a: AppRow): PublicApplication {
  const p = a.paymentMetadata;
  const d = a.interviewDetails;
  const o = a.offerDetails;
  return {
    id: a.id,
    jobId: a.jobId,
    status: a.status as PublicApplication['status'],
    coverNote: a.coverNote ?? null,
    expressedAsInterest: a.expressedAsInterest,
    teamSizeSnapshot: a.teamSizeSnapshot ?? null,
    teamMembers: a.teamMembers ?? [],
    paymentConfirmation:
      a.paymentStatus === 'none'
        ? null
        : {
            seekerConfirmedAt: p?.seekerConfirmedAt ?? null,
            employerConfirmedAt: p?.employerConfirmedAt ?? null,
            disputedAt: p?.disputedAt ?? null,
            disputeNote: p?.disputeNote ?? null,
          },
    timeline: {
      appliedAt: a.appliedAt.toISOString(),
      viewedAt: iso(a.viewedAt),
      shortlistedAt: iso(a.shortlistedAt),
      rejectedAt: iso(a.rejectedAt),
      hiredAt: iso(a.hiredAt),
      withdrawnAt: iso(a.withdrawnAt),
    },
    rejectionReasons: a.rejectionReasons?.length ? a.rejectionReasons : null,
    flaggedAsGhostedAt: iso(a.flaggedAsGhostedAt),
    interview:
      a.interviewAt && a.interviewStatus && a.interviewMode
        ? {
            scheduledFor: a.interviewAt.toISOString(),
            mode: a.interviewMode,
            location: d?.location ?? null,
            meetingLink: d?.meetingLink ?? null,
            notes: d?.notes ?? null,
            status: a.interviewStatus,
            scheduledAt: d?.scheduledAt ?? a.interviewAt.toISOString(),
            cancelledAt: d?.cancelledAt ?? null,
            reminderSentAt: d?.reminderSentAt ?? null,
          }
        : null,
    nextShiftAt: iso(a.nextShiftAt),
    prepAcknowledgedAt: iso(a.prepAcknowledgedAt),
    shiftConfirmation: a.nextShiftAt ? a.shiftConfirmationStatus : 'none',
    offer: {
      status: a.offerStatus ?? 'none',
      expiresAt:
        a.offerStatus === 'pending' || a.offerStatus === 'countered' ? iso(a.offerExpiresAt) : null,
      wageAmount: o?.wageAmount ?? null,
      counterWageAmount: o?.counterWageAmount ?? null,
    },
    onTheWay: a.onTheWayStartedAt
      ? {
          active: true,
          etaMinutes: a.onTheWayEtaMinutes ?? null,
          startedAt: a.onTheWayStartedAt.toISOString(),
        }
      : { active: false, etaMinutes: null, startedAt: null },
    tailoredResume: a.tailoredResume ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
async function getApp(id: string): Promise<AppRow> {
  const [row] = await getDb().select().from(applications).where(eq(applications.id, id)).limit(1);
  if (!row) throw errors.applicationNotFound();
  return row;
}
async function updateApp(
  id: string,
  values: Partial<typeof applications.$inferInsert>,
): Promise<AppRow> {
  const [row] = await getDb()
    .update(applications)
    .set(values)
    .where(eq(applications.id, id))
    .returning();
  if (!row) throw errors.applicationNotFound();
  return row;
}
function assertOwner(a: AppRow, employerId: string): void {
  if (a.employerId !== employerId) throw errors.forbidden();
}
function assertSeeker(a: AppRow, seekerId: string): void {
  if (a.seekerId !== seekerId) throw errors.forbidden();
}
function paymentStatus(
  meta: PaymentMetadataJson,
): 'none' | 'seeker_confirmed' | 'employer_confirmed' | 'confirmed' | 'disputed' {
  if (meta.disputedAt) return 'disputed';
  if (meta.seekerConfirmedAt && meta.employerConfirmedAt) return 'confirmed';
  if (meta.seekerConfirmedAt) return 'seeker_confirmed';
  if (meta.employerConfirmedAt) return 'employer_confirmed';
  return 'none';
}
function distanceKm(a: [number, number], b: [number, number]): number {
  const r = 6371,
    t = (n: number) => (n * Math.PI) / 180,
    x = t(b[1] - a[1]),
    y = t(b[0] - a[0]);
  return (
    2 *
    r *
    Math.asin(
      Math.sqrt(
        Math.sin(x / 2) ** 2 + Math.cos(t(a[1])) * Math.cos(t(b[1])) * Math.sin(y / 2) ** 2,
      ),
    )
  );
}
function emit(a: AppRow, status: PublicApplication['status'], timestamp: Date): void {
  emitToUser(a.seekerId, 'application:status_changed', {
    applicationId: a.id,
    jobId: a.jobId,
    status,
    timestamp: timestamp.toISOString(),
  });
}

export async function apply(input: ApplyInput): Promise<PublicApplication> {
  const db = getDb();
  const [job, seeker] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1),
    db
      .select({ workType: users.workType, teamSize: users.teamSize })
      .from(users)
      .where(eq(users.id, input.seekerId))
      .limit(1),
  ]);
  const j = job[0];
  if (!j) throw errors.jobNotFound();
  if (j.status !== 'active') throw errors.jobNotOpen();
  const { isBlocked } = await import('@/modules/moderation/moderation.service');
  if (await isBlocked(j.employerId, input.seekerId))
    throw errors.forbidden('This application could not be submitted.');
  const teamSizeSnapshot =
    seeker[0]?.workType === 'team' && (seeker[0]?.teamSize ?? 0) >= 2 ? seeker[0]!.teamSize : null;
  const teamMembers: TeamMemberJson[] =
    teamSizeSnapshot && Array.isArray(input.teamMembers)
      ? input.teamMembers.slice(0, 4).map((m) => ({ name: m.name.trim(), phone: m.phone.trim() }))
      : [];
  let tailoredResume: TailoredResumeJson | null = null;
  try {
    const saved = await getSavedTailoredResume(input.seekerId, j.id);
    if (saved)
      tailoredResume = {
        summary: saved.summary,
        pitch: saved.pitch,
        highlightedSkills: saved.highlightedSkills,
        matchedSkills: saved.matchedSkills,
        workBlurbs: saved.workBlurbs,
      };
  } catch {
    /* best effort */
  }
  try {
    const [row] = await db
      .insert(applications)
      .values({
        seekerId: input.seekerId,
        jobId: j.id,
        employerId: j.employerId,
        coverNote: input.asInterest ? null : (input.coverNote ?? null),
        expressedAsInterest: Boolean(input.asInterest),
        teamSizeSnapshot,
        teamMembers,
        tailoredResume,
        status: 'pending',
        appliedAt: new Date(),
      })
      .returning();
    const app = row!;
    void db
      .update(jobs)
      .set({ applicantsCount: j.applicantsCount + 1 })
      .where(eq(jobs.id, j.id))
      .catch((err) => logger.warn({ err, jobId: j.id }, 'applicantsCount bump failed'));
    emit(app, 'pending', app.appliedAt);
    void import('@/modules/users/streaks.service')
      .then(({ bumpStreak }) => bumpStreak(input.seekerId, 'apply'))
      .catch((err) => logger.warn({ err }, 'apply streak bump failed'));
    if (input.referrerId)
      void import('@/modules/referrals/referral.service')
        .then(({ recordReferral }) =>
          recordReferral({
            referrerId: input.referrerId!,
            refereeId: input.seekerId,
            jobId: j.id,
            applicationId: app.id,
          }),
        )
        .catch((err) => logger.warn({ err }, 'referral record failed'));
    return publicApp(app);
  } catch (err) {
    if (isUnique(err)) throw errors.applicationAlreadyExists();
    throw err;
  }
}

export async function confirmPayment(input: ConfirmPaymentInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  if (a.status !== 'hired')
    throw errors.conflict('Can only mark payment after the application is hired.');
  if (
    (input.action === 'seeker_confirm' || input.action === 'dispute') &&
    a.seekerId !== input.callerId
  )
    throw errors.forbidden();
  if (input.action === 'employer_confirm' && a.employerId !== input.callerId)
    throw errors.forbidden();
  const now = new Date().toISOString();
  const meta: PaymentMetadataJson = { ...(a.paymentMetadata ?? {}) };
  if (input.action === 'seeker_confirm') {
    meta.seekerConfirmedAt = now;
    meta.disputedAt = null;
    meta.disputeNote = null;
  } else if (input.action === 'employer_confirm') meta.employerConfirmedAt = now;
  else {
    meta.disputedAt = now;
    meta.disputeNote = input.disputeNote?.trim() || null;
    meta.seekerConfirmedAt = null;
  }
  return publicApp(
    await updateApp(a.id, { paymentMetadata: meta, paymentStatus: paymentStatus(meta) }),
  );
}

export async function setNextShift(input: SetNextShiftInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertOwner(a, input.employerId);
  if (a.status !== 'hired') throw errors.conflict('Can only schedule a shift for a hired worker.');
  const when = new Date(input.startAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000)
    throw errors.validation({ startAt: input.startAt }, 'Shift time must be in the future.');
  return publicApp(
    await updateApp(a.id, {
      nextShiftAt: when,
      shiftConfirmationStatus: 'none',
      shiftConfirmationPromptedAt: null,
      shiftConfirmationConfirmedAt: null,
      shiftConfirmationDeclinedAt: null,
    }),
  );
}
export async function confirmShift(input: ConfirmShiftInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertSeeker(a, input.seekerId);
  if (a.status !== 'hired' || !a.nextShiftAt) throw errors.conflict('No shift to confirm.');
  const now = new Date();
  const updated = await updateApp(
    a.id,
    input.coming
      ? {
          shiftConfirmationStatus: 'confirmed',
          shiftConfirmationPromptedAt: a.shiftConfirmationPromptedAt ?? now,
          shiftConfirmationConfirmedAt: now,
          shiftConfirmationDeclinedAt: null,
        }
      : {
          shiftConfirmationStatus: 'declined',
          shiftConfirmationPromptedAt: a.shiftConfirmationPromptedAt ?? now,
          shiftConfirmationConfirmedAt: null,
          shiftConfirmationDeclinedAt: now,
        },
  );
  if (!input.coming)
    void autoBackfill(updated).catch((err) =>
      logger.warn({ err, applicationId: a.id }, 'auto-backfill failed'),
    );
  return publicApp(updated);
}
export async function acknowledgeChecklist(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const a = await getApp(applicationId);
  assertSeeker(a, seekerId);
  if (a.status !== 'hired') throw errors.conflict('Acknowledge once you are hired.');
  return publicApp(await updateApp(a.id, { prepAcknowledgedAt: new Date() }));
}
export async function markOnTheWay(input: MarkOnTheWayInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertSeeker(a, input.seekerId);
  if (a.status !== 'hired') throw errors.conflict('You can set this once hired.');
  const [job] = await getDb()
    .select({ geo: jobs.geo })
    .from(jobs)
    .where(eq(jobs.id, a.jobId))
    .limit(1);
  const etaMinutes =
    job && !(input.lat === 0 && input.lng === 0)
      ? Math.max(
          1,
          Math.min(
            600,
            Math.round((distanceKm([input.lng, input.lat], [job.geo.x, job.geo.y]) / 18) * 60),
          ),
        )
      : 15;
  const updated = await updateApp(a.id, {
    onTheWayStartedAt: new Date(),
    onTheWayEtaMinutes: etaMinutes,
  });
  void sendWorkerOnTheWayPush({ recipientId: a.employerId, applicationId: a.id, etaMinutes }).catch(
    () => undefined,
  );
  return publicApp(updated);
}

export async function makeOffer(input: MakeOfferInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertOwner(a, input.employerId);
  if (a.status === 'hired') throw errors.conflict('This worker is already hired.');
  if (a.status === 'rejected' || a.status === 'withdrawn')
    throw errors.conflict('Cannot offer — this application is closed.');
  if (a.offerStatus === 'pending')
    throw errors.conflict('An offer is already pending with this candidate.');
  const [job] = await getDb()
    .select({ payAmount: jobs.payAmount })
    .from(jobs)
    .where(eq(jobs.id, a.jobId))
    .limit(1);
  const now = new Date(),
    wageAmount = input.wageAmount ?? job?.payAmount ?? null;
  const updated = await updateApp(a.id, {
    offerStatus: 'pending',
    offerExpiresAt: new Date(now.getTime() + input.ttlHours * 3600000),
    offerDetails: {
      madeAt: now.toISOString(),
      respondedAt: null,
      wageAmount,
      counterWageAmount: null,
    },
  });
  void sendOfferMadePush({
    recipientId: a.seekerId,
    applicationId: a.id,
    expiresAt: updated.offerExpiresAt!,
  }).catch(() => undefined);
  return publicApp(updated);
}
async function hireFromOffer(a: AppRow): Promise<PublicApplication> {
  if (a.status === 'pending' || a.status === 'viewed')
    await transitionByEmployer(a.employerId, a.id, 'shortlisted');
  return transitionByEmployer(a.employerId, a.id, 'hired');
}
export async function respondToOffer(input: RespondToOfferInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertSeeker(a, input.seekerId);
  if (a.offerStatus !== 'pending') throw errors.conflict('No pending offer to respond to.');
  if (!a.offerExpiresAt || a.offerExpiresAt.getTime() <= Date.now()) {
    await updateApp(a.id, { offerStatus: 'expired' });
    throw errors.conflict('This offer has expired.');
  }
  const now = new Date();
  if (input.action === 'counter') {
    if (!input.counterAmount || input.counterAmount <= 0)
      throw errors.validation(
        { counterAmount: input.counterAmount },
        'A counter wage is required.',
      );
    const updated = await updateApp(a.id, {
      offerStatus: 'countered',
      offerDetails: {
        ...a.offerDetails,
        respondedAt: now.toISOString(),
        counterWageAmount: Math.round(input.counterAmount),
      },
    });
    void sendOfferCounteredPush({
      recipientId: a.employerId,
      applicationId: a.id,
      amountPaise: Math.round(input.counterAmount),
    }).catch(() => undefined);
    return publicApp(updated);
  }
  const updated = await updateApp(a.id, {
    offerStatus: input.action === 'accept' ? 'accepted' : 'declined',
    offerDetails: { ...a.offerDetails, respondedAt: now.toISOString() },
  });
  void sendOfferResolvedPush({
    recipientId: a.employerId,
    applicationId: a.id,
    outcome: input.action === 'accept' ? 'accepted' : 'declined',
  }).catch(() => undefined);
  return input.action === 'accept' ? hireFromOffer(updated) : publicApp(updated);
}
export async function respondToCounter(input: RespondToCounterInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertOwner(a, input.employerId);
  if (a.offerStatus !== 'countered') throw errors.conflict('No counter-offer to respond to.');
  if (!input.accept) return publicApp(await updateApp(a.id, { offerStatus: 'declined' }));
  const updated = await updateApp(a.id, {
    offerStatus: 'accepted',
    offerDetails: {
      ...a.offerDetails,
      wageAmount: a.offerDetails?.counterWageAmount ?? a.offerDetails?.wageAmount ?? null,
    },
  });
  return hireFromOffer(updated);
}

export async function massApply(input: MassApplyInput): Promise<MassApplyResult> {
  const results: MassApplyOutcome[] = [];
  for (const jobId of [...new Set(input.jobIds)]) {
    try {
      results.push({
        jobId,
        status: 'applied',
        application: await apply({ seekerId: input.seekerId, jobId, coverNote: input.coverNote }),
      });
    } catch (err) {
      const status = errorStatus(err);
      if (status === 'already') results.push({ jobId, status: 'already_applied' });
      else if (status === 'missing') results.push({ jobId, status: 'job_not_found' });
      else if (status === 'closed') results.push({ jobId, status: 'job_not_open' });
      else
        results.push({
          jobId,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'unknown',
        });
    }
  }
  const applied = results.filter((r) => r.status === 'applied').length,
    alreadyApplied = results.filter((r) => r.status === 'already_applied').length;
  return {
    total: results.length,
    applied,
    alreadyApplied,
    skipped: results.length - applied - alreadyApplied,
    results,
  };
}
export async function listMine(
  seekerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<PublicApplication & { job?: PublicJob }>> {
  const where = filter.status
    ? and(eq(applications.seekerId, seekerId), eq(applications.status, filter.status))
    : eq(applications.seekerId, seekerId);
  const rows = await getDb()
    .select()
    .from(applications)
    .where(where)
    .orderBy(desc(applications.createdAt))
    .limit(filter.limit);
  if (!rows.length) return [];
  const jobRows = await getDb()
    .select()
    .from(jobs)
    .where(inArray(jobs.id, [...new Set(rows.map((r) => r.jobId))]));
  const employerRows = await getDb()
    .select({
      id: users.id,
      name: users.name,
      isVerified: users.isVerified,
      photoUrl: users.photoUrl,
      companyName: users.companyName,
    })
    .from(users)
    .where(inArray(users.id, [...new Set(jobRows.map((j) => j.employerId))]));
  const employerMap = new Map(employerRows.map((e) => [e.id, e]));
  const jobMap = new Map(
    jobRows.map((j) => [j.id, toPublicJob(j, { employer: employerMap.get(j.employerId) })]),
  );
  return rows.map((a) => ({ ...publicApp(a), job: jobMap.get(a.jobId) }));
}
export async function findById(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication & { job?: PublicJob }> {
  const [a] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.seekerId, seekerId)))
    .limit(1);
  if (!a) throw errors.applicationNotFound();
  const [job] = await getDb().select().from(jobs).where(eq(jobs.id, a.jobId)).limit(1);
  const [employer] = job
    ? await getDb()
        .select({
          id: users.id,
          name: users.name,
          isVerified: users.isVerified,
          photoUrl: users.photoUrl,
          companyName: users.companyName,
        })
        .from(users)
        .where(eq(users.id, job.employerId))
        .limit(1)
    : [];
  return { ...publicApp(a), job: job ? toPublicJob(job, { employer }) : undefined };
}
export async function withdraw(
  seekerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const a = await getApp(applicationId);
  assertSeeker(a, seekerId);
  if (a.status === 'withdrawn' || a.status === 'rejected' || a.status === 'hired')
    throw errors.applicationInvalidTransition(a.status as PublicApplication['status'], 'withdrawn');
  const updated = await updateApp(a.id, { status: 'withdrawn', withdrawnAt: new Date() });
  void (async () => {
    const [job] = await getDb()
      .select({ count: jobs.applicantsCount })
      .from(jobs)
      .where(eq(jobs.id, a.jobId))
      .limit(1);
    await getDb()
      .update(jobs)
      .set({ applicantsCount: Math.max(0, (job?.count ?? 0) - 1) })
      .where(eq(jobs.id, a.jobId));
  })().catch((err) => logger.warn({ err, jobId: a.jobId }, 'applicantsCount decrement failed'));
  emit(updated, 'withdrawn', updated.withdrawnAt!);
  return publicApp(updated);
}

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
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
  const a = await getApp(applicationId);
  assertOwner(a, employerId);
  if (!(ALLOWED[a.status] ?? []).includes(next))
    throw errors.applicationInvalidTransition(a.status, next);
  const now = new Date();
  const values: Partial<typeof applications.$inferInsert> = { status: next };
  if (next === 'viewed') values.viewedAt = now;
  if (next === 'shortlisted') values.shortlistedAt = now;
  if (next === 'rejected') {
    values.rejectedAt = now;
    const [j, s] = await Promise.all([
      getDb().select({ skills: jobs.skills }).from(jobs).where(eq(jobs.id, a.jobId)).limit(1),
      getDb().select({ skills: users.skills }).from(users).where(eq(users.id, a.seekerId)).limit(1),
    ]);
    values.rejectionReasons = (j[0]?.skills ?? []).filter(
      (skill) => !(s[0]?.skills ?? []).includes(skill),
    );
  }
  if (next === 'hired') values.hiredAt = now;
  const updated = await updateApp(a.id, values);
  if (next === 'hired') {
    const [job] = await getDb().select().from(jobs).where(eq(jobs.id, a.jobId)).limit(1);
    if (job) {
      void getDb().update(jobs).set({ status: 'filled' }).where(eq(jobs.id, a.jobId));
      void walletService
        .creditOnHire({
          userId: a.seekerId,
          applicationId: a.id,
          jobId: a.jobId,
          amount: job.payAmount,
          jobTitle: job.title,
        })
        .catch((err) => logger.warn({ err }, 'wallet credit failed'));
    }
  }
  emit(updated, next, now);
  void sendApplicationStatusPush({
    recipientId: a.seekerId,
    status: next,
    applicationId: a.id,
  }).catch(() => undefined);
  return publicApp(updated);
}

async function autoBackfill(declined: AppRow): Promise<void> {
  const candidates = await getDb()
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.jobId, declined.jobId),
        inArray(applications.status, ['shortlisted', 'viewed', 'pending']),
      ),
    )
    .orderBy(asc(applications.appliedAt));
  const rank: Record<ApplicationStatus, number> = {
    shortlisted: 0,
    viewed: 1,
    pending: 2,
    rejected: 9,
    hired: 9,
    withdrawn: 9,
  };
  const next = candidates
    .filter((a) => a.id !== declined.id && a.offerStatus !== 'pending')
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))[0];
  if (next) await makeOffer({ employerId: next.employerId, applicationId: next.id, ttlHours: 12 });
}

interface ApplicantListEntry extends PublicApplication {
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    location: { city: string | null; area: string | null } | null;
    resumeUrl: string | null;
    resumeFilename: string | null;
    resumeMimeType: string | null;
    resumeSizeBytes: number | null;
    resumeUploadedAt: string | null;
    workHistory: Array<{
      company: string;
      role: string;
      startDate: string;
      endDate: string | null;
      current: boolean;
      description: string | null;
    }>;
    workPhotos: [];
    skillDocuments: [];
    constitution: {
      maxDistanceKm: number | null;
      noNightShifts: boolean;
      noSundays: boolean;
      requiresPpe: boolean;
      requiresContract: boolean;
    };
  };
}
function seekerView(s: typeof users.$inferSelect): NonNullable<ApplicantListEntry['seeker']> {
  return {
    id: s.id,
    name: s.name,
    photoUrl: s.photoUrl ?? null,
    skills: s.skills ?? [],
    isVerified: s.isVerified,
    location: s.location ? { city: s.location.city, area: s.location.area } : null,
    resumeUrl: s.resumeUrl ?? null,
    resumeFilename: s.resumeFilename ?? null,
    resumeMimeType: s.resumeMimeType ?? null,
    resumeSizeBytes: s.resumeSizeBytes ?? null,
    resumeUploadedAt: iso(s.resumeUploadedAt),
    workHistory: s.workHistory ?? [],
    workPhotos: [],
    skillDocuments: [],
    constitution: s.constitution,
  };
}
async function applicantRows(
  where: SQL<unknown> | undefined,
  limit: number,
): Promise<ApplicantListEntry[]> {
  const rows = await getDb()
    .select()
    .from(applications)
    .where(where)
    .orderBy(desc(applications.createdAt))
    .limit(limit);
  const seekers = rows.length
    ? await getDb()
        .select()
        .from(users)
        .where(inArray(users.id, [...new Set(rows.map((r) => r.seekerId))]))
    : [];
  const map = new Map(seekers.map((s) => [s.id, seekerView(s)]));
  return rows.map((a) => ({ ...publicApp(a), seeker: map.get(a.seekerId) }));
}
export async function listApplicantsForEmployer(
  employerId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<Array<ApplicantListEntry & { job?: PublicJob }>> {
  const where = filter.status
    ? and(eq(applications.employerId, employerId), eq(applications.status, filter.status))
    : eq(applications.employerId, employerId);
  const rows = await applicantRows(where, filter.limit);
  const js = rows.length
    ? await getDb()
        .select()
        .from(jobs)
        .where(
          inArray(
            jobs.id,
            rows.map((r) => r.jobId),
          ),
        )
    : [];
  const employerRows = js.length
    ? await getDb()
        .select({
          id: users.id,
          name: users.name,
          isVerified: users.isVerified,
          photoUrl: users.photoUrl,
          companyName: users.companyName,
        })
        .from(users)
        .where(inArray(users.id, [...new Set(js.map((j) => j.employerId))]))
    : [];
  const employerMap = new Map(employerRows.map((e) => [e.id, e]));
  const map = new Map(
    js.map((j) => [j.id, toPublicJob(j, { employer: employerMap.get(j.employerId) })]),
  );
  return rows.map((r) => ({ ...r, job: map.get(r.jobId) }));
}
export async function listApplicantsForJob(
  employerId: string,
  jobId: string,
  filter: { status?: ApplicationStatus; limit: number },
): Promise<ApplicantListEntry[]> {
  const [job] = await getDb()
    .select({ employerId: jobs.employerId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw errors.jobNotFound();
  if (job.employerId !== employerId) throw errors.forbidden();
  const base = and(eq(applications.jobId, jobId), eq(applications.employerId, employerId));
  return applicantRows(
    filter.status ? and(base, eq(applications.status, filter.status)) : base,
    filter.limit,
  );
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<PublicApplication> {
  const a = await getApp(input.applicationId);
  assertOwner(a, input.employerId);
  const at = new Date(input.scheduledFor),
    now = new Date(),
    kind = a.interviewStatus === 'scheduled' ? 'rescheduled' : 'scheduled';
  const updated = await updateApp(a.id, {
    interviewAt: at,
    interviewMode: input.mode,
    interviewStatus: 'scheduled',
    interviewDetails: {
      location: input.location ?? null,
      meetingLink: input.meetingLink ?? null,
      notes: input.notes ?? null,
      scheduledAt: now.toISOString(),
      cancelledAt: null,
      reminderSentAt: null,
    },
  });
  emitToUser(a.seekerId, 'application:interview', {
    applicationId: a.id,
    kind,
    interview: publicApp(updated).interview,
  });
  void sendInterviewPush({
    recipientId: a.seekerId,
    kind,
    applicationId: a.id,
    whenIso: at.toISOString(),
  }).catch(() => undefined);
  return publicApp(updated);
}
export async function cancelInterview(
  employerId: string,
  applicationId: string,
): Promise<PublicApplication> {
  const a = await getApp(applicationId);
  assertOwner(a, employerId);
  if (a.interviewStatus !== 'scheduled') return publicApp(a);
  const updated = await updateApp(a.id, {
    interviewStatus: 'cancelled',
    interviewDetails: { ...a.interviewDetails, cancelledAt: new Date().toISOString() },
  });
  emitToUser(a.seekerId, 'application:interview', {
    applicationId: a.id,
    kind: 'cancelled',
    interview: null,
  });
  return publicApp(updated);
}

function isUnique(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
function errorStatus(err: unknown): 'already' | 'missing' | 'closed' | 'other' {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  if (message.includes('already')) return 'already';
  if (message.includes('not found')) return 'missing';
  if (message.includes('not open')) return 'closed';
  return 'other';
}
