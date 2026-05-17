/**
 * profileViews.api — client for the profile-view counter.
 *
 *   recordView(seekerId)  — employer-only; pinged on ApplicantDetail mount.
 *                           Idempotent within a UTC day.
 *   summarize()           — seeker-only; returns the "N views this week"
 *                           numbers used by the Profile dashboard widget.
 */
import { apiRequest } from './client';

export interface ProfileViewSummary {
  viewersLast7Days: number;
  viewersLast30Days: number;
  impressionsLast7Days: number;
}

export const profileViewsApi = {
  recordView: (seekerId: string) =>
    apiRequest<{ ok: true }>(`/seekers/${seekerId}/view`, { method: 'POST' }),

  summarize: () => apiRequest<ProfileViewSummary>('/me/profile-views'),
};
