/**
 * jobFlavour — per-job-type visual personality for the Same-day swipe deck.
 *
 * Each PublicJob resolves to exactly one `JobFlavour` that drives:
 *
 *   - `iconName`      — small MaterialCommunityIcons glyph shown in the
 *                       circular badge top-right of the card. The card's
 *                       "what is this job?" tell at a glance.
 *   - `heroIconName`  — usually identical to `iconName`, but some flavours
 *                       (e.g., driver) look stronger with a different glyph
 *                       blown up huge in the hero scene (steering wheel
 *                       reads in the badge; a side-on car reads better
 *                       inside an atmospheric gradient).
 *   - `gradient`      — three stops for the hero scene, top → mid → bottom.
 *                       Picked to evoke the trade (warm sunset for drivers,
 *                       peach kitchen for cooks, sage for gardeners, etc.).
 *   - `family`        — flat key used for analytics + telemetry only.
 *
 * Resolution rules, in order:
 *   1. If any `job.skills` slug matches a known trade flavour, use it.
 *   2. Otherwise fall back to keyword-matching against `job.title`.
 *   3. Otherwise return the neutral `DEFAULT_FLAVOUR` — a champagne gradient
 *      and a generic briefcase glyph that still feels intentional.
 *
 * Why a centralised mapping (vs. inline per-trade switches in the card):
 *   - The same flavours will be reused on the JobDetail hero, the saved-jobs
 *     skim list, and the apply-success celebration. One source of truth.
 *   - Keeps the swipe card layout pure presentation — easy to redesign
 *     without re-mapping trade icons.
 */

import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface JobFlavour {
  family: string;
  iconName: MciName;
  heroIconName: MciName;
  /** Vertical gradient stops: [top, middle, bottom]. */
  gradient: [string, string, string];
}

/** Driver / delivery / transport — warm "open road" sky. */
const TRANSPORT: JobFlavour = {
  family: 'transport',
  iconName: 'steering',
  heroIconName: 'car-side',
  gradient: ['#F7E6C4', '#F1D6A8', '#FBF6EA'],
};

const DELIVERY: JobFlavour = {
  family: 'delivery',
  iconName: 'moped',
  heroIconName: 'moped',
  gradient: ['#FBE3C9', '#F6CFA1', '#FBF6EA'],
};

const HEAVY_TRUCK: JobFlavour = {
  family: 'transport_heavy',
  iconName: 'truck',
  heroIconName: 'truck',
  gradient: ['#E8DDC8', '#D9C7A4', '#FBF6EA'],
};

/** Hospitality / food — warm peach. */
const COOK: JobFlavour = {
  family: 'cook',
  iconName: 'chef-hat',
  heroIconName: 'chef-hat',
  gradient: ['#FCE4D2', '#F8C9AE', '#FBF6EA'],
};

const KITCHEN_HELPER: JobFlavour = {
  family: 'kitchen_helper',
  iconName: 'silverware-fork-knife',
  heroIconName: 'silverware-fork-knife',
  gradient: ['#FBE4D6', '#F2C9AE', '#FBF6EA'],
};

const WAITER: JobFlavour = {
  family: 'waiter',
  iconName: 'silverware-clean',
  heroIconName: 'silverware-clean',
  gradient: ['#FAE2D2', '#EFC4A6', '#FBF6EA'],
};

const BAKER: JobFlavour = {
  family: 'baker',
  iconName: 'cake-variant',
  heroIconName: 'cake-variant',
  gradient: ['#FDE9DC', '#F6CCB0', '#FBF6EA'],
};

/** Construction / skilled trades — dusty tan. */
const HELPER: JobFlavour = {
  family: 'helper',
  iconName: 'briefcase-outline',
  heroIconName: 'tools',
  gradient: ['#ECDEC4', '#D9C49C', '#FBF6EA'],
};

const MASON: JobFlavour = {
  family: 'mason',
  iconName: 'tape-measure',
  heroIconName: 'tape-measure',
  gradient: ['#E8D7BC', '#D2B98F', '#FBF6EA'],
};

const PAINTER: JobFlavour = {
  family: 'painter',
  iconName: 'format-paint',
  heroIconName: 'format-paint',
  gradient: ['#F2DCC4', '#E4BE94', '#FBF6EA'],
};

const CARPENTER: JobFlavour = {
  family: 'carpenter',
  iconName: 'hammer-wrench',
  heroIconName: 'hammer-wrench',
  gradient: ['#E9D7B9', '#D4B687', '#FBF6EA'],
};

const ELECTRICIAN: JobFlavour = {
  family: 'electrician',
  iconName: 'flash',
  heroIconName: 'flash',
  gradient: ['#F8DEAA', '#EFC477', '#FBF6EA'],
};

const PLUMBER: JobFlavour = {
  family: 'plumber',
  iconName: 'wrench',
  heroIconName: 'wrench',
  gradient: ['#DCE2E8', '#BCC7D3', '#FBF6EA'],
};

const WELDER: JobFlavour = {
  family: 'welder',
  iconName: 'tools',
  heroIconName: 'tools',
  gradient: ['#E4D9C4', '#CFB98F', '#FBF6EA'],
};

