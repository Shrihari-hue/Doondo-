/**
 * Accounts API — cross-account helpers for the multi-account switcher.
 *
 * `activitySummary` powers the switcher badges: it asks the backend how
 * much is waiting on the worker's *other* accounts (unread chats, pending
 * offers / new applicants) so they can see it without switching in.
 *
 * Each non-active account is identified by its refresh token — the same
 * token already held on-device in the auth store. The backend reads it
 * read-only (no rotation) purely as proof of ownership.
 */

import { apiRequest } from './client';

export interface AccountActivitySummary {
  userId: string;
  /** Unread chat messages waiting for this account. */
  unreadMessages: number;
  /** Seeker: pending hiring requests · Employer: new applicants. */
  pendingActions: number;
  /** unreadMessages + pendingActions — the number the badge shows. */
  total: number;
}

export const accountsApi = {
  /** Activity summary for the worker's other on-device accounts. */
  activitySummary: (refreshTokens: string[]) =>
    apiRequest<{ summaries: AccountActivitySummary[] }>('/accounts/activity', {
      method: 'POST',
      body: { refreshTokens },
    }),
};
