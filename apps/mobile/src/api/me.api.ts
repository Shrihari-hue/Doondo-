/**
 * /me endpoints — profile + location updates for the authenticated user.
 */

import { apiRequest } from './client';
import type {
  Availability,
  BusinessType,
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
    period: 'hour' | 'day' | 'week' | 'month' | 'fixed';
    currency: string;
  } | null;
  /** data:image/...;base64 string, or null to clear. */
  photoUrl?: string | null;
  /**
   * Replace the seeker's work-sample photos. Up to 6 base64 data URLs.
   * Empty array clears. Omit to leave unchanged.
   */
  workPhotos?: string[];
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
};

// Re-export so screens can `import type { WorkExperience }` from one file.
export type { WorkExperience };
