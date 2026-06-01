/**
 * Weekly roster — the employer's recurring shifts and who's filling each.
 */

import { apiRequest } from './client';

export interface RosterWorker {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface RosterEntry {
  jobId: string;
  title: string;
  /** Weekdays the shift repeats on (0 = Sun … 6 = Sat). */
  days: number[];
  startTime: string | null;
  workers: RosterWorker[];
}

export const rosterApi = {
  list: () => apiRequest<{ entries: RosterEntry[] }>('/roster'),
};
