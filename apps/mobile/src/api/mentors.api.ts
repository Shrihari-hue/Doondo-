/**
 * mentors.api — trade-buddy / mentor discovery and request lifecycle.
 */
import { apiRequest } from './client';

export interface PublicMentor {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  trade: string;
  city: string;
  bio: string;
  open: boolean;
  activeMentees: number;
  monthlyCap: number;
}

export interface PublicMentorshipRequest {
  id: string;
  menteeId: string;
  mentorId: string;
  trade: string;
  city: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'ended';
  createdAt: string;
}

export const mentorsApi = {
  list: (trade: string, city: string) =>
    apiRequest<{ mentors: PublicMentor[] }>(
      `/mentors?trade=${encodeURIComponent(trade)}&city=${encodeURIComponent(city)}`,
      { auth: false },
    ),
  become: (input: { trade: string; city: string; bio?: string }) =>
    apiRequest<{ mentor: PublicMentor }>('/mentors', { method: 'POST', body: input }),
  stop: () => apiRequest<{ ok: true }>('/mentors', { method: 'DELETE' }),
  request: (mentorUserId: string, message: string) =>
    apiRequest<{ request: PublicMentorshipRequest }>(
      `/mentors/${mentorUserId}/request`,
      { method: 'POST', body: { message } },
    ),
  respond: (requestId: string, decision: 'accepted' | 'declined' | 'ended') =>
    apiRequest<{ request: PublicMentorshipRequest }>(
      `/mentors/requests/${requestId}`,
      { method: 'PATCH', body: { decision } },
    ),
  mine: () =>
    apiRequest<{
      asMentee: PublicMentorshipRequest[];
      asMentor: PublicMentorshipRequest[];
    }>('/mentors/requests/mine'),
};
