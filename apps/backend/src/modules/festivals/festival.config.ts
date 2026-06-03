/**
 * Festival calendar — the single source of truth for Festival Mode.
 *
 * This lives on the server (not in the mobile bundle) for two reasons:
 *   1. Lunar festivals move year to year — Diwali, Eid and Onam need an
 *      annual date review. Keeping the calendar here means that review
 *      is a config edit + deploy, not a mobile app release.
 *   2. Festivals are regional — Onam is Kerala, Pongal is Tamil Nadu.
 *      The server knows the worker's location, so it can decide which
 *      festival is relevant to them.
 *
 * MAINTENANCE: the windows below are for 2026 and MUST be reviewed each
 * year. Add next year's windows to the same `windows` array.
 */

export interface FestivalWindow {
  /** Inclusive start, ISO yyyy-mm-dd. */
  start: string;
  /** Inclusive end, ISO yyyy-mm-dd. */
  end: string;
}

export interface FestivalConfig {
  /** Stable id. */
  id: string;
  /** Display name (proper noun). */
  name: string;
  /** A single emoji motif. */
  emoji: string;
  /** Banner accent color. */
  accent: string;
  /** Soft tint for banner / card backgrounds. */
  accentSoft: string;
  /** Skill slugs whose hiring spikes during this festival. */
  trades: string[];
  /**
   * Lowercase city / state keywords this festival is relevant to.
   * Empty array = national (shown to everyone). A non-empty list means
   * the festival only surfaces for workers whose location matches.
   */
  regions: string[];
  /** Inclusive date windows. Multiple years may be listed. */
  windows: FestivalWindow[];
}

export const FESTIVALS: FestivalConfig[] = [
  {
    id: 'pongal',
    name: 'Pongal',
    emoji: '🌾',
    accent: '#E8A33D',
    accentSoft: '#FBF1DC',
    trades: ['cook', 'kitchen_helper', 'food_prep', 'cleaner', 'helper'],
    regions: [
      'tamil nadu',
      'chennai',
      'coimbatore',
      'madurai',
      'tiruchirappalli',
      'salem',
      'tirunelveli',
      'tiruppur',
      'vellore',
      'erode',
    ],
    windows: [
      { start: '2026-01-12', end: '2026-01-17' },
      { start: '2027-01-12', end: '2027-01-17' },
    ],
  },
  {
    id: 'eid',
    name: 'Eid',
    emoji: '🌙',
    accent: '#1F8A70',
    accentSoft: '#DDF0EA',
    trades: ['cook', 'kitchen_helper', 'tailor', 'decorator', 'cleaner', 'shop_assistant'],
    regions: [], // national
    windows: [
      { start: '2026-03-18', end: '2026-03-22' },
      { start: '2027-03-08', end: '2027-03-12' },
    ],
  },
  {
    id: 'onam',
    name: 'Onam',
    emoji: '🌸',
    accent: '#D94F9C',
    accentSoft: '#FBE3F0',
    trades: ['cook', 'food_prep', 'decorator', 'cleaner', 'helper'],
    regions: [
      'kerala',
      'kochi',
      'thiruvananthapuram',
      'kozhikode',
      'thrissur',
      'kollam',
      'kannur',
      'palakkad',
      'alappuzha',
    ],
    windows: [
      { start: '2026-08-23', end: '2026-08-29' },
      { start: '2027-09-08', end: '2027-09-14' },
    ],
  },
  {
    id: 'diwali',
    name: 'Diwali',
    emoji: '🪔',
    accent: '#E2622A',
    accentSoft: '#FBE6DA',
    trades: ['decorator', 'cleaner', 'security_guard', 'helper', 'shop_assistant', 'electrician'],
    regions: [], // national
    windows: [
      { start: '2026-11-05', end: '2026-11-11' },
      { start: '2027-10-28', end: '2027-11-02' },
    ],
  },
  {
    id: 'christmas',
    name: 'Christmas',
    emoji: '🎄',
    accent: '#C0392B',
    accentSoft: '#F6DEDB',
    trades: ['cook', 'baker', 'decorator', 'cleaner', 'security_guard', 'shop_assistant'],
    regions: [], // national
    windows: [
      { start: '2026-12-19', end: '2026-12-26' },
      { start: '2027-12-19', end: '2027-12-26' },
    ],
  },
];