const AC_TECH: JobFlavour = {
  family: 'ac_technician',
  iconName: 'wrench',
  heroIconName: 'wrench',
  gradient: ['#DCE6EC', '#B8CAD6', '#FBF6EA'],
};

const MECHANIC: JobFlavour = {
  family: 'mechanic',
  iconName: 'tools',
  heroIconName: 'tools',
  gradient: ['#DCDEE3', '#B7BBC4', '#FBF6EA'],
};

/** Personal services & care. */
const CLEANER: JobFlavour = {
  family: 'cleaner',
  iconName: 'broom',
  heroIconName: 'broom',
  gradient: ['#E1ECDF', '#C4D9C0', '#FBF6EA'],
};

const DOMESTIC: JobFlavour = {
  family: 'domestic_help',
  iconName: 'home-heart',
  heroIconName: 'home-heart',
  gradient: ['#F0E2DA', '#DCC1B3', '#FBF6EA'],
};

const GARDENER: JobFlavour = {
  family: 'gardener',
  iconName: 'sprout',
  heroIconName: 'sprout',
  gradient: ['#DDE9D2', '#B8CFA5', '#FBF6EA'],
};

const CAREGIVER: JobFlavour = {
  family: 'caregiver',
  iconName: 'shield-account',
  heroIconName: 'shield-account',
  gradient: ['#F2DCDC', '#E1BABA', '#FBF6EA'],
};

const NANNY: JobFlavour = {
  family: 'nanny',
  iconName: 'baby-face-outline',
  heroIconName: 'baby-face-outline',
  gradient: ['#F8E0E0', '#EFC4C4', '#FBF6EA'],
};

const SALON: JobFlavour = {
  family: 'salon',
  iconName: 'content-cut',
  heroIconName: 'content-cut',
  gradient: ['#F2DCE2', '#DCB7C4', '#FBF6EA'],
};

const TAILOR: JobFlavour = {
  family: 'tailor',
  iconName: 'needle',
  heroIconName: 'needle',
  gradient: ['#EFE0D6', '#D9BFA8', '#FBF6EA'],
};

const SECURITY: JobFlavour = {
  family: 'security',
  iconName: 'shield-account',
  heroIconName: 'shield-account',
  gradient: ['#D9DEE5', '#B0B9C8', '#FBF6EA'],
};

/** Retail / shop. */
const SHOP_ASSISTANT: JobFlavour = {
  family: 'shop_assistant',
  iconName: 'tshirt-crew',
  heroIconName: 'tshirt-crew',
  gradient: ['#E5DECF', '#C8BD9D', '#FBF6EA'],
};

const CASHIER: JobFlavour = {
  family: 'cashier',
  iconName: 'calculator-variant',
  heroIconName: 'calculator-variant',
  gradient: ['#E4DBC6', '#C5B58A', '#FBF6EA'],
};

const WAREHOUSE: JobFlavour = {
  family: 'warehouse',
  iconName: 'package-variant-closed',
  heroIconName: 'warehouse',
  gradient: ['#E0DCCF', '#BCB59A', '#FBF6EA'],
};

/** Events / craft services. */
const MEHNDI: JobFlavour = {
  family: 'mehndi',
  iconName: 'flower',
  heroIconName: 'flower',
  gradient: ['#EFD5CE', '#D9AB9C', '#FBF6EA'],
};

const DECORATOR: JobFlavour = {
  family: 'decorator',
  iconName: 'flower-tulip',
  heroIconName: 'flower-tulip',
  gradient: ['#F1DBE2', '#D9B5C1', '#FBF6EA'],
};

const PHOTOGRAPHER: JobFlavour = {
  family: 'photographer',
  iconName: 'camera',
  heroIconName: 'camera',
  gradient: ['#DCDFE7', '#B0B6C7', '#FBF6EA'],
};

/** White-collar. */
const OFFICE_ADMIN: JobFlavour = {
  family: 'office_admin',
  iconName: 'account-tie',
  heroIconName: 'account-tie',
  gradient: ['#DCE3EA', '#B5C2D3', '#FBF6EA'],
};

const DATA_ENTRY: JobFlavour = {
  family: 'data_entry',
  iconName: 'pencil-ruler',
  heroIconName: 'pencil-ruler',
  gradient: ['#DCDFEA', '#B5BAD3', '#FBF6EA'],
};

const ACCOUNTANT: JobFlavour = {
  family: 'accountant',
  iconName: 'calculator-variant',
  heroIconName: 'calculator-variant',
  gradient: ['#DCE6EA', '#A9C0CB', '#FBF6EA'],
};

const TUTOR: JobFlavour = {
  family: 'tutor',
  iconName: 'school',
  heroIconName: 'school-outline',
  gradient: ['#E0DEEA', '#B7B2D3', '#FBF6EA'],
};

const TELECALLER: JobFlavour = {
  family: 'telecaller',
  iconName: 'headset',
  heroIconName: 'headset',
  gradient: ['#DCE4EA', '#A9BCCB', '#FBF6EA'],
};

