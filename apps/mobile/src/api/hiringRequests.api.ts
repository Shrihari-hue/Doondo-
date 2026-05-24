/**
 * Hiring-requests API — the employer→worker outbound invite flow.
 *
 * An employer picks a worker off the Find-workers map / list and invites
 * them to apply for one of their active jobs. The worker answers from
 * their inbox; on accept they drop straight into that job's pipeline.
 */

import { apiRequest } from './client';

export type HiringRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired';

export interface HiringRequestParty {
  id: string;
  name: string;
  photoUrl: string | null;
  isVerified: boolean;
}

export interface HiringRequestJob {
  id: string;
  title: string;
  status: string;
}

export interface HiringRequest {
  id: string;
  status: HiringRequestStatus;
  message: string | null;
  jobId: string;
  employerId: string;
  seekerId: string;
  /** Set once the worker accepts — the Application they landed in. */
  applicationId: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Present on the worker's inbox view. */
  employer?: HiringRequestParty;
  /** Present on the employer's sent-list view. */
  seeker?: HiringRequestParty & {
    skills: string[];
    rating: { avg: number; count: number } | null;
  };
  /** Present on both views. */
  job?: HiringRequestJob;
}

export interface SendHiringRequestPayload {
  seekerId: string;
  jobId: string;
  message?: string | null;
}

export const hiringRequestsApi = {
  /** Employer sends an invite. */
  send: (body: SendHiringRequestPayload) =>
    apiRequest<{ request: HiringRequest }>('/hiring-requests', {
      method: 'POST',
      body,
    }),

  /** Worker inbox — requests sent to me. */
  received: (status?: HiringRequestStatus) =>
    apiRequest<{ requests: HiringRequest[] }>(
      `/hiring-requests/received${status ? `?status=${status}` : ''}`,
    ),

  /** Employer — requests I've sent. */
  sent: () =>
    apiRequest<{ requests: HiringRequest[] }>('/hiring-requests/sent'),

  /** Worker accepts — creates/links the Application. */
  accept: (id: string) =>
    apiRequest<{ request: HiringRequest }>(`/hiring-requests/${id}/accept`, {
      method: 'POST',
    }),

  /** Worker declines. */
  decline: (id: string) =>
    apiRequest<{ request: HiringRequest }>(`/hiring-requests/${id}/decline`, {
      method: 'POST',
    }),

  /** Employer cancels a still-pending request. */
  withdraw: (id: string) =>
    apiRequest<{ request: HiringRequest }>(`/hiring-requests/${id}/withdraw`, {
      method: 'POST',
    }),
};
