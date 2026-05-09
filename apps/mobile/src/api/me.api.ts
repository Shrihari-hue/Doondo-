/**
 * /me endpoints — profile + location updates for the authenticated user.
 */

import { apiRequest } from './client';
import type { Availability, BusinessType, JobType, PublicUser } from './types';

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
  /** data:image/...;base64 string, or null to clear. */
  photoUrl?: string | null;
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
};
