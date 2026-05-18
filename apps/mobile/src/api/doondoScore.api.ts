/**
 * Doondo Score endpoints — portable employability score.
 *
 * The score is computed on the server (see modules/users/doondoScore.service.ts)
 * so the mobile only ever reads it. There's no "POST a score" — the
 * score is a function of other signals (ratings, hires, endorsements,
 * verification, profile completion).
 */

import { apiRequest } from './client';
import type { DoondoScoreResponse } from './types';

export const doondoScoreApi = {
  /** Caller's score — auth required. */
  me: () => apiRequest<DoondoScoreResponse>('/me/doondo-score'),

  /**
   * Read another user's score — public so a seeker can share their
   * score with employers off-platform via a link or QR.
   */
  forUser: (userId: string) =>
    apiRequest<DoondoScoreResponse>(`/users/${userId}/doondo-score`, {
      auth: false,
    }),
};
