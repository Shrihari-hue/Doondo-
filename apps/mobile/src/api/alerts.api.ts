/**
 * Job Alerts API — the seeker's saved-search criteria.
 *
 * Backed by /api/v1/me/alerts. The server fans out push + in-app
 * notifications whenever a freshly-posted job matches one of these
 * alerts, deep-linking the user straight to JobDetail.
 */

import { apiRequest } from './client';
import type { JobType } from './types';

export interface PublicJobAlert {
  id: string;
  name: string;
  query: string | null;
  city: string | null;
  jobTypes: JobType[];
  urgentOnly: boolean;
  radiusKm: number | null;
  coordinates: [number, number] | null;
  enabled: boolean;
  lastMatchedJobId: string | null;
  lastMatchedAt: string | null;
  matchCount: number;
  createdAt: string;
}

export interface UpsertJobAlertPayload {
  name: string;
  query?: string | null;
  city?: string | null;
  jobTypes?: JobType[];
  urgentOnly?: boolean;
  radiusKm?: number | null;
  coordinates?: [number, number] | null;
  enabled?: boolean;
}

export const alertsApi = {
  list: () => apiRequest<{ alerts: PublicJobAlert[] }>('/me/alerts'),

  create: (body: UpsertJobAlertPayload) =>
    apiRequest<{ alert: PublicJobAlert }>('/me/alerts', {
      method: 'POST',
      body,
    }),

  update: (id: string, body: Partial<UpsertJobAlertPayload>) =>
    apiRequest<{ alert: PublicJobAlert }>(`/me/alerts/${id}`, {
      method: 'PATCH',
      body,
    }),

  remove: (id: string) =>
    apiRequest<{ deleted: true }>(`/me/alerts/${id}`, { method: 'DELETE' }),
};
