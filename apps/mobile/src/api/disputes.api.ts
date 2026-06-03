/**
 * Disputes — two-sided grievance flow tied to a hire. Used by both the
 * employer (ApplicantDetail) and the worker (My applications).
 */

import { apiRequest } from './client';

export type DisputeCategory =
  | 'no_show'
  | 'payment'
  | 'work_quality'
  | 'behavior'
  | 'hours'
  | 'safety'
  | 'other';

export type DisputeStatus = 'open' | 'awaiting_response' | 'resolved' | 'dismissed';
export type PartyRole = 'employer' | 'seeker';

export interface DisputeResponse {
  byRole: PartyRole;
  text: string;
  at: string;
}

export interface Dispute {
  id: string;
  applicationId: string;
  jobId: string;
  category: DisputeCategory;
  description: string;
  photoUrls: string[];
  status: DisputeStatus;
  raisedByRole: PartyRole;
  raisedByMe: boolean;
  counterpartyName: string;
  responses: DisputeResponse[];
  resolution: {
    outcome: 'resolved' | 'dismissed';
    note: string | null;
    byRole: PartyRole;
    at: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export const disputesApi = {
  raise: (input: {
    applicationId: string;
    category: DisputeCategory;
    description: string;
    photoDataUrls?: string[];
  }) =>
    apiRequest<{ dispute: Dispute }>('/disputes', { method: 'POST', body: input }).then(
      (r) => r.dispute,
    ),

  list: (params?: { status?: DisputeStatus; applicationId?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.applicationId) q.set('applicationId', params.applicationId);
    const qs = q.toString();
    return apiRequest<{ disputes: Dispute[] }>(`/disputes${qs ? `?${qs}` : ''}`).then(
      (r) => r.disputes,
    );
  },

  get: (id: string) =>
    apiRequest<{ dispute: Dispute }>(`/disputes/${id}`).then((r) => r.dispute),

  respond: (id: string, text: string) =>
    apiRequest<{ dispute: Dispute }>(`/disputes/${id}/respond`, {
      method: 'POST',
      body: { text },
    }).then((r) => r.dispute),

  resolve: (id: string, outcome: 'resolved' | 'dismissed', note?: string) =>
    apiRequest<{ dispute: Dispute }>(`/disputes/${id}/resolve`, {
      method: 'POST',
      body: { outcome, note },
    }).then((r) => r.dispute),
};
