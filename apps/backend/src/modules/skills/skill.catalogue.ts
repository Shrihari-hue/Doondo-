/**
 * Skill catalogue — the showcase-aware layer over Doondo's trade list.
 *
 * The mobile app already owns a trade catalogue (`apps/mobile/src/lib/
 * trades.ts`): slug + label + emoji + aliases, used to drive the
 * tap-to-select skills picker. That catalogue answers "what can a
 * worker tap to add a skill". It does NOT answer the question the
 * Craft Showcase needs answered:
 *
 *     For a given skill, HOW should the worker prove it?
 *
 * A baker proves quality with photos of cakes. A driver proves it with
 * a licence and a clean record — a photo gallery would be empty and
 * embarrassing. This file owns that one extra fact per skill:
 * `showcaseType`.
 *
 * Why a separate file (and not just more columns on trades.ts):
 *   - trades.ts is mobile-only; the BACKEND also needs showcaseType —
 *     to serve the right collection to an employer, and to reject a
 *     photo tagged to a non-gallery skill.
 *   - Keeping the showcase metadata here means the mobile catalogue
 *     stays a pure UI concern (emoji, aliases) and this stays a pure
 *     product-logic concern (category, showcaseType).
 *
 * `slug` is the join key. Every slug here MUST match a slug in mobile
 * `trades.ts` (the four event-craft slugs below — baker, mehndi_artist,
 * decorator, photographer — still need adding there; see the spec).
 * Long term both catalogues should be promoted into `packages/` so
 * there is exactly one source of truth.
 *
 * Pure and synchronous on purpose — same contract as
 * `modules/jobs/womenSafety.ts`: no I/O, unit-testable in the offline
 * bootcheck, safe to call from a model serializer or a request path.
 */

// ─── Showcase type ──────────────────────────────────────────────────────────

/**
 * How a worker proves a given skill.
 *
 *   gallery    — a photo portfolio. The 3D parallax CraftShowcase.
 *                Visual crafts where the finished work IS the proof:
 *                baking, mehndi, decoration, tailoring, masonry…
 *   reel       — a short video. Reserved for the Hire Reels feature
 *                (roadmap #35); no skill is assigned `reel` in v1, but
 *                the type exists so the render switch is total.
 *   credential — text proof: licence, certificate, skill-test score,
 *                endorsements, work history. Non-visual skills where a
 *                photo gallery would be empty (driver, accountant,
 *                security guard, telecaller…).
 *
 * `credential` is the safe default for any slug not in the catalogue
 * (a free-text skill the worker typed). That is deliberate: an unknown
 * skill must never render an empty 3D gallery shell.
 */
export const SHOWCASE_TYPES = ['gallery', 'reel', 'credential'] as const;
export type ShowcaseType = (typeof SHOWCASE_TYPES)[number];

