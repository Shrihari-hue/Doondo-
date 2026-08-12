/**
 * Plain-function replacement for the Mongoose `Job.toPublicJSON()` instance
 * method, now that rows come back from Drizzle/raw SQL as plain objects.
 */

import type { jobs } from '@/db/schema/jobs';
import { buildProject, type PublicJob } from './job.model';
import { computeWomenSafety } from './womenSafety';

export type JobRow = typeof jobs.$inferSelect;

export interface EmployerSummary {
  id: string;
  name: string;
  isVerified: boolean;
  photoUrl: string | null;
  companyName: string | null;
}

export interface ToPublicJobOpts {
  employer?: EmployerSummary;
  distanceMeters?: number;
  /** List/geo queries never select audioDescriptionUrl (matches the old select:false). */
  audioDescriptionUrl?: string | null;
}

export function toPublicJob(row: JobRow, opts: ToPublicJobOpts = {}): PublicJob {
  const boostedUntil = row.escalation?.boostedUntil ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    pay: {
      amount: row.payAmount,
      amountMax: row.payAmountMax ?? null,
      period: row.payPeriod,
      currency: row.payCurrency,
    },
    location: {
      address: row.address,
      city: row.city,
      area: row.area ?? null,
      pincode: row.pincode ?? null,
      coordinates: [row.geo.x, row.geo.y],
    },
    skills: row.skills ?? [],
    workMode: row.workMode ?? 'onsite',
    requiredSkillTestId: row.requiredSkillTestId ?? null,
    headcount: row.headcount ?? 1,
    crewHeadStartUntil: row.crewHeadStartUntil ? row.crewHeadStartUntil.toISOString() : null,
    recurring: Boolean(row.recurring),
    prepChecklist: row.prepChecklist ?? [],
    project: buildProject(row.projectStartDate ?? null, row.projectEndDate ?? null),
    escalationStage: row.escalation?.stage ?? 0,
    boostedUntil: boostedUntil && new Date(boostedUntil).getTime() > Date.now() ? boostedUntil : null,
    schedule: row.schedule ?? null,
    status: row.status,
    urgent: Boolean(row.urgent),
    safeForWomen: Boolean(row.safeForWomen),
    applicantsCount: row.applicantsCount ?? 0,
    audioDescriptionUrl: opts.audioDescriptionUrl ?? null,
    audioDescriptionDurationSeconds: row.audioDescriptionDurationSeconds ?? null,
    workplaceAnswers: row.workplaceAnswers ?? null,
    womenSafety: row.womenSafety ?? null,
    womenSafetyTier: computeWomenSafety(row.womenSafety ?? null).tier,
    distanceMeters: opts.distanceMeters,
    employer: opts.employer,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Raw-row shape returned by the hand-written geo queries (findNearby/findToday/findThisWeek/findFirstMatch). */
export interface RawGeoJobRow {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string;
  type: PublicJob['type'];
  pay_amount: number;
  pay_amount_max: number | null;
  pay_period: PublicJob['pay']['period'];
  pay_currency: string;
  address: string;
  city: string;
  area: string | null;
  pincode: string | null;
  lng: number;
  lat: number;
  skills: string[] | null;
  work_mode: PublicJob['workMode'];
  required_skill_test_id: string | null;
  headcount: number;
  crew_head_start_until: Date | null;
  recurring: boolean;
  prep_checklist: string[] | null;
  project_start_date: Date | null;
  project_end_date: Date | null;
  escalation: { stage: number; boostedUntil: string | null } | null;
  schedule: PublicJob['schedule'];
  status: PublicJob['status'];
  urgent: boolean;
  safe_for_women: boolean;
  applicants_count: number;
  audio_description_duration_seconds: number | null;
  workplace_answers: PublicJob['workplaceAnswers'];
  women_safety: PublicJob['womenSafety'];
  created_at: Date;
  distance_meters: number;
  employer_id: string | null;
  employer_name: string | null;
  employer_verified: boolean | null;
  employer_photo_url: string | null;
  employer_company_name: string | null;
}

/**
 * `db.execute()` (raw SQL) doesn't go through Drizzle's column-type
 * decoding, so timestamptz columns come back as ISO strings rather than
 * Date instances — unlike the query-builder path used by `toPublicJob`.
 * Tolerate both.
 */
function toISO(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function toPublicJobFromRaw(r: RawGeoJobRow): PublicJob {
  const boostedUntil = r.escalation?.boostedUntil ?? null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    pay: {
      amount: r.pay_amount,
      amountMax: r.pay_amount_max ?? null,
      period: r.pay_period,
      currency: r.pay_currency,
    },
    location: {
      address: r.address,
      city: r.city,
      area: r.area ?? null,
      pincode: r.pincode ?? null,
      coordinates: [r.lng, r.lat],
    },
    skills: r.skills ?? [],
    workMode: r.work_mode ?? 'onsite',
    requiredSkillTestId: r.required_skill_test_id ?? null,
    headcount: r.headcount ?? 1,
    crewHeadStartUntil: toISO(r.crew_head_start_until),
    recurring: Boolean(r.recurring),
    prepChecklist: r.prep_checklist ?? [],
    project: buildProject(r.project_start_date ?? null, r.project_end_date ?? null),
    escalationStage: r.escalation?.stage ?? 0,
    boostedUntil: boostedUntil && new Date(boostedUntil).getTime() > Date.now() ? boostedUntil : null,
    schedule: r.schedule ?? null,
    status: r.status,
    urgent: Boolean(r.urgent),
    safeForWomen: Boolean(r.safe_for_women),
    applicantsCount: r.applicants_count ?? 0,
    // Geo/list queries never select audio_description_url — matches the old select:false.
    audioDescriptionUrl: null,
    audioDescriptionDurationSeconds: r.audio_description_duration_seconds ?? null,
    workplaceAnswers: r.workplace_answers ?? null,
    womenSafety: r.women_safety ?? null,
    womenSafetyTier: computeWomenSafety(r.women_safety ?? null).tier,
    distanceMeters: Math.round(r.distance_meters),
    employer: r.employer_id
      ? {
          id: r.employer_id,
          name: r.employer_name ?? '',
          isVerified: Boolean(r.employer_verified),
          photoUrl: r.employer_photo_url ?? null,
          companyName: r.employer_company_name ?? null,
        }
      : undefined,
    createdAt: toISO(r.created_at)!,
  };
}
