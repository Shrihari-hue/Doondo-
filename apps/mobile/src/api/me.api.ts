/**
 * /me endpoints — profile + location updates for the authenticated user.
 */

import { apiRequest } from './client';
import type {
  Availability,
  BusinessType,
  CraftPhoto,
  JobType,
  PublicUser,
  WorkExperience,
} from './types';

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  bio?: string | null;
  experienceYears?: number | null;
  availability?: Availability | null;
  preferredJobTypes?: JobType[];
  skills?: string[];
  workType?: 'solo' | 'team' | null;
  teamSize?: number | null;
  /**
   * Desired pay. Pass null to clear. `amount` is in minor units (paise
   * for INR) to match Job.pay.
   */
  expectedSalary?: {
    amount: number;
    /** Optional upper bound. Omit/null for single-number expectations. */
    amountMax?: number | null;
    period: 'hour' | 'day' | 'week' | 'month' | 'fixed';
    currency: string;
  } | null;
  /** data:image/...;base64 string, or null to clear. */
  photoUrl?: string | null;
  /**
   * Replace the seeker's work-sample photos. Up to 6 entries, each tagged
   * to a craft skill. Empty array clears. Omit to leave unchanged.
   */
  workPhotos?: CraftPhoto[];
  /** Replace the seeker's education list. Empty array clears. */
  education?: Array<{
    degree: string;
    institution: string;
    fieldOfStudy?: string | null;
    startYear: number;
    endYear?: number | null;
    current?: boolean;
  }>;
  companyName?: string | null;
  businessType?: BusinessType | null;
  gstin?: string | null;
}

export interface UpdateLocationPayload {
  city: string;
  area?: string | null;
  pincode?: string | null;
  lat: number;
  lng: number;
}

export type ResumeMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/msword';

export interface UploadResumePayload {
  /** data:application/pdf;base64,... or DOCX equivalent */
  dataUrl: string;
  filename: string;
  mimeType: ResumeMimeType;
  sizeBytes: number;
}

/**
 * Resume Builder entries. The client sends `current: true` instead of
 * an endDate for the currently-held job; the server normalises endDate
 * to null in that case.
 */
export interface WorkHistoryEntryInput {
  company: string;
  role: string;
  startDate: string; // YYYY-MM
  endDate?: string | null; // YYYY-MM; omit/null when current
  current: boolean;
  description?: string | null;
}

export interface UpdateWorkHistoryPayload {
  entries: WorkHistoryEntryInput[];
}

/** One re-worded work-history line from a Smart Resume rewrite. */
export interface TailoredWorkBlurb {
  company: string;
  role: string;
  blurb: string;
}

/** Smart Resume — the worker's resume tailored to one specific job. */
export interface TailoredResume {
  /** The job this resume was tailored for. */
  jobTitle: string;
  /** A 2-3 sentence summary tuned to the target job. */
  summary: string;
  /** The worker's skills, re-ordered most-relevant-first for this job. */
  highlightedSkills: string[];
  /** Which of the job's required skills the worker already has. */
  matchedSkills: string[];
  /** Job-required skills the worker doesn't have yet — drives a course nudge. */
  missingSkills: string[];
  /** Job-tuned one-liners, one per work-history entry. */
  workBlurbs: TailoredWorkBlurb[];
  /** A short, encouraging note on why the worker fits. */
  pitch: string;
  /** Which provider produced this — 'anthropic' or 'mock'. */
  provider: string;
}

export const meApi = {
  updateProfile: (body: UpdateProfilePayload) =>
    apiRequest<{ user: PublicUser }>(`/me/profile`, { method: 'PATCH', body }),

  updateLocation: (body: UpdateLocationPayload) =>
    apiRequest<{ user: PublicUser }>(`/me/location`, { method: 'POST', body }),

  updateEmployerLocation: (body: UpdateLocationPayload) =>
    apiRequest<{ user: PublicUser }>(`/me/employer-location`, { method: 'POST', body }),

  registerPushToken: (token: string) =>
    apiRequest<{ registered: boolean }>(`/me/push-token`, {
      method: 'POST',
      body: { token },
    }),

  clearPushToken: (token: string) =>
    apiRequest<{ cleared: boolean }>(`/me/push-token`, {
      method: 'DELETE',
      body: { token },
    }),

  uploadResume: (body: UploadResumePayload) =>
    apiRequest<{ user: PublicUser }>(`/me/resume`, { method: 'POST', body }),

  removeResume: () =>
    apiRequest<{ user: PublicUser }>(`/me/resume`, { method: 'DELETE' }),

  updateWorkHistory: (body: UpdateWorkHistoryPayload) =>
    apiRequest<{ user: PublicUser }>(`/me/work-history`, { method: 'PUT', body }),

  /**
   * Sync the worker's preferred app language to the server. Drives
   * in-chat auto-translation — incoming messages are translated into
   * this locale. Called by LanguageProvider whenever the UI language
   * changes (and once after login).
   */
  updateLocale: (locale: 'en' | 'hi' | 'ta' | 'te' | 'kn') =>
    apiRequest<{ locale: string }>(`/me/locale`, {
      method: 'PUT',
      body: { locale },
    }),

  /**
   * Smart Resume — get the worker's resume tailored to one job. Returns
   * the previously-saved version when one exists (`saved: true`),
   * otherwise a freshly-generated draft.
   */
  tailorResume: (jobId: string) =>
    apiRequest<{ resume: TailoredResume; saved: boolean }>(`/me/resume/tailor`, {
      method: 'POST',
      body: { jobId },
    }),

  /**
   * Attach a proof file (certificate, licence, photo) to a skill. The
   * file is pushed to cloud storage; the returned user carries the new
   * `skillDocuments` entry.
   */
  uploadSkillDocument: (payload: {
    skill: string;
    dataUrl: string;
    fileName: string;
    mimeType: string;
  }) =>
    apiRequest<{ user: PublicUser }>(`/me/skill-documents`, {
      method: 'POST',
      body: payload,
    }),

  /** Remove one skill-proof file by id. */
  deleteSkillDocument: (id: string) =>
    apiRequest<{ user: PublicUser }>(`/me/skill-documents/${id}`, {
      method: 'DELETE',
    }),

  /**
   * Save the worker's reviewed/edited tailored resume for one job. The
   * apply path snapshots it onto the application so the employer sees it.
   */
  saveTailoredResume: (
    jobId: string,
    payload: {
      summary: string;
      pitch: string;
      highlightedSkills: string[];
      matchedSkills: string[];
      workBlurbs: TailoredWorkBlurb[];
      provider?: string;
    },
  ) =>
    apiRequest<{ resume: { jobId: string; updatedAt: string } }>(
      `/me/resume/tailored/${jobId}`,
      { method: 'PUT', body: payload },
    ),
};

// Re-export so screens can `import type { WorkExperience }` from one file.
export type { WorkExperience };