/** Fallback used when nothing matches — still champagne-warm, generic glyph. */
export const DEFAULT_FLAVOUR: JobFlavour = {
  family: 'default',
  iconName: 'briefcase-outline',
  heroIconName: 'briefcase-outline',
  gradient: ['#EFE4CB', '#DCC79B', '#FBF6EA'],
};

/**
 * Slug → flavour. Slugs are the canonical trade IDs from lib/trades.ts.
 * Adding a new trade there should be paired with an entry here.
 */
const BY_SLUG: Record<string, JobFlavour> = {
  delivery: DELIVERY,
  driver_light: TRANSPORT,
  driver_heavy: HEAVY_TRUCK,

  helper: HELPER,
  mason: MASON,
  painter: PAINTER,
  carpenter: CARPENTER,
  electrician: ELECTRICIAN,
  plumber: PLUMBER,
  welder: WELDER,
  ac_technician: AC_TECH,
  mechanic: MECHANIC,

  cook: COOK,
  baker: BAKER,
  kitchen_helper: KITCHEN_HELPER,
  waiter: WAITER,

  mehndi_artist: MEHNDI,
  decorator: DECORATOR,
  photographer: PHOTOGRAPHER,

  shop_assistant: SHOP_ASSISTANT,
  cashier: CASHIER,
  warehouse: WAREHOUSE,

  security_guard: SECURITY,
  salon: SALON,
  tailor: TAILOR,
  domestic_help: DOMESTIC,
  cleaner: CLEANER,
  gardener: GARDENER,

  caregiver: CAREGIVER,
  nanny: NANNY,

  office_admin: OFFICE_ADMIN,
  data_entry: DATA_ENTRY,
  accountant: ACCOUNTANT,
  tutor: TUTOR,
  telecaller: TELECALLER,
};

/**
 * Loose keyword → flavour fallback when the job has no recognised skill
 * slug. Order matters: the first keyword that appears in the lowercased
 * title wins. Keywords are stored as substring matches, so "drivers" still
 * matches "driver".
 */
const TITLE_KEYWORDS: Array<[string, JobFlavour]> = [
  ['driver', TRANSPORT],
  ['delivery', DELIVERY],
  ['rider', DELIVERY],
  ['courier', DELIVERY],
  ['truck', HEAVY_TRUCK],
  ['lorry', HEAVY_TRUCK],
  ['cook', COOK],
  ['chef', COOK],
  ['baker', BAKER],
  ['cake', BAKER],
  ['waiter', WAITER],
  ['server', WAITER],
  ['kitchen', KITCHEN_HELPER],
  ['electric', ELECTRICIAN],
  ['plumb', PLUMBER],
  ['carpent', CARPENTER],
  ['welder', WELDER],
  ['ac ', AC_TECH],
  ['mechan', MECHANIC],
  ['mason', MASON],
  ['paint', PAINTER],
  ['clean', CLEANER],
  ['maid', DOMESTIC],
  ['housekeep', DOMESTIC],
  ['garden', GARDENER],
  ['nurse', CAREGIVER],
  ['care', CAREGIVER],
  ['nanny', NANNY],
  ['babysit', NANNY],
  ['salon', SALON],
  ['barber', SALON],
  ['beautic', SALON],
  ['tailor', TAILOR],
  ['stitch', TAILOR],
  ['security', SECURITY],
  ['guard', SECURITY],
  ['watchman', SECURITY],
  ['shop', SHOP_ASSISTANT],
  ['retail', SHOP_ASSISTANT],
  ['cashier', CASHIER],
  ['warehouse', WAREHOUSE],
  ['loader', WAREHOUSE],
  ['mehndi', MEHNDI],
  ['henna', MEHNDI],
  ['decorat', DECORATOR],
  ['photo', PHOTOGRAPHER],
  ['admin', OFFICE_ADMIN],
  ['recept', OFFICE_ADMIN],
  ['data entry', DATA_ENTRY],
  ['accountant', ACCOUNTANT],
  ['tally', ACCOUNTANT],
  ['tutor', TUTOR],
  ['teacher', TUTOR],
  ['telecall', TELECALLER],
  ['call center', TELECALLER],
  ['bpo', TELECALLER],
];

/**
 * Public API: resolve a job to its flavour. Never throws, never returns
 * null — the worst case is the neutral default. Argument is loose-typed so
 * call sites can pass any object that quacks like a job (helps tests).
 */
export function flavourForJob(
  job: { skills?: string[]; title?: string } | null | undefined,
): JobFlavour {
  if (!job) return DEFAULT_FLAVOUR;

  // 1. Match by skill slug first — most reliable signal.
  for (const slug of job.skills ?? []) {
    const hit = BY_SLUG[slug];
    if (hit) return hit;
  }

  // 2. Title keyword fallback for free-text jobs without a curated slug.
  const title = (job.title ?? '').toLowerCase();
  if (title) {
    for (const [kw, flavour] of TITLE_KEYWORDS) {
      if (title.includes(kw)) return flavour;
    }
  }

  return DEFAULT_FLAVOUR;
}
