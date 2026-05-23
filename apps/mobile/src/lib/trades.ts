/**
 * Curated trade catalogue — the tap-to-select grid that replaces blind
 * free-text typing on the seeker's skills picker.
 *
 * Why a curated list:
 *   - Many seekers have low literacy in English; typing "electrician"
 *     correctly is friction. An emoji + label they can recognise lets
 *     them tap their way to a complete profile.
 *   - Normalised tags ("electrician", "mason", "driver_heavy") cluster
 *     much better in search + alerts than free-text where one user
 *     typed "Plumber" and another "plumbing".
 *
 * Each trade carries:
 *   - `slug`: lower-snake identifier stored in `User.skills`. Stable.
 *   - `label`: English display name. Translations live in the i18n layer.
 *   - `emoji`: glyph for the tile. Picked for instant recognition.
 *   - `aliases`: extra keywords the voice search + free-text matcher use
 *     to map vernacular synonyms back to the canonical slug.
 *
 * Free-text typing still works — the seeker can add anything the
 * catalogue doesn't cover. The picker just makes the common 90% one tap.
 */

export interface TradeOption {
  slug: string;
  /** Full English display name. Used in resumes, applicant detail, profile. */
  label: string;
  /**
   * Compact chip label — must fit comfortably in a fixed-width filter chip
   * (~84px) without truncation. Defaults visually to `label` when omitted,
   * but providing one keeps the horizontal trade strip on Home tidy.
   */
  shortLabel?: string;
  emoji: string;
  aliases: string[];
}

export const TRADES: TradeOption[] = [
  // ─── Delivery / transport ──────────────────────────────────────────────
  { slug: 'delivery', label: 'Delivery', emoji: '🛵', aliases: ['rider', 'courier', 'food delivery', 'parcel', 'zomato', 'swiggy', 'dunzo'] },
  { slug: 'driver_light', label: 'Driver — light vehicle', shortLabel: 'LV Driver', emoji: '🚗', aliases: ['cab', 'taxi', 'auto', 'ola', 'uber', 'car driver'] },
  { slug: 'driver_heavy', label: 'Driver — heavy vehicle', shortLabel: 'HV Driver', emoji: '🚛', aliases: ['truck', 'lorry', 'bus driver', 'heavy license', 'tempo'] },

  // ─── Construction / skilled trades ─────────────────────────────────────
  { slug: 'helper', label: 'Helper', emoji: '🤝', aliases: ['labourer', 'mazdoor', 'unskilled', 'site helper'] },
  { slug: 'mason', label: 'Mason', emoji: '🧱', aliases: ['raj mistri', 'brick', 'plastering', 'concrete'] },
  { slug: 'painter', label: 'Painter', emoji: '🎨', aliases: ['wall painting', 'house painting'] },
  { slug: 'carpenter', label: 'Carpenter', emoji: '🪚', aliases: ['woodwork', 'furniture', 'plywood'] },
  { slug: 'electrician', label: 'Electrician', emoji: '⚡', aliases: ['wiring', 'electrical', 'fitter'] },
  { slug: 'plumber', label: 'Plumber', emoji: '🔧', aliases: ['pipe', 'pipeline', 'sanitary'] },
  { slug: 'welder', label: 'Welder', emoji: '🔥', aliases: ['fabrication', 'iron work', 'gas welder'] },
  { slug: 'ac_technician', label: 'AC technician', shortLabel: 'AC Tech', emoji: '❄️', aliases: ['ac repair', 'hvac', 'fridge repair'] },
  { slug: 'mechanic', label: 'Mechanic', emoji: '🔩', aliases: ['bike mechanic', 'car mechanic', 'garage'] },

  // ─── Hospitality / food ────────────────────────────────────────────────
  { slug: 'cook', label: 'Cook', emoji: '👨‍🍳', aliases: ['chef', 'kitchen', 'tiffin', 'cook for home'] },
  { slug: 'baker', label: 'Baker', emoji: '🧁', aliases: ['cake', 'bakery', 'pastry', 'confectioner', 'baking', 'cake artist'] },
  { slug: 'kitchen_helper', label: 'Kitchen helper', shortLabel: 'Kitchen', emoji: '🍳', aliases: ['dishwasher', 'kitchen assistant', 'commis'] },
  { slug: 'waiter', label: 'Waiter / server', shortLabel: 'Waiter', emoji: '🍽️', aliases: ['steward', 'restaurant staff', 'service'] },

  // ─── Events / craft services ───────────────────────────────────────────
  { slug: 'mehndi_artist', label: 'Mehndi artist', shortLabel: 'Mehndi', emoji: '🤲', aliases: ['mehndi', 'henna', 'mehendi', 'bridal mehndi'] },
  { slug: 'decorator', label: 'Decorator', emoji: '🎈', aliases: ['decoration', 'event decor', 'balloon decoration', 'wedding decor', 'stage decoration'] },
  { slug: 'photographer', label: 'Photographer', shortLabel: 'Photo', emoji: '📸', aliases: ['photography', 'videographer', 'wedding photographer', 'camera'] },

  // ─── Retail / shop ─────────────────────────────────────────────────────
  { slug: 'shop_assistant', label: 'Shop assistant', shortLabel: 'Shop', emoji: '🛍️', aliases: ['retail', 'salesman', 'counter', 'shopkeeper'] },
  { slug: 'cashier', label: 'Cashier', emoji: '💵', aliases: ['billing', 'pos', 'counter cash'] },
  { slug: 'warehouse', label: 'Warehouse / loader', shortLabel: 'Warehouse', emoji: '📦', aliases: ['loader', 'godown', 'packing', 'unloading'] },

  // ─── Personal services ────────────────────────────────────────────────
  { slug: 'security_guard', label: 'Security guard', shortLabel: 'Security', emoji: '👮', aliases: ['watchman', 'guard', 'bouncer'] },
  { slug: 'salon', label: 'Salon worker', shortLabel: 'Salon', emoji: '💇', aliases: ['barber', 'hairdresser', 'beautician', 'stylist'] },
  { slug: 'tailor', label: 'Tailor', emoji: '🧵', aliases: ['stitching', 'darzi', 'master tailor'] },
  { slug: 'domestic_help', label: 'Domestic help', shortLabel: 'Domestic', emoji: '🏠', aliases: ['maid', 'housekeeping', 'house help', 'bai'] },
  { slug: 'cleaner', label: 'Cleaner', emoji: '🧹', aliases: ['sweeper', 'janitor', 'office cleaner'] },
  { slug: 'gardener', label: 'Gardener', emoji: '🌱', aliases: ['mali', 'landscaping', 'lawn'] },

  // ─── Care work ────────────────────────────────────────────────────────
  { slug: 'caregiver', label: 'Caregiver', emoji: '🩺', aliases: ['nurse aide', 'patient care', 'elderly care', 'ayah'] },
  { slug: 'nanny', label: 'Nanny / babysitter', shortLabel: 'Nanny', emoji: '🧸', aliases: ['child care', 'babysitter', 'ayah'] },

  // ─── White-collar — same catalogue so the dual-audience overlap is real ─
  { slug: 'office_admin', label: 'Office admin', shortLabel: 'Admin', emoji: '🗂️', aliases: ['receptionist', 'front office', 'admin'] },
  { slug: 'data_entry', label: 'Data entry', emoji: '⌨️', aliases: ['typing', 'computer operator', 'back office'] },
  { slug: 'accountant', label: 'Accountant', shortLabel: 'Accounts', emoji: '🧮', aliases: ['tally', 'bookkeeping', 'finance'] },
  { slug: 'tutor', label: 'Tutor', emoji: '📚', aliases: ['teacher', 'tuition', 'coaching', 'school'] },
  { slug: 'telecaller', label: 'Telecaller', emoji: '☎️', aliases: ['call center', 'bpo', 'tele sales', 'customer service'] },
];

