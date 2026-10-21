/**
 * notificationPrefs.api — per-type push notification toggles.
 *
 * Defaults to all-on. The backend's push fan-out reads these and skips
 * sending to seekers who've turned off the category. Best-effort —
 * we don't try to claw back already-sent OS-level notifications.
 */
import { apiRequest } from './client';

export interface NotificationPrefs {
  jobs: boolean;
  applications: boolean;
  messages: boolean;
  ratings: boolean;
  referrals: boolean;
  /** Employer-side alerts. */
  newApplicant: boolean;
  interviewReminder: boolean;
  workerAbsent: boolean;
  payrollDue: boolean;
  /** IST window when job suggestions / digests / streaks wait until morning. */
  quietHours: { enabled: boolean; start: string; end: string };
}

export const DEFAULT_PREFS: NotificationPrefs = {
  jobs: true,
  applications: true,
  messages: true,
  ratings: true,
  referrals: true,
  newApplicant: true,
  interviewReminder: true,
  workerAbsent: true,
  payrollDue: true,
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
};

export const notificationPrefsApi = {
  get: () => apiRequest<{ prefs: NotificationPrefs }>('/me/notification-prefs'),
  save: (patch: Partial<Omit<NotificationPrefs, 'quietHours'>> & { quietHours?: Partial<NotificationPrefs['quietHours']> }) =>
    apiRequest<{ ok: true }>('/me/notification-prefs', {
      method: 'POST',
      body: patch,
    }),
};
