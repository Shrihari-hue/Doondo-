/**
 * Arrival-likelihood — "will they show up for this shift?" score for an
 * applicant, blending travel distance, shift time, and rating history.
 * A nudge to line up backfill when the odds are poorer.
 */

import { apiRequest } from './client';

export type ArrivalBand = 'high' | 'medium' | 'low';

export interface ArrivalFactor {
  label: string;
  effect: number;
}

export interface ArrivalLikelihood {
  score: number;
  band: ArrivalBand;
  distanceMeters: number | null;
  factors: ArrivalFactor[];
}

export const arrivalLikelihoodApi = {
  get: (applicationId: string) =>
    apiRequest<ArrivalLikelihood>(`/arrival-likelihood/${applicationId}`),
};
