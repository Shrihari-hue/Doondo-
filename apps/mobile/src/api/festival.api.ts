/**
 * Festival Mode endpoint.
 *
 * The festival calendar lives on the server (so lunar dates are a config
 * edit, not an app release) and is region-aware — `GET /festivals/active`
 * returns the festival relevant to THIS worker right now.
 */

import { apiRequest } from './client';

/** A festival, as sent to the client. */
export interface Festival {
  id: string;
  name: string;
  emoji: string;
  /** Banner accent color. */
  accent: string;
  /** Soft tint for banner / card backgrounds. */
  accentSoft: string;
  /** Skill slugs whose hiring spikes during this festival. */
  trades: string[];
}

export interface FestivalState {
  /** The festival active today for this worker, or null. */
  active: Festival | null;
  /** The next festival starting within ~12 days — drives the countdown. */
  upcoming: { festival: Festival; daysUntil: number } | null;
}

export const festivalApi = {
  /** The festival state (active + upcoming) for the authenticated worker. */
  active: () => apiRequest<FestivalState>('/festivals/active'),
};
