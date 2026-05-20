/**
 * Doondo Pulse — the worker's momentum snapshot for the Home dashboard.
 *
 * One call returns Doondo Score, apply streak, applications still in
 * play, profile completion, and a single next-step nudge. Seeker-only;
 * the server computes everything on the read path.
 */

import { apiRequest } from './client';
import type { PulseSnapshot } from './types';

export const pulseApi = {
  get: () => apiRequest<PulseSnapshot>('/me/pulse'),
};
