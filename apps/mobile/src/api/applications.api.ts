/**
 * Applications endpoints.
 */

import { apiRequest } from './client';
import type {
  ApplicationStatus,
  InterviewMode,
  PublicApplication,
  WorkExperience,
} from './types';

export interface SchedulePayload {
  /** ISO 8601 datetime in the future. */
  scheduledFor: string;
  mode: InterviewMode;
  /** Required when mode === 'in_person'. */
  location?: string;
  /** Required when mode === 'video'. Must be a URL. */
  meetingLink?: string;
  notes?: string;
}

export interface ApplicantEntry extends PublicApplication {
  seeker?: {
    id: string;
    name: string;
    photoUrl: string | null;
    skills: string[];
    isVerified: boolean;
    location: { city: string | null; area: string | null } | null;
    /** Resume metadata + data URL (present when the seeker uploaded one). */
    resumeUrl: string | null;
    resumeFilename: string | null;
    resumeMimeType: string | null;
    resumeSizeBytes: number | null;
    resumeUploadedAt: string | null;
    /** Work history entries from the Resume Builder (may be empty). */
    workHistory: WorkExperience[];
    /** Photos of the seeker's work (may be empty). */
    workPhotos: string[];
  };
}

export interface ApplyPayload {
  coverNote?: string;
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

export const applicationsApi = {
  apply: (jobId: string, body: ApplyPayload = {}) =>
    apiRequest<{ application: PublicApplication }>(`/jobs/${jobId}/apply`, {
      method: 'POST',
      body,
    }),

  /**
   * One-tap "I'm interested" — same effect as apply() with no cover note
   * but flagged on the backend so employers can prioritise these. Used
   * by the Today-mode CTA on JobDetail.
   */
  expressInterest: (jobId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/jobs/${jobId}/express-interest`,
      { method: 'POST' },
    ),

  /**
   * Submit up to 20 applications in one call. Returns a per-job result
   * array — caller renders successes + skipped reasons in a results sheet.
   */
  massApply: (jobIds: string[], coverNote?: string) =>
    apiRequest<MassApplyResult>(`/applications/mass-apply`, {
      method: 'POST',
      body: { jobIds, ...(coverNote ? { coverNote } : {}) },
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

  // ─── Interview scheduling ──────────────────────────────────────────────────

  /**
   * Schedule (or reschedule) an interview on this application. POSTing
   * twice replaces the previous interview — there's only ever one active.
   */
  scheduleInterview: (applicationId: string, body: SchedulePayload) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/interview`,
      { method: 'POST', body },
    ),

  cancelInterview: (applicationId: string) =>
    apiRequest<{ application: PublicApplication }>(
      `/applications/${applicationId}/interview`,
      { method: 'DELETE' },
    ),
};
