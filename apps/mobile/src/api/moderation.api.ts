/**
 * Moderation — employer block list + user reports.
 */

import { apiRequest } from './client';

export type ReportReason = 'fake_profile' | 'scam' | 'abusive' | 'no_show' | 'other';

export const moderationApi = {
  block: (workerId: string) =>
    apiRequest<{ blocked: boolean }>('/blocks', {
      method: 'POST',
      body: { workerId },
    }),

  unblock: (workerId: string) =>
    apiRequest<{ blocked: boolean }>(`/blocks/${workerId}`, { method: 'DELETE' }),

  listBlocked: () =>
    apiRequest<{ blocked: Array<{ workerId: string; createdAt: string }> }>('/blocks'),

  report: (reportedUserId: string, reason: ReportReason, note?: string) =>
    apiRequest<{ reported: boolean }>('/reports', {
      method: 'POST',
      body: { reportedUserId, reason, ...(note ? { note } : {}) },
    }),
};
