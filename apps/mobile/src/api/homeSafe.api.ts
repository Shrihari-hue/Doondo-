/**
 * Home-safe — the "reached home safe" post-shift check-out loop.
 */

import { apiRequest } from './client';

export interface HomeSafeCheck {
  id: string;
  applicationId: string;
  jobId: string;
  status: 'pending' | 'safe';
  startedAt: string;
  confirmedAt: string | null;
  jobTitle: string | null;
}

export const homeSafeApi = {
  pending: () =>
    apiRequest<{ checks: HomeSafeCheck[] }>('/home-safe/pending').then((r) => r.checks),

  confirm: (id: string) =>
    apiRequest<{ check: HomeSafeCheck }>(`/home-safe/${id}/confirm`, { method: 'POST' }).then(
      (r) => r.check,
    ),
};
