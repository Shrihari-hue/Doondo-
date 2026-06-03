/**
 * Monthly statement — consolidated worked-hours + settled-pay roll-up.
 * The screen turns this into a shareable PDF.
 */

import { apiRequest } from './client';

export interface StatementRow {
  workerId: string;
  name: string;
  shifts: number;
  minutes: number;
  days: number;
  paidPaise: number;
}

export interface StatementResult {
  month: string;
  employerName: string;
  rows: StatementRow[];
  totals: {
    workerCount: number;
    totalMinutes: number;
    totalShifts: number;
    totalPaidPaise: number;
  };
}

export const statementApi = {
  get: (month?: string) =>
    apiRequest<StatementResult>(`/statement${month ? `?month=${month}` : ''}`),
};
