/**
 * JobIcon — the rounded category tile that sits on the left of every
 * employer job card on PostsScreen.
 *
 * The icon glyph and color tint are chosen from the job's title (so a
 * "Driver" post gets a steering-wheel glyph on a blue tile, a "Software
 * Engineer" post gets a laptop glyph on a violet tile, and so on). If we
 * can't recognise the title we fall back to a category derived from the
 * job's employment type (gig → ⚡, full-time → 💼, etc).
 *
 * The codebase has no SVG icon library installed (we deliberately stay on
 * pure RN Views + unicode glyphs — see EmptyState.tsx, FestivalBanner.tsx).
 * This component keeps to that convention so it works everywhere without
 * adding a new dependency.
 */

import { View } from 'react-native';
import { radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import type { JobType } from '@/api/types';

/** A recognised job category — used internally to pick the glyph + tint. */
export type JobCategory =
  | 'driver'
  | 'delivery'
  | 'software'
  | 'electrician'
  | 'plumber'
  | 'mason'
  | 'carpenter'
  | 'painter'
  | 'mechanic'
  | 'cook'
  | 'cleaner'
  | 'security'
  | 'teacher'
  | 'salon'
  | 'tailor'
  | 'farm'
  | 'helper'
  | 'office'
  | 'sales'
  | 'healthcare'
  | 'gig'
  | 'fulltime'
  | 'parttime'
  | 'shift'
  | 'contract'
  | 'generic';

interface Props {
  title: string;
  type?: JobType;
  /** Size of the tile in points. Default 44 — matches the mockup. */
  size?: number;
}

export function JobIcon({ title, type, size = 44 }: Props) {
  const { theme } = useTheme();
  const category = categoriseJob(title, type);
  const { glyph, tint } = decorate(category, theme);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.md,
        backgroundColor: tint.bg,
        borderWidth: 0.5,
        borderColor: tint.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="title"
        style={{ color: tint.fg, fontSize: Math.round(size * 0.5), lineHeight: size }}
      >
        {glyph}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Title → category lookup. Order matters — more specific phrases first.
// All checks are lowercase substring matches, so "Senior Driver" still picks
// `driver`, and "Software Engineer Intern" still picks `software`.
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_RULES: ReadonlyArray<{ keywords: readonly string[]; category: JobCategory }> = [
  { keywords: ['driver', 'chauffeur', 'cab', 'taxi', 'rider', 'auto'], category: 'driver' },
  { keywords: ['delivery', 'courier', 'parcel', 'logistics'], category: 'delivery' },
  {
    keywords: [
      'software',
      'developer',
      'engineer',
      'programmer',
      'frontend',
      'backend',
      'full stack',
      'fullstack',
      'devops',
      'data scientist',
      'data engineer',
      'designer',
      'ui',
      'ux',
      'qa',
      'tester',
    ],
    category: 'software',
  },
  { keywords: ['electrician', 'wiring', 'electrical'], category: 'electrician' },
  { keywords: ['plumber', 'plumbing'], category: 'plumber' },
  { keywords: ['mason', 'rcc', 'construction worker'], category: 'mason' },
  { keywords: ['carpenter', 'carpentry'], category: 'carpenter' },
  { keywords: ['painter', 'painting'], category: 'painter' },
  { keywords: ['mechanic', 'fitter', 'welder'], category: 'mechanic' },
  { keywords: ['cook', 'chef', 'kitchen', 'tandoor', 'barista'], category: 'cook' },
  { keywords: ['cleaner', 'housekeep', 'maid', 'janitor', 'sweeper'], category: 'cleaner' },
  { keywords: ['security', 'guard', 'bouncer', 'watchman'], category: 'security' },
  { keywords: ['teacher', 'tutor', 'instructor', 'trainer', 'faculty'], category: 'teacher' },
  { keywords: ['salon', 'barber', 'beautician', 'stylist', 'hair'], category: 'salon' },
  { keywords: ['tailor', 'stitch', 'embroidery'], category: 'tailor' },
  { keywords: ['farm', 'agri', 'harvest', 'plough', 'gardener'], category: 'farm' },
  { keywords: ['helper', 'assistant', 'labour', 'labor', 'worker'], category: 'helper' },
  {
    keywords: [
      'receptionist',
      'office',
      'admin',
      'clerk',
      'accountant',
      'manager',
      'executive',
      'analyst',
    ],
    category: 'office',
  },
  { keywords: ['sales', 'agent', 'telecaller', 'marketing', 'bd '], category: 'sales' },
  {
    keywords: ['nurse', 'doctor', 'physio', 'caretaker', 'pharma', 'medical', 'hospital'],
    category: 'healthcare',
  },
];

/** Match a title against the rules; fall back to the job's type. */
export function categoriseJob(title: string, type?: JobType): JobCategory {
  const lc = title.toLowerCase();
  for (const rule of TITLE_RULES) {
    if (rule.keywords.some((k) => lc.includes(k))) return rule.category;
  }
  switch (type) {
    case 'gig':
      return 'gig';
    case 'full_time':
      return 'fulltime';
    case 'part_time':
      return 'parttime';
    case 'shift':
      return 'shift';
    case 'contract':
      return 'contract';
    default:
      return 'generic';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Category → glyph + tint.
//
// Tints intentionally lean on a small set of named palettes so two cards in
// the same family share a colour family (e.g. all trades use amber, all
// office/desk work uses violet). The tint is theme-aware via theme.bg.muted
// for the dimmed border so it works in light, dark, and seekerLight.
// ─────────────────────────────────────────────────────────────────────────────

type Theme = ReturnType<typeof useTheme>['theme'];
type Tint = { bg: string; border: string; fg: string };

/** Six base palettes — chosen for readable contrast in both light and dark. */
function palette(theme: Theme): Record<
  'blue' | 'violet' | 'amber' | 'jade' | 'rose' | 'slate',
  Tint
> {
  return {
    blue: { bg: 'rgba(59, 130, 246, 0.14)', border: 'rgba(59, 130, 246, 0.32)', fg: '#60A5FA' },
    violet: {
      bg: 'rgba(139, 92, 246, 0.16)',
      border: 'rgba(139, 92, 246, 0.32)',
      fg: '#A78BFA',
    },
    amber: {
      bg: theme.status.warningSubtle,
      border: theme.status.warningBorder,
      fg: theme.status.warning,
    },
    jade: {
      bg: theme.status.successSubtle,
      border: theme.status.successBorder,
      fg: theme.status.success,
    },
    rose: {
      bg: theme.brand.heroSubtle,
      border: theme.brand.heroBorder,
      fg: theme.brand.hero,
    },
    slate: { bg: theme.bg.muted, border: theme.border.default, fg: theme.text.secondary },
  };
}

function decorate(category: JobCategory, theme: Theme): { glyph: string; tint: Tint } {
  const p = palette(theme);
  switch (category) {
    case 'driver':
      return { glyph: '🚗', tint: p.blue };
    case 'delivery':
      return { glyph: '📦', tint: p.amber };
    case 'software':
      return { glyph: '💻', tint: p.violet };
    case 'electrician':
      return { glyph: '⚡', tint: p.amber };
    case 'plumber':
      return { glyph: '🔧', tint: p.blue };
    case 'mason':
      return { glyph: '🧱', tint: p.rose };
    case 'carpenter':
      return { glyph: '🪚', tint: p.amber };
    case 'painter':
      return { glyph: '🎨', tint: p.violet };
    case 'mechanic':
      return { glyph: '🔩', tint: p.slate };
    case 'cook':
      return { glyph: '🍳', tint: p.rose };
    case 'cleaner':
      return { glyph: '🧹', tint: p.jade };
    case 'security':
      return { glyph: '🛡️', tint: p.slate };
    case 'teacher':
      return { glyph: '📚', tint: p.jade };
    case 'salon':
      return { glyph: '💇', tint: p.rose };
    case 'tailor':
      return { glyph: '🧵', tint: p.violet };
    case 'farm':
      return { glyph: '🌾', tint: p.jade };
    case 'helper':
      return { glyph: '🧰', tint: p.amber };
    case 'office':
      return { glyph: '🗂️', tint: p.violet };
    case 'sales':
      return { glyph: '📈', tint: p.jade };
    case 'healthcare':
      return { glyph: '🩺', tint: p.jade };
    case 'gig':
      return { glyph: '⚡', tint: p.amber };
    case 'fulltime':
      return { glyph: '💼', tint: p.blue };
    case 'parttime':
      return { glyph: '🕐', tint: p.blue };
    case 'shift':
      return { glyph: '🕓', tint: p.amber };
    case 'contract':
      return { glyph: '📄', tint: p.violet };
    case 'generic':
    default:
      return { glyph: '💼', tint: p.slate };
  }
}
