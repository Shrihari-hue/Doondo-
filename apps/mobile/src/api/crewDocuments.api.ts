/**
 * Crew document-expiry tracking — licences/certs + lapse warnings.
 */

import { apiRequest } from './client';

export interface CrewDocument {
  id: string;
  workerId: string;
  label: string;
  expiresAt: string;
}

export interface ExpiringDocument extends CrewDocument {
  workerName: string;
  expired: boolean;
}

export const crewDocumentsApi = {
  list: (workerId: string) =>
    apiRequest<{ documents: CrewDocument[] }>(`/crew-documents?workerId=${workerId}`),

  add: (input: { workerId: string; label: string; expiresAt: string }) =>
    apiRequest<{ document: CrewDocument }>('/crew-documents', {
      method: 'POST',
      body: input,
    }),

  remove: (id: string) =>
    apiRequest<{ removed: boolean }>(`/crew-documents/${id}`, { method: 'DELETE' }),

  expiring: () =>
    apiRequest<{ documents: ExpiringDocument[] }>('/crew-documents/expiring'),
};
