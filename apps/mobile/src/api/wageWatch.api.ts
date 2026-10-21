/** Wage Watch — local going rates for my trades. */
import { apiRequest } from './client';

export interface GoingRate {
  skill: string;
  period: string;
  medianPaise: number;
  p25Paise: number;
  p75Paise: number;
  samples: number;
  trend: number | null;
}

export const wageWatchApi = {
  get: () => apiRequest<{ city: string | null; rates: GoingRate[] }>('/wage-watch'),
};
