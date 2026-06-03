/**
 * Job-site briefing — pre-arrival instructions + photos for hired workers.
 */

import { apiRequest } from './client';

export interface SiteBriefing {
  text: string;
  photoUrls: string[];
  audioUrl: string | null;
  exists: boolean;
}

export const siteBriefingApi = {
  get: (jobId: string) => apiRequest<SiteBriefing>(`/site-briefing/${jobId}`),

  save: (jobId: string, input: { text: string; photoDataUrls?: string[] }) =>
    apiRequest<SiteBriefing>(`/site-briefing/${jobId}`, {
      method: 'PUT',
      body: input,
    }),
};
