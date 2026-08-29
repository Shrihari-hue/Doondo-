/**
 * Cohorts API — peer groups via Find Friends (#7). A 5-person group tied
 * to one course, with a shared group chat.
 */
import { apiRequest } from './client';

export type CohortMemberStatus = 'invited' | 'joined' | 'declined';

export interface CohortMemberSummary {
  userId: string;
  name: string;
  photoUrl: string | null;
  status: CohortMemberStatus;
}

export interface PublicCohort {
  id: string;
  courseId: string;
  courseTitle: string;
  name: string;
  creatorId: string;
  myStatus: CohortMemberStatus;
  members: CohortMemberSummary[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: number;
  createdAt: string;
}

export interface PublicCohortMessage {
  id: string;
  cohortId: string;
  senderId: string;
  kind: 'text' | 'image' | 'voice' | 'video' | 'system';
  body: string;
  attachment: { dataUrl: string; mimeType: string; sizeBytes: number } | null;
  createdAt: string;
}

export const cohortsApi = {
  listMine: () => apiRequest<{ cohorts: PublicCohort[] }>('/cohorts'),

  create: (input: { courseId: string; name?: string; inviteUserIds: string[] }) =>
    apiRequest<{ cohort: PublicCohort }>('/cohorts', { method: 'POST', body: input }),

  detail: (cohortId: string) => apiRequest<{ cohort: PublicCohort }>(`/cohorts/${cohortId}`),

  invite: (cohortId: string, inviteUserIds: string[]) =>
    apiRequest<{ cohort: PublicCohort }>(`/cohorts/${cohortId}/invite`, {
      method: 'POST',
      body: { inviteUserIds },
    }),

  respond: (cohortId: string, accept: boolean) =>
    apiRequest<{ cohort: PublicCohort }>(`/cohorts/${cohortId}/respond`, {
      method: 'POST',
      body: { accept },
    }),

  listMessages: (cohortId: string, limit = 100) =>
    apiRequest<{ messages: PublicCohortMessage[] }>(`/cohorts/${cohortId}/messages?limit=${limit}`),

  sendMessage: (
    cohortId: string,
    input: { body?: string; kind?: 'text' | 'image'; attachment?: PublicCohortMessage['attachment'] },
  ) =>
    apiRequest<{ message: PublicCohortMessage }>(`/cohorts/${cohortId}/messages`, {
      method: 'POST',
      body: input,
    }),

  markRead: (cohortId: string) =>
    apiRequest<{ ok: true }>(`/cohorts/${cohortId}/read`, { method: 'POST' }),
};
