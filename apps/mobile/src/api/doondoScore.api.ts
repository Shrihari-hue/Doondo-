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

/** A QR code as a module matrix — drawn as a grid on the client. */
export interface QrMatrix {
  /** Side length in modules. */
  size: number;
  /** modules[row][col] — true = dark module. */
  modules: boolean[][];
}

/** A signed, QR-shareable Doondo Score credential. */
export interface ScoreCredential {
  /** Short lookup code embedded in the QR URL. */
  code: string;
  /** Public verification URL the QR encodes. */
  verifyUrl: string;
  score: number;
  scoreVersion: number;
  issuedAt: string;
  expiresAt: string;
  qr: QrMatrix;
}

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

  /**
   * Mint a fresh signed, QR-shareable credential for the caller. The QR
   * encodes a public verification URL anyone can open to confirm the
   * score is authentic.
   */
  credential: () =>
    apiRequest<{ credential: ScoreCredential }>('/me/score-credential', {
      method: 'POST',
    }),
};
