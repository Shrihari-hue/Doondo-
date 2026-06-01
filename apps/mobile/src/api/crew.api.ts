/**
 * My crew — saved workers for one-tap re-hire, plus contact import.
 */

import { apiRequest } from './client';

export interface CrewWorker {
  id: string;
  name: string;
  photoUrl: string | null;
  skills: string[];
  isVerified: boolean;
}

export interface ContactInput {
  name: string;
  phone: string;
}

export interface ImportResult {
  added: CrewWorker[];
  notOnDoondo: ContactInput[];
}

export const crewApi = {
  list: () => apiRequest<{ workers: CrewWorker[] }>('/crew'),

  import: (contacts: ContactInput[]) =>
    apiRequest<ImportResult>('/crew/import', {
      method: 'POST',
      body: { contacts },
    }),

  remove: (workerId: string) =>
    apiRequest<{ removed: boolean }>(`/crew/${workerId}`, { method: 'DELETE' }),

  /** Fire a direct offer to a crew member for one of your active jobs. */
  rehire: (workerId: string, jobId: string) =>
    apiRequest<{ application: { id: string } }>(`/crew/${workerId}/rehire`, {
      method: 'POST',
      body: { jobId },
    }),
};
