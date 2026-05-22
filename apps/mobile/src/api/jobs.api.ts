/**
 * Jobs endpoints — strongly-typed wrappers around apiRequest.
 */

import { apiRequest } from './client';
import type {
  JobStatus,
  JobType,
  PayPeriod,
  PublicJob,
  WomenSafety,
  WorkMode,
  WorkplaceAnswers,
} from './types';

export interface NearbyParams {
  lat: number;
  lng: number;
  /** meters; defaults to 5000 server-side */
  radius?: number;
  type?: JobType;
  /** Filter by where the role is performed. Omit for all modes. */
  workMode?: WorkMode;
  /** Narrow the feed to posts the employer flagged "safe for women". */
  safeForWomenOnly?: boolean;
  q?: string;
  limit?: number;
}

export interface NearbyResponse {
  jobs: PublicJob[];
  hasMore: boolean;
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface PayStatsParams {
  type: JobType;
  city: string;
  period: PayPeriod;
}

export interface PayStatsResponse {
  /** Number of contributing jobs. Hide the line on the client when < 5. */
  sampleSize: number;
  /** Lower quartile in paise. Null when sample size is too small. */
  p25: number | null;
  /** Median in paise. Null when sample size is too small. */
  p50: number | null;
  /** Upper quartile in paise. Null when sample size is too small. */
  p75: number | null;
  period: PayPeriod;
  type: JobType;
  city: string;
  currency: string;
}

export const jobsApi = {
  /**
   * "Typical pay for {type} in {city}: ₹{p25}–{p75} / {period}" — the
   * transparency line under the pay on JobDetail. Public endpoint;
   * caller decides whether to render based on `sampleSize`.
   */
  payStats: (p: PayStatsParams) =>
    apiRequest<PayStatsResponse>(
      `/jobs/pay-stats${qs({
        type: p.type,
        city: p.city,
        period: p.period,
      })}`,
      { auth: false },
    ),

  nearby: (p: NearbyParams) =>
    apiRequest<NearbyResponse>(
      `/jobs/nearby${qs({
        lat: p.lat,
        lng: p.lng,
        radius: p.radius,
        type: p.type,
        workMode: p.workMode,
        safeForWomenOnly: p.safeForWomenOnly ? '1' : undefined,
        q: p.q,
        limit: p.limit,
      })}`,
      { auth: false },
    ),

  /**
   * "60-second first match" — public, returns up to 5 jobs ranked for a
   * pre-signup seeker. Used by the FirstMatchPreview screen wedged
   * between RolePicker and Signup. `trade` biases ranking; it's not a
   * hard filter so we always have something to show.
   */
  preview: (p: {
    lat: number;
    lng: number;
    radius?: number;
    trade?: string;
    jobType?: JobType;
    limit?: number;
  }) =>
    apiRequest<{ jobs: PublicJob[] }>(
      `/jobs/preview${qs({
        lat: p.lat,
        lng: p.lng,
        radius: p.radius,
        trade: p.trade,
        jobType: p.jobType,
        limit: p.limit,
      })}`,
      { auth: false },
    ),

  /**
   * "Today" feed — urgent + freshly-posted gigs within walking distance.
   * Same response shape as nearby; the seeker home swaps between them
   * by tab. Public endpoint so the worker can browse before signing in.
   */
  today: (p: NearbyParams) =>
    apiRequest<NearbyResponse>(
      `/jobs/today${qs({
        lat: p.lat,
        lng: p.lng,
        radius: p.radius,
        type: p.type,
        q: p.q,
        limit: p.limit,
      })}`,
      { auth: false },
    ),

  /**
   * Personalised "for you" feed — auth-required. Returns the top jobs
   * scored against the seeker's resume + history. See backend service
   * recommendations.service.ts for the scoring formula.
   */
  recommended: () =>
    apiRequest<{ jobs: PublicJob[] }>('/jobs/recommended'),

  /** "This week" feed — short contracts/shifts posted in the last 7 days. */
  thisWeek: (p: NearbyParams) =>
    apiRequest<NearbyResponse>(
      `/jobs/this-week${qs({
        lat: p.lat,
        lng: p.lng,
        radius: p.radius,
        type: p.type,
        q: p.q,
        limit: p.limit,
      })}`,
      { auth: false },
    ),

  detail: (jobId: string) =>
    apiRequest<{ job: PublicJob }>(`/jobs/${jobId}`, { auth: false }),

  listSaved: () => apiRequest<{ jobs: PublicJob[] }>(`/jobs/saved`),

  save: (jobId: string) =>
    apiRequest<{ saved: boolean }>(`/jobs/${jobId}/save`, { method: 'POST' }),

  unsave: (jobId: string) =>
    apiRequest<{ saved: boolean }>(`/jobs/${jobId}/save`, { method: 'DELETE' }),

  // ─── Employer (Phase 3) ────────────────────────────────────────────────────

  listMine: (params: { status?: JobStatus; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<{ jobs: PublicJob[] }>(`/jobs/mine${qs ? `?${qs}` : ''}`);
  },

  create: (body: CreateJobPayload) =>
    apiRequest<{ job: PublicJob }>(`/jobs`, { method: 'POST', body }),

  update: (jobId: string, body: Partial<CreateJobPayload>) =>
    apiRequest<{ job: PublicJob }>(`/jobs/${jobId}`, { method: 'PATCH', body }),

  pause: (jobId: string) =>
    apiRequest<{ job: PublicJob }>(`/jobs/${jobId}/pause`, { method: 'POST' }),

  reopen: (jobId: string) =>
    apiRequest<{ job: PublicJob }>(`/jobs/${jobId}/reopen`, { method: 'POST' }),

  close: (jobId: string) =>
    apiRequest<{ job: PublicJob }>(`/jobs/${jobId}/close`, { method: 'POST' }),
};

/** Optional voice description shape — shared by create + update payloads. */
export interface JobAudioDescription {
  /** data:audio/m4a;base64,... */
  url: string;
  durationSeconds: number;
}

export interface CreateJobPayload {
  title: string;
  description: string;
  type: JobType;
  /** Where the role is performed — defaults to onsite when omitted. */
  workMode?: WorkMode;
  /** Optional employer voice note — set both fields together. */
  audioDescriptionUrl?: string | null;
  audioDescriptionDurationSeconds?: number | null;
  pay: {
    amount: number;
    amountMax?: number | null;
    period: PayPeriod;
    currency?: string;
  };
  location: {
    address: string;
    city: string;
    area?: string | null;
    pincode?: string | null;
    lat: number;
    lng: number;
  };
  skills?: string[];
  schedule?: {
    days?: number[];
    startTime?: string | null;
    endTime?: string | null;
    hoursPerDay?: number | null;
  } | null;
  /** Mark the post as time-sensitive. Defaults to false. */
  urgent?: boolean;
  /**
   * Reverse Interview — the employer's answers to standard worker
   * questions. Omit when the employer skipped the section.
   */
  workplaceAnswers?: WorkplaceAnswers;
  /**
   * "Doondo for Women" — employer-declared women-safety signals. Omit
   * when the employer left the section blank.
   */
  womenSafety?: WomenSafety;
}