/** Category buckets — mirror the section comments in mobile `trades.ts`. */
export const SKILL_CATEGORIES = [
  'transport',
  'construction',
  'food',
  'events',
  'retail',
  'services',
  'care',
  'clerical',
  'security',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

// ─── Catalogue entry ────────────────────────────────────────────────────────

export interface SkillCatalogEntry {
  /** lower-snake identifier, stored in `User.skills`. Matches trades.ts. */
  slug: string;
  /** English display name. Translations live in the i18n layer. */
  label: string;
  category: SkillCategory;
  /** How this skill is proven — drives the showcase render. */
  showcaseType: ShowcaseType;
  /**
   * One-line prompt shown to the worker when they add this skill —
   * "Photos of cakes, breads, and bakes" for a baker, "Driving licence
   * and clean record" for a driver. Keep it concrete and short.
   */
  proofHint: string;
}

/**
 * The catalogue. Ordered by category for readability only — never rely
 * on array order in code; look entries up by slug.
 *
 * `gallery` skills (the 3D showcase crowd): masonry, painting,
 * carpentry, electrical, welding, cooking, baking, tailoring, salon,
 * gardening, mehndi, decoration, photography. Everything else proves
 * out as a `credential`.
 */
export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  // ─── Transport ─────────────────────────────────────────────────────────
  { slug: 'delivery', label: 'Delivery', category: 'transport', showcaseType: 'credential', proofHint: 'Vehicle, licence, and delivery experience' },
  { slug: 'driver_light', label: 'Driver — light vehicle', category: 'transport', showcaseType: 'credential', proofHint: 'Driving licence and a clean record' },
  { slug: 'driver_heavy', label: 'Driver — heavy vehicle', category: 'transport', showcaseType: 'credential', proofHint: 'Heavy-vehicle licence and route experience' },

  // ─── Construction / skilled trades ─────────────────────────────────────
  { slug: 'helper', label: 'Helper', category: 'construction', showcaseType: 'credential', proofHint: 'Sites you have worked and endorsements' },
  { slug: 'mason', label: 'Mason', category: 'construction', showcaseType: 'gallery', proofHint: 'Photos of walls, plaster, and finishes' },
  { slug: 'painter', label: 'Painter', category: 'construction', showcaseType: 'gallery', proofHint: 'Before / after shots of painted spaces' },
  { slug: 'carpenter', label: 'Carpenter', category: 'construction', showcaseType: 'gallery', proofHint: 'Photos of furniture and woodwork' },
  { slug: 'electrician', label: 'Electrician', category: 'construction', showcaseType: 'gallery', proofHint: 'Photos of panels, wiring, and fittings' },
  { slug: 'plumber', label: 'Plumber', category: 'construction', showcaseType: 'credential', proofHint: 'Licence and jobs completed' },
  { slug: 'welder', label: 'Welder', category: 'construction', showcaseType: 'gallery', proofHint: 'Photos of fabrication and finished joints' },
  { slug: 'ac_technician', label: 'AC technician', category: 'construction', showcaseType: 'credential', proofHint: 'Certifications and jobs completed' },
  { slug: 'mechanic', label: 'Mechanic', category: 'construction', showcaseType: 'credential', proofHint: 'Vehicles serviced and endorsements' },

  // ─── Hospitality / food ────────────────────────────────────────────────
  { slug: 'cook', label: 'Cook', category: 'food', showcaseType: 'gallery', proofHint: 'Photos of dishes you have plated' },
  { slug: 'baker', label: 'Baker', category: 'food', showcaseType: 'gallery', proofHint: 'Photos of cakes, breads, and bakes' },
  { slug: 'kitchen_helper', label: 'Kitchen helper', category: 'food', showcaseType: 'credential', proofHint: 'Kitchens you have worked and endorsements' },
  { slug: 'waiter', label: 'Waiter / server', category: 'food', showcaseType: 'credential', proofHint: 'Venues you have worked and endorsements' },

  // ─── Events / craft services ───────────────────────────────────────────
  { slug: 'mehndi_artist', label: 'Mehndi artist', category: 'events', showcaseType: 'gallery', proofHint: 'Photos of mehndi and henna designs' },
  { slug: 'decorator', label: 'Decorator', category: 'events', showcaseType: 'gallery', proofHint: 'Photos of event setups and décor' },
  { slug: 'photographer', label: 'Photographer', category: 'events', showcaseType: 'gallery', proofHint: 'Photos from shoots in your portfolio' },

  // ─── Retail / shop ─────────────────────────────────────────────────────
  { slug: 'shop_assistant', label: 'Shop assistant', category: 'retail', showcaseType: 'credential', proofHint: 'Shops you have worked and endorsements' },
  { slug: 'cashier', label: 'Cashier', category: 'retail', showcaseType: 'credential', proofHint: 'Billing experience and endorsements' },
  { slug: 'warehouse', label: 'Warehouse / loader', category: 'retail', showcaseType: 'credential', proofHint: 'Warehouses you have worked and endorsements' },

  // ─── Personal services ─────────────────────────────────────────────────
  { slug: 'salon', label: 'Salon worker', category: 'services', showcaseType: 'gallery', proofHint: 'Photos of hair, beauty, and grooming work' },
  { slug: 'tailor', label: 'Tailor', category: 'services', showcaseType: 'gallery', proofHint: 'Photos of garments you have stitched' },
  { slug: 'gardener', label: 'Gardener', category: 'services', showcaseType: 'gallery', proofHint: 'Photos of gardens and landscaping' },
  { slug: 'domestic_help', label: 'Domestic help', category: 'services', showcaseType: 'credential', proofHint: 'Homes you have worked and references' },
  { slug: 'cleaner', label: 'Cleaner', category: 'services', showcaseType: 'credential', proofHint: 'Sites you have cleaned and endorsements' },

  // ─── Care work ─────────────────────────────────────────────────────────
  { slug: 'caregiver', label: 'Caregiver', category: 'care', showcaseType: 'credential', proofHint: 'Certifications and care experience' },
  { slug: 'nanny', label: 'Nanny / babysitter', category: 'care', showcaseType: 'credential', proofHint: 'Families you have worked and references' },

  // ─── Security ──────────────────────────────────────────────────────────
  { slug: 'security_guard', label: 'Security guard', category: 'security', showcaseType: 'credential', proofHint: 'Licence, training, and posts held' },

  // ─── Clerical / white-collar ───────────────────────────────────────────
  { slug: 'office_admin', label: 'Office admin', category: 'clerical', showcaseType: 'credential', proofHint: 'Roles held and references' },
  { slug: 'data_entry', label: 'Data entry', category: 'clerical', showcaseType: 'credential', proofHint: 'Typing speed, accuracy, and experience' },
  { slug: 'accountant', label: 'Accountant', category: 'clerical', showcaseType: 'credential', proofHint: 'Qualifications and experience' },
  { slug: 'tutor', label: 'Tutor', category: 'clerical', showcaseType: 'credential', proofHint: 'Subjects, results, and qualifications' },
  { slug: 'telecaller', label: 'Telecaller', category: 'clerical', showcaseType: 'credential', proofHint: 'Campaigns handled and experience' },
] as const;

/**
 * Default showcase type for a slug the catalogue does not know — i.e. a
 * free-text skill the worker typed themselves. `credential` is the safe
 * fallback: an unknown skill renders as a plain text row, never as an
 * empty 3D gallery.
 */
