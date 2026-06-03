/**
 * Worker "My Job" hub — attendance + payslip rollups for the seeker.
 * The active-employers list, payment status, schedule, employer trust
 * panel and ratings are assembled client-side from existing endpoints.
 */

import { apiRequest } from './client';

export interface AttendanceEmployer {
  employerId: string;
  employerName: string;
  minutes: number;
  shifts: number;
  days: number;
}

export interface WorkerAttendance {
  month: string;
  totalMinutes: number;
  totalShifts: number;
  totalDays: number;
  byEmployer: AttendanceEmployer[];
}

export interface WorkerPayslip {
  month: string;
  workerName: string;
  employerName: string;
  shifts: number;
  minutes: number;
  days: number;
  paidPaise: number;
}

export const workerJobApi = {
  attendance: (month?: string) =>
    apiRequest<WorkerAttendance>(`/my-job/attendance${month ? `?month=${month}` : ''}`),

  payslip: (employerId: string, month?: string) => {
    const q = new URLSearchParams({ employerId });
    if (month) q.set('month', month);
    return apiRequest<WorkerPayslip>(`/my-job/payslip?${q.toString()}`);
  },
};
