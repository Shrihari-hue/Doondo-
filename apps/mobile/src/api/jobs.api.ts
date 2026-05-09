/**
 * Jobs endpoints — strongly-typed wrappers around apiRequest.
 */

import { apiRequest } from './client';
import type { JobStatus, JobType, PayPeriod, PublicJob } from './types';

export interface NearbyParams {
  lat: number;
  lng: number;
  /** meters; defaults to 5000 server-side */
  radius?: number;
  type?: JobType;
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

export const jobsApi = {
  nearby: (p: NearbyParams) =>
    apiRequest<NearbyResponse>(
      `/jobs/nearby${qs({
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

export interface CreateJobPayload {
  title: string;
  description: string;
  type: JobType;
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
}
