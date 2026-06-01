/**
 * In-shift incident log — private, timestamped employer notes about a
 * worker (optional photo). Never shown to the worker.
 */

import { apiRequest } from './client';

export interface Incident {
  id: string;
  note: string;
  photoUrl: string | null;
  createdAt: string;
}

export const incidentsApi = {
  list: (workerId: string) =>
    apiRequest<{ incidents: Incident[] }>(`/incidents?workerId=${workerId}`),

  log: (input: {
    workerId: string;
    applicationId?: string;
    note: string;
    photoDataUrl?: string;
  }) =>
    apiRequest<{ incident: Incident }>('/incidents', {
      method: 'POST',
      body: input,
    }),
};