export const DEFAULT_SHOWCASE_TYPE: ShowcaseType = 'credential';

// ─── Lookup index ───────────────────────────────────────────────────────────

/** slug → entry, built once at module load. Catalogue is static. */
const BY_SLUG: ReadonlyMap<string, SkillCatalogEntry> = new Map(
  SKILL_CATALOG.map((entry) => [entry.slug, entry]),
);

// ─── Photo / collection shapes ──────────────────────────────────────────────

/**
 * One photo in a worker's craft portfolio.
 *
 * This is the shape `User.workPhotos` should migrate to. Today that
 * field is a flat `string[]` of base64 data URLs with no skill tag, so
 * a worker who both bakes and does mehndi gets one undifferentiated
 * pile of images. Tagging each photo with the skill it belongs to is
 * what makes per-craft collections possible.
 *
 * `skill` is a catalogue slug. The upload path should reject a photo
 * whose `skill` is not one of the worker's own `gallery`-type skills.
 *
 * `url` is a base64 data URL for now (consistent with the rest of the
 * User model); it becomes a CDN URL when the Phase 5 file pipeline
 * lands — both shapes are valid here, no code change needed.
 */
export interface CraftPhoto {
  url: string;
  /** Catalogue slug of the collection this photo belongs to. */
  skill: string;
  /** Optional short caption ("3-tier wedding cake"). */
  caption?: string | null;
  /** Exactly one photo per collection should be the cover. */
  isCover?: boolean;
}

/**
 * A worker's photos for one craft, ready to hand to the CraftShowcase
 * component. `buildCollections` produces these from a flat CraftPhoto[].
 */
export interface CraftCollection {
  /** Catalogue slug, e.g. "baker". */
  skill: string;
  /** Display label, e.g. "Baker". */
  label: string;
  showcaseType: ShowcaseType;
  /** Photos in this collection — cover first, then upload order. */
  photos: CraftPhoto[];
  /** The cover photo (first `isCover`, else first photo, else null). */
  cover: CraftPhoto | null;
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Catalogue entry for a slug, or `undefined` for a free-text skill. */
export function getSkillMeta(slug: string): SkillCatalogEntry | undefined {
  return BY_SLUG.get(slug);
}

/** Showcase type for a slug. Unknown slugs fall back to `credential`. */
export function showcaseTypeFor(slug: string): ShowcaseType {
  return BY_SLUG.get(slug)?.showcaseType ?? DEFAULT_SHOWCASE_TYPE;
}

/** True when the skill is proven with a photo gallery. */
export function isGallerySkill(slug: string): boolean {
  return showcaseTypeFor(slug) === 'gallery';
}

/** The `gallery`-type slugs out of a worker's skill list, in order. */
export function gallerySkills(skills: readonly string[]): string[] {
  return skills.filter(isGallerySkill);
}

/**
 * Split a worker's skills into the three showcase buckets. This is the
 * function a profile builder calls to decide which blocks to render
 * and in what order.
 */
export function splitSkillsByShowcase(
  skills: readonly string[],
): Record<ShowcaseType, string[]> {
  const out: Record<ShowcaseType, string[]> = { gallery: [], reel: [], credential: [] };
  for (const slug of skills) out[showcaseTypeFor(slug)].push(slug);
  return out;
}

/**
 * The single gate for the 3D Craft Showcase module. True only when the
 * worker has at least one `gallery` skill AND at least one photo tagged
 * to one of those skills. When false the profile screen hides the
 * module entirely — no empty 3D shell for an accountant or a driver.
 */
export function hasCraftShowcase(
  skills: readonly string[],
  photos: readonly CraftPhoto[],
): boolean {
  const gallery = new Set(gallerySkills(skills));
  if (gallery.size === 0) return false;
  return photos.some((p) => gallery.has(p.skill));
}

/**
 * Group a flat photo list into per-craft collections, ready to render.
 *
 * Only photos whose `skill` is one of the worker's own `gallery` skills
 * are included — a stale photo tagged to a skill the worker has since
 * removed is silently dropped. Collections come back in the order the
 * skills appear in `skills` (so the worker controls first impressions
 * by ordering their skill chips). Within a collection the cover photo
 * is first.
 */
export function buildCollections(
  skills: readonly string[],
  photos: readonly CraftPhoto[],
): CraftCollection[] {
  const collections: CraftCollection[] = [];
  for (const slug of skills) {
    if (!isGallerySkill(slug)) continue;
    const own = photos.filter((p) => p.skill === slug);
    if (own.length === 0) continue;
    const coverIdx = own.findIndex((p) => p.isCover);
    const ordered = coverIdx > 0 ? [own[coverIdx]!, ...own.filter((_, i) => i !== coverIdx)] : own;
    collections.push({
      skill: slug,
      label: getSkillMeta(slug)?.label ?? slug,
      showcaseType: 'gallery',
      photos: ordered,
      cover: ordered[0] ?? null,
    });
  }
  return collections;
}
