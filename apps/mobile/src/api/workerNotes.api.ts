/**
 * Worker-notes endpoint — strongly-typed wrapper around apiRequest.
 *
 * A private, employer-only note pinned to a worker ("great with
 * customers, bring back for weekends"). Never shown to the worker, never
 * affects their score — it just makes My Crew and re-hire decisions real
 * instead of memory-based.
 *
 *   get(workerId)          — read this employer's note for a worker
 *   save(workerId, note)   — create or replace it (upsert)
 *   clear(workerId)        — remove it
 */

import { apiRequest } from './client';

export interface WorkerNote {
  workerId: string;
  /** The note text. Empty string when nothing is saved. */
  note: string;
  /** ISO timestamp of the last edit, or null when unset. */
  updatedAt: string | null;
}

export const workerNotesApi = {
  get: (workerId: string) =>
    apiRequest<WorkerNote>(`/worker-notes/${workerId}`),

  save: (workerId: string, note: string) =>
    apiRequest<WorkerNote>(`/worker-notes/${workerId}`, {
      method: 'PUT',
      body: { note },
    }),

  clear: (workerId: string) =>
    apiRequest<WorkerNote>(`/worker-notes/${workerId}`, {
      method: 'DELETE',
    }),
};
