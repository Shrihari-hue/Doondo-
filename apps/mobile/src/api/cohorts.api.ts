/** Peer cohorts — 5-person course study groups. */
import { apiRequest } from './client';

export interface Cohort {
  id: string;
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  name: string;
  code: string;
  members: Array<{ id: string; name: string; photoUrl: string | null; completedLessons: number; completed: boolean }>;
  lastMessageAt: string | null;
}
export interface CohortMessage { id: string; senderId: string; senderName: string; text: string; createdAt: string }

export const cohortsApi = {
  mine: () => apiRequest<{ cohorts: Cohort[] }>('/cohorts').then((r) => r.cohorts),
  create: (courseId: string, name?: string) =>
    apiRequest<{ cohort: Cohort }>('/cohorts', { method: 'POST', body: { courseId, name } }).then((r) => r.cohort),
  join: (code: string) => apiRequest<{ cohort: Cohort }>('/cohorts/join', { method: 'POST', body: { code } }).then((r) => r.cohort),
  get: (id: string) => apiRequest<{ cohort: Cohort }>(`/cohorts/${id}`).then((r) => r.cohort),
  leave: (id: string) => apiRequest<{ left: boolean }>(`/cohorts/${id}/leave`, { method: 'POST', body: {} }),
  messages: (id: string) => apiRequest<{ messages: CohortMessage[] }>(`/cohorts/${id}/messages`).then((r) => r.messages),
  post: (id: string, text: string) =>
    apiRequest<{ message: CohortMessage }>(`/cohorts/${id}/messages`, { method: 'POST', body: { text } }).then((r) => r.message),
};
