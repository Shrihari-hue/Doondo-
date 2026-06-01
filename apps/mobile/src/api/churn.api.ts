/**
 * Crew churn early-warning — regulars who've gone quiet, worth a win-back.
 */

import { apiRequest } from './client';

export interface ChurnRisk {
  workerId: string;
  name: string;
  photoUrl: string | null;
  hireCount: number;
  lastHiredAt: string | null;
  daysSince: number;
}

export const churnApi = {
  list: () => apiRequest<{ risks: ChurnRisk[] }>('/churn-risks'),
};
