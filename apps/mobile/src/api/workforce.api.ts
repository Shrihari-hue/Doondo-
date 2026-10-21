/**
 * Workforce — real per-worker numbers for the employer's team screens
 * (attendance from shift check-ins, leave days, pay history, Doondo Score).
 */

import { apiRequest } from './client';

export type DayStatus = 'present' | 'late' | 'leave' | 'absent' | 'off' | 'before_hire' | 'future';

export interface AttendanceStats {
  percent: number | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  workingDays: number;
}

export interface WorkerSummary {
  applicationId: string;
  seekerId: string;
  displayId: string;
  hiredAt: string | null;
  endedAt: string | null;
  score: number | null;
  attendance: AttendanceStats;
  today: { date: string; checkInAt: string | null; checkOutAt: string | null; onLeave: boolean };
  lastPaidAt: string | null;
}

export interface WorkerDetail extends WorkerSummary {
  /** Weekdays worked (0 = Sun) and scheduled IST start, from the job. */
  pattern: { days: number[]; startTime: string | null };
  range: { startDay: string; endDay: string };
  calendar: Array<{ date: string; status: DayStatus }>;
  shifts: Array<{ date: string; checkInAt: string; checkOutAt: string | null; minutes: number | null }>;
  activity: Array<{
    at: string;
    kind: 'check_in' | 'check_out' | 'work_proof' | 'payment' | 'leave' | 'hired';
    label: string;
  }>;
  payments: Array<{ id: string; amountPaise: number; status: string; createdAt: string; paidAt: string | null }>;
  totals: { paidPaise: number; pendingPaise: number };
  leaves: Array<{ date: string; reason: string | null }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';
export interface WorkerTask {
  id: string;
  applicationId: string;
  title: string;
  location: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  jobTitle?: string | null;
}
export interface WorkerReview {
  month: string;
  punctuality: number;
  quality: number;
  attitude: number;
  notes: string;
  updatedAt: string;
}

export const workforceApi = {
  // ── Tasks ──
  tasks: (applicationId: string) =>
    apiRequest<{ tasks: WorkerTask[] }>(`/workforce/${applicationId}/tasks`).then((r) => r.tasks),
  createTask: (
    applicationId: string,
    body: { title: string; location?: string | null; dueDate?: string | null; priority?: TaskPriority },
  ) =>
    apiRequest<{ task: WorkerTask }>(`/workforce/${applicationId}/tasks`, { method: 'POST', body }).then((r) => r.task),
  updateTask: (taskId: string, body: Partial<Pick<WorkerTask, 'status' | 'title' | 'priority' | 'dueDate' | 'location'>>) =>
    apiRequest<{ task: WorkerTask }>(`/workforce/tasks/${taskId}`, { method: 'PATCH', body }).then((r) => r.task),
  deleteTask: (taskId: string) =>
    apiRequest<{ removed: boolean }>(`/workforce/tasks/${taskId}`, { method: 'DELETE' }),
  /** Worker side — tasks assigned to me across my jobs. */
  myTasks: () => apiRequest<{ tasks: WorkerTask[] }>('/workforce/my-tasks').then((r) => r.tasks),
  updateMyTask: (taskId: string, status: TaskStatus) =>
    apiRequest<{ task: WorkerTask }>(`/workforce/my-tasks/${taskId}`, { method: 'PATCH', body: { status } }).then(
      (r) => r.task,
    ),

  // ── Private monthly reviews ──
  review: (applicationId: string, month: string) =>
    apiRequest<{ review: WorkerReview | null }>(`/workforce/${applicationId}/reviews?month=${month}`).then(
      (r) => r.review,
    ),
  reviews: (applicationId: string) =>
    apiRequest<{ reviews: WorkerReview[] }>(`/workforce/${applicationId}/reviews`).then((r) => r.reviews),
  saveReview: (
    applicationId: string,
    body: { month: string; punctuality: number; quality: number; attitude: number; notes?: string },
  ) =>
    apiRequest<{ review: WorkerReview }>(`/workforce/${applicationId}/reviews`, { method: 'PUT', body }).then(
      (r) => r.review,
    ),


  list: (days = 30) =>
    apiRequest<{ workers: WorkerSummary[] }>(`/workforce?days=${days}`).then((r) => r.workers),

  /** `range` is either `{ days }` (trailing window) or `{ month: 'YYYY-MM' }`. */
  detail: (applicationId: string, range: { days?: number; month?: string } = {}) =>
    apiRequest<{ worker: WorkerDetail }>(
      `/workforce/${applicationId}?${range.month ? `month=${range.month}` : `days=${range.days ?? 30}`}`,
    ).then(
      (r) => r.worker,
    ),

  markLeave: (applicationId: string, body: { date?: string; reason?: string | null } = {}) =>
    apiRequest<{ leave: { date: string; reason: string | null } }>(
      `/workforce/${applicationId}/leave`,
      { method: 'POST', body },
    ).then((r) => r.leave),

  cancelLeave: (applicationId: string, date: string) =>
    apiRequest<{ removed: boolean }>(`/workforce/${applicationId}/leave/${date}`, {
      method: 'DELETE',
    }),

  endEmployment: (applicationId: string, reason?: string | null) =>
    apiRequest<{ endedAt: string }>(`/workforce/${applicationId}/end`, {
      method: 'POST',
      body: { reason: reason ?? null },
    }),
};

/** "Today 9:12 AM"-style clock for an ISO timestamp, in the device locale. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
