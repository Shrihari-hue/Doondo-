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

export type SessionMode = 'call' | 'video' | 'in_person';
export interface MentorSession {
  id: string;
  mentorUserId: string;
  mentorName: string;
  menteeId: string | null;
  menteeName: string | null;
  startAt: string;
  durationMinutes: number;
  priceRupees: number;
  mode: SessionMode;
  topic: string | null;
  note: string | null;
  status: 'open' | 'booked' | 'completed' | 'cancelled';
  payment: { ref: string; upiUri: string | null; menteeMarkedPaidAt: string | null; mentorConfirmedAt: string | null } | null;
  cancelledBy: 'mentor' | 'mentee' | null;
}

export const mentorsApi = {
  // ── Bookable sessions ──
  slotsFor: (mentorUserId: string) =>
    apiRequest<{ sessions: MentorSession[] }>(`/mentors/${mentorUserId}/slots`).then((r) => r.sessions),
  mySessions: () => apiRequest<{ asMentor: MentorSession[]; asMentee: MentorSession[] }>('/mentors/sessions/mine'),
  publishSlots: (slots: Array<{ startAt: string; durationMinutes: number; priceRupees: number; mode?: SessionMode; topic?: string | null }>) =>
    apiRequest<{ sessions: MentorSession[] }>('/mentors/slots', { method: 'POST', body: { slots } }).then((r) => r.sessions),
  book: (sessionId: string, note?: string) =>
    apiRequest<{ session: MentorSession }>(`/mentors/sessions/${sessionId}/book`, { method: 'POST', body: { note: note ?? null } }).then((r) => r.session),
  cancelSession: (sessionId: string) =>
    apiRequest<{ session: MentorSession }>(`/mentors/sessions/${sessionId}/cancel`, { method: 'POST', body: {} }).then((r) => r.session),
  markSessionPaid: (sessionId: string) =>
    apiRequest<{ session: MentorSession }>(`/mentors/sessions/${sessionId}/paid`, { method: 'POST', body: {} }).then((r) => r.session),
  completeSession: (sessionId: string) =>
    apiRequest<{ session: MentorSession }>(`/mentors/sessions/${sessionId}/complete`, { method: 'POST', body: {} }).then((r) => r.session),

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
