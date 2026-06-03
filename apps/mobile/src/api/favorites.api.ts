/**
 * Employer favourites — workers mark a favourite employer; the employer
 * sees how many favourited them.
 */

import { apiRequest } from './client';

export const favoritesApi = {
  /** Seeker: have I favourited this employer? */
  status: (employerId: string) =>
    apiRequest<{ favorited: boolean }>(`/employer-favorites/${employerId}`),

  /** Seeker: set / unset the favourite. */
  set: (employerId: string, on: boolean) =>
    apiRequest<{ favorited: boolean }>(`/employer-favorites/${employerId}`, {
      method: 'PUT',
      body: { on },
    }),

  /** Employer: how many workers have favourited me. */
  myCount: () => apiRequest<{ count: number }>('/employer-favorites/me/count'),
};
