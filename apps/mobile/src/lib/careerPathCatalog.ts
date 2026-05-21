/**
 * Career-path catalog.
 *
 * A blue-collar worker rarely sees a future past the job in front of
 * them. This catalog draws the ladder: for a trade, the rungs from
 * entry-level to manager — each with the role, typical monthly pay, and
 * the skills that unlock it. The Career Path screen renders it and
 * marks where the worker stands today.
 *
 * It's static content (ladders don't change per request), so it lives
 * mobile-side with no backend — the same pattern as the review-tag and
 * quick-reply catalogs. `titleKey` / `descKey` are i18n paths under
 * `career_path.steps.*`; pay is stored as plain rupee numbers and
 * formatted at render. Skill slugs reuse the app's trade vocabulary so
 * `prettifySkill` can label them and the worker's own `skills` can be
 * matched against them.
 */

export interface CareerStep {
  /** i18n key for the role title. */
  titleKey: string;
  /** i18n key for the one-line description. */
  descKey: string;
  /** Typical monthly pay range, rupees. */
  payMin: number;
  payMax: number;
  /** Skill slugs that unlock this rung. */
  skills: string[];
}

export interface CareerPath {
  id: 'driving' | 'construction' | 'kitchen';
  /** i18n key for the trade name. */
  nameKey: string;
  emoji: string;
  /** Rungs, entry-level first. */
  steps: CareerStep[];
}

export const CAREER_PATHS: ReadonlyArray<CareerPath> = [
  {
    id: 'driving',
    nameKey: 'career_path.path.driving',
    emoji: '🛵',
    steps: [
      {
        titleKey: 'career_path.steps.driving_1.title',
        descKey: 'career_path.steps.driving_1.desc',
        payMin: 12000,
        payMax: 18000,
        skills: ['delivery', 'two_wheeler'],
      },
      {
        titleKey: 'career_path.steps.driving_2.title',
        descKey: 'career_path.steps.driving_2.desc',
        payMin: 18000,
        payMax: 28000,
        skills: ['driving', 'lmv_license'],
      },
      {
        titleKey: 'career_path.steps.driving_3.title',
        descKey: 'career_path.steps.driving_3.desc',
        payMin: 28000,
        payMax: 40000,
        skills: ['route_planning', 'logistics'],
      },
      {
        titleKey: 'career_path.steps.driving_4.title',
        descKey: 'career_path.steps.driving_4.desc',
        payMin: 45000,
        payMax: 70000,
        skills: ['team_management', 'operations'],
      },
    ],
  },
  {
    id: 'construction',
    nameKey: 'career_path.path.construction',
    emoji: '🧱',
    steps: [
      {
        titleKey: 'career_path.steps.construction_1.title',
        descKey: 'career_path.steps.construction_1.desc',
        payMin: 12000,
        payMax: 16000,
        skills: ['helper', 'manual_labour'],
      },
      {
        titleKey: 'career_path.steps.construction_2.title',
        descKey: 'career_path.steps.construction_2.desc',
        payMin: 18000,
        payMax: 28000,
        skills: ['mason', 'masonry'],
      },
      {
        titleKey: 'career_path.steps.construction_3.title',
        descKey: 'career_path.steps.construction_3.desc',
        payMin: 30000,
        payMax: 45000,
        skills: ['site_safety', 'team_coordination'],
      },
      {
        titleKey: 'career_path.steps.construction_4.title',
        descKey: 'career_path.steps.construction_4.desc',
        payMin: 50000,
        payMax: 80000,
        skills: ['project_management', 'scheduling'],
      },
    ],
  },
  {
    id: 'kitchen',
    nameKey: 'career_path.path.kitchen',
    emoji: '🍳',
    steps: [
      {
        titleKey: 'career_path.steps.kitchen_1.title',
        descKey: 'career_path.steps.kitchen_1.desc',
        payMin: 11000,
        payMax: 15000,
        skills: ['kitchen_helper', 'food_prep'],
      },
      {
        titleKey: 'career_path.steps.kitchen_2.title',
        descKey: 'career_path.steps.kitchen_2.desc',
        payMin: 16000,
        payMax: 24000,
        skills: ['cooking', 'food_safety'],
      },
      {
        titleKey: 'career_path.steps.kitchen_3.title',
        descKey: 'career_path.steps.kitchen_3.desc',
        payMin: 26000,
        payMax: 38000,
        skills: ['menu_planning', 'kitchen_team'],
      },
      {
        titleKey: 'career_path.steps.kitchen_4.title',
        descKey: 'career_path.steps.kitchen_4.desc',
        payMin: 42000,
        payMax: 65000,
        skills: ['kitchen_management', 'inventory'],
      },
    ],
  },
];

/** Lower-cased, trimmed skill set for matching. */
function normalise(skills: ReadonlyArray<string>): Set<string> {
  return new Set(skills.map((s) => (s ?? '').trim().toLowerCase()).filter(Boolean));
}

/**
 * The worker's current rung on a path: the highest step that shares at
 * least one skill with the worker. Falls back to 0 (entry level) when
 * nothing matches — a worker browsing a trade they haven't started.
 *
 * Pure + exported for unit tests.
 */
export function currentStepIndex(
  path: CareerPath,
  workerSkills: ReadonlyArray<string>,
): number {
  const have = normalise(workerSkills);
  let idx = 0;
  path.steps.forEach((step, i) => {
    if (step.skills.some((s) => have.has(s.toLowerCase()))) idx = i;
  });
  return idx;
}

/**
 * Pick the path that best fits the worker's skills — the one with the
 * most overlap. Ties and no-overlap both fall back to the first path,
 * so the screen always opens on something sensible.
 *
 * Pure + exported for unit tests.
 */
export function bestPathForSkills(
  workerSkills: ReadonlyArray<string>,
): CareerPath {
  const have = normalise(workerSkills);
  let best = CAREER_PATHS[0]!;
  let bestScore = -1;
  for (const path of CAREER_PATHS) {
    let score = 0;
    for (const step of path.steps) {
      for (const s of step.skills) {
        if (have.has(s.toLowerCase())) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = path;
    }
  }
  return best;
}
