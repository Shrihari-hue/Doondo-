/**
 * JobIcon — the rounded category tile that sits on the left of every
 * employer job card on PostsScreen.
 *
 * The icon and color tint are chosen from the job's title (so a "Driver"
 * post gets a truck glyph on a blue tile, a "Software Engineer" post gets
 * a code glyph on a violet tile, and so on). If we can't recognise the
 * title we fall back to a category derived from the job's employment type
 * (gig → clock, full-time → briefcase, etc).
 *
 * Icons are Feather glyphs (@expo/vector-icons) — matches the rest of the
 * app's icon convention (no emoji/unicode glyphs for UI chrome).
 */

import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { radii } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import type { JobType } from '@/api/types';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

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
  const { icon, tint } = decorate(category, theme);

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
      <Feather name={icon} size={Math.round(size * 0.46)} color={tint.fg} />
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
      bg: theme.brand.accentSubtle,
      border: theme.brand.accentBorder,
      fg: theme.brand.accent,
    },
    slate: { bg: theme.bg.muted, border: theme.border.default, fg: theme.text.secondary },
  };
}

function decorate(category: JobCategory, theme: Theme): { icon: FeatherName; tint: Tint } {
  const p = palette(theme);
  switch (category) {
    case 'driver':
      return { icon: 'truck', tint: p.blue };
    case 'delivery':
      return { icon: 'package', tint: p.amber };
    case 'software':
      return { icon: 'code', tint: p.violet };
    case 'electrician':
      return { icon: 'zap', tint: p.amber };
    case 'plumber':
      return { icon: 'droplet', tint: p.blue };
    case 'mason':
      return { icon: 'layers', tint: p.rose };
    case 'carpenter':
      return { icon: 'tool', tint: p.amber };
    case 'painter':
      return { icon: 'edit-3', tint: p.violet };
    case 'mechanic':
      return { icon: 'settings', tint: p.slate };
    case 'cook':
      return { icon: 'coffee', tint: p.rose };
    case 'cleaner':
      return { icon: 'wind', tint: p.jade };
    case 'security':
      return { icon: 'shield', tint: p.slate };
    case 'teacher':
      return { icon: 'book-open', tint: p.jade };
    case 'salon':
      return { icon: 'scissors', tint: p.rose };
    case 'tailor':
      return { icon: 'tag', tint: p.violet };
    case 'farm':
      return { icon: 'sun', tint: p.jade };
    case 'helper':
      return { icon: 'life-buoy', tint: p.amber };
    case 'office':
      return { icon: 'folder', tint: p.violet };
    case 'sales':
      return { icon: 'trending-up', tint: p.jade };
    case 'healthcare':
      return { icon: 'activity', tint: p.jade };
    case 'gig':
      return { icon: 'clock', tint: p.amber };
    case 'fulltime':
      return { icon: 'briefcase', tint: p.blue };
    case 'parttime':
      return { icon: 'watch', tint: p.blue };
    case 'shift':
      return { icon: 'sunrise', tint: p.amber };
    case 'contract':
      return { icon: 'file-text', tint: p.violet };
    case 'generic':
    default:
      return { icon: 'briefcase', tint: p.slate };
  }
}
