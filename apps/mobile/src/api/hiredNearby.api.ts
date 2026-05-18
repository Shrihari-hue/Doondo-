/**
 * "Hired near you today" — anonymised social-proof feed.
 *
 * Reads the last few hires within ~10km of the caller's saved home
 * location. Auth-gated; only first names and job titles are
 * returned, never full identities.
 */

import { apiRequest } from './client';
import type { HiredNearbyEntry } from './types';

export const hiredNearbyApi = {
  list: (limit = 5) =>
    apiRequest<{ entries: HiredNearbyEntry[] }>(
      `/me/hired-nearby?limit=${limit}`,
    ),
};
