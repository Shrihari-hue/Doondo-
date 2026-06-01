/**
 * Timesheet — per-worker monthly worked hours, from shift check-ins.
 */

import { apiRequest } from './client';

export interface TimesheetWorker {
  workerId: string;
  name: string;
  photoUrl: string | null;
  totalMinutes: number;
  shifts: number;
  days: number;
}

export interface TimesheetResult {
  month: string;
  workers: TimesheetWorker[];
}

export const timesheetApi = {
  get: (month?: string) =>
    apiRequest<TimesheetResult>(`/timesheet${month ? `?month=${month}` : ''}`),
};