/**
 * Resolve a chip-sized label for a trade. Falls back to the full label
 * when no `shortLabel` is defined (e.g., already-short ones like "Cook").
 */
export function tradeShortLabel(trade: TradeOption): string {
  return trade.shortLabel ?? trade.label;
}

/**
 * Find a trade by slug. Returns undefined if not in the catalogue —
 * which is fine, that means it was added as a custom free-text skill.
 */
export function findTrade(slug: string): TradeOption | undefined {
  return TRADES.find((t) => t.slug === slug);
}

/**
 * Best-effort normaliser: take whatever the user typed (or pasted in
 * from an old profile) and try to map it back to a canonical slug.
 * Falls back to the trimmed lowercase input so we never throw away
 * data we don't recognise.
 */
export function normaliseSkill(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  for (const trade of TRADES) {
    if (trade.slug === cleaned) return trade.slug;
    if (trade.label.toLowerCase() === cleaned) return trade.slug;
    if (trade.aliases.some((a) => a === cleaned)) return trade.slug;
  }
  return cleaned;
}

/**
 * Pretty label for a stored slug — used in the resume preview, profile
 * skills strip, and applicant detail. Falls back to a title-cased
 * version of the raw value when the slug isn't in our catalogue (i.e.
 * the user typed a custom skill we don't have a row for).
 */
export function prettifySkill(value: string): string {
  const match = findTrade(value);
  if (match) return match.label;
  // Custom skill — title-case it for display.
  return value
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Convenience for the profile completion / display strip that wants
 * the emoji too. Returns null for custom (non-catalogue) skills.
 */
export function tradeEmoji(value: string): string | null {
  return findTrade(value)?.emoji ?? null;
}
