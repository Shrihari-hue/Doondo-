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
}

export const DEFAULT_PREFS: NotificationPrefs = {
  jobs: true,
  applications: true,
  messages: true,
  ratings: true,
  referrals: true,
};

export const notificationPrefsApi = {
  get: () => apiRequest<{ prefs: NotificationPrefs }>('/me/notification-prefs'),
  save: (patch: Partial<NotificationPrefs>) =>
    apiRequest<{ ok: true }>('/me/notification-prefs', {
      method: 'POST',
      body: patch,
    }),
};
