/**
 * Applications endpoints.
 */

import { apiRequest } from './client';
import type { ApplicationStatus, PublicApplication } from './types';

export interface ApplicantEntry extends PublicApplication {
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    location: { city: string | null; area: string | null } | null;
  };
}

export interface ApplyPayload {
  coverNote?: string;
}

export const applicationsApi = {
  apply: (jobId: string, body: ApplyPayload = {}) =>
    apiRequest<{ application: PublicApplication }>(`/jobs/${jobId}/apply`, {
      method: 'POST',
      body,
    }),

  listMine: (params: { status?: ApplicationStatus; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<{ applications: PublicApplication[] }>(
      `/applications/me${qs ? `?${qs}` : ''}`,
    );
  },

  detail: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(`/applications/${applicationId}`),

  withdraw: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/withdraw`,
      { method: 'POST' },
    ),

  // ─── Employer (Phase 3) ────────────────────────────────────────────────────

  listForJob: (jobId: string, params: { status?: ApplicationStatus; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<{ applications: ApplicantEntry[] }>(
      `/jobs/${jobId}/applicants${qs ? `?${qs}` : ''}`,
    );
  },

  listForEmployer: (params: { status?: ApplicationStatus; limit?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return apiRequest<{ applications: ApplicantEntry[] }>(
      `/applications/employer${qs ? `?${qs}` : ''}`,
    );
  },

  markViewed: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/view`,
      { method: 'POST' },
    ),

  shortlist: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/shortlist`,
      { method: 'POST' },
    ),

  reject: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/reject`,
      { method: 'POST' },
    ),

  hire: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/hire`,
      { method: 'POST' },
    ),
};
