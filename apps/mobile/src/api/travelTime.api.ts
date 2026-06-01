/**
 * Travel-time — real driving ETA from the employer to nearby workers.
 * Falls back to a straight-line estimate server-side when the routing key
 * isn't configured (each result says which it is via `estimated`).
 */

import { apiRequest } from './client';

export interface TravelResult {
  id: string;
  meters: number;
  minutes: number;
  estimated: boolean;
}

export const travelTimeApi = {
  batch: (
    origin: { lat: number; lng: number },
    destinations: Array<{ id: string; lat: number; lng: number }>,
  ) =>
    apiRequest<{ results: TravelResult[] }>('/travel-times', {
      method: 'POST',
      body: { origin, destinations },
    }),
};
