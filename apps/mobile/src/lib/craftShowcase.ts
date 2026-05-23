/**
 * Craft Showcase — client-side helpers for the per-craft portfolio.
 *
 * This is the mobile mirror of the backend's `modules/skills/skill.catalogue`.
 * It owns one question: which skills are proven with a photo gallery (the
 * 3D showcase), and how a worker's flat photo list groups into per-craft
 * collections.
 *
 * Kept in sync with the backend catalogue by hand until both are promoted
 * into a shared `packages/` module. If you add a gallery craft here, add
 * it there too (and to `lib/trades.ts` so the picker can surface it).
 */

import type { CraftPhoto } from '@/api/types';
import { findTrade, prettifySkill } from './trades';

/**
 * Catalogue slugs whose proof is a photo gallery. Every other skill
 * (driver, accountant, security…) is a `credential` skill — it never
 * renders the 3D showcase.
 */
const GALLERY_SKILLS = new Set<string>([
  'mason',
  'painter',
  'carpenter',
  'electrician',
  'welder',
  'cook',
  'baker',
  'tailor',
  'salon',
  'gardener',
  'mehndi_artist',
  'decorator',
  'photographer',
]);

/** True when the skill is proven with a photo gallery. */
export function isGallerySkill(slug: string): boolean {
  return GALLERY_SKILLS.has(slug);
}

/** The gallery-type slugs out of a worker's skill list, in order. */
export function gallerySkills(skills: readonly string[]): string[] {
  return skills.filter(isGallerySkill);
}

/** A worker's photos for one craft, ready to hand to CraftShowcase. */
export interface CraftCollection {
  /** Catalogue slug, e.g. "baker". */
  skill: string;
  /** Display label, e.g. "Baker". */
  label: string;
  /** Photos in this collection — cover first, then upload order. */
  photos: CraftPhoto[];
  /** The cover photo (first `isCover`, else first photo, else null). */
  cover: CraftPhoto | null;
}

/**
 * The gate for the 3D Craft Showcase module. True only when the worker
 * has at least one gallery skill AND at least one photo tagged to one of
 * those skills — so a profile never renders an empty 3D shell.
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
 * Only photos whose `skill` is one of the worker's own gallery skills are
 * included. Collections come back in the worker's own skill order (so the
 * worker controls first impressions), cover photo first within each.
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
    const ordered =
      coverIdx > 0 ? [own[coverIdx]!, ...own.filter((_, i) => i !== coverIdx)] : own;
    collections.push({
      skill: slug,
      label: findTrade(slug)?.label ?? prettifySkill(slug),
      photos: ordered,
      cover: ordered[0] ?? null,
    });
  }
  return collections;
}
