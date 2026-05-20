/**
 * Notifications API — backend feed of in-app notifications.
 *
 * Mirrors the server's NotificationKind union; if the backend adds new
 * kinds, also list them here so screens can branch on them safely.
 */

import { apiRequest } from './client';

export const NOTIFICATION_KINDS = [
  'application_status',
  'application_received',
  'interview_scheduled',
  'interview_rescheduled',
  'interview_cancelled',
  'interview_reminder',
  'new_message',
  'rating_received',
  'verification_status',
  'job_alert_match',
  'morning_digest',
  'application_ghosted',
  'skill_gap',
  'doondo_score_changed',
  'sos_alert',
  'shift_checkin',
  'streak_milestone',
  'referral_bonus',
  'hired_nearby',
  'reengagement',
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface PublicNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  deeplink: {
    screen: string;
    params?: Record<string, unknown> | null;
  } | null;
  imageUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface ListResult {
  notifications: PublicNotification[];
  nextCursor: string | null;
}

export const notificationsApi = {
  list: (params: { limit?: number; before?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.limit) search.set('limit', String(params.limit));
    if (params.before) search.set('before', params.before);
    const qs = search.toString();
    return apiRequest<ListResult>(`/notifications${qs ? `?${qs}` : ''}`);
  },

  unreadCount: () =>
    apiRequest<{ count: number }>('/notifications/unread-count'),

  markRead: (id: string) =>
    apiRequest<{ id: string }>(`/notifications/${id}/read`, { method: 'POST' }),

  markAllRead: () =>
    apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
};
