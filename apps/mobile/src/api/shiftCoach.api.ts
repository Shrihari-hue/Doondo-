/** Live in-shift AI coaching. */
import { apiRequest } from './client';

export interface CoachAnswer { answer: string; emergency: boolean; source: 'ai' | 'fallback'; remainingToday: number }

export const shiftCoachApi = {
  ask: (applicationId: string, question: string) =>
    apiRequest<CoachAnswer>('/shift-coach/ask', { method: 'POST', body: { applicationId, question } }),
};
