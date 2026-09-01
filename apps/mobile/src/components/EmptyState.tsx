/**
 * EmptyState — the unified visual for "nothing here yet" + "couldn't load
 * this" + "you don't have any X". Replaces the bare two-line
 * `<Text>Nothing yet.</Text><Text>Pull down to retry.</Text>` pattern that
 * was scattered across screens and looked default-ish.
 *
 * Anatomy (top → bottom, all centred):
 *   ◯ glyph badge   (optional — soft hairline circle with an emoji/symbol)
 *   EYEBROW         (caption tertiary, letter-spaced)
 *   Title           (bodyLarge, medium weight)
 *   Message         (footnote, secondary)
 *   [CTA button]    (optional)
 *
 * The component is height-flexible — pass `tall` to fill available vertical
 * space (good for full-screen empty states on a tab) or leave default for an
 * inline empty block within a scrolling list.
 *
 * Tone matters here: empty states should feel like a quiet pause, not a
 * broken page. The eyebrow + bodyLarge title (not display) keeps the
 * register understated so this doesn't compete with the screen's real H1.
 */

import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';
import { Button } from './Button';

/**
 * Built-in illustration variants — replaces emoji glyphs with consistent
 * line-art geometric shapes. No SVG library required.
 */
type IllustrationVariant = 'jobs' | 'applicants' | 'workers' | 'calendar' | 'search' | 'check' | 'docs';

interface Props {
  /** Single character / emoji shown inside the soft hairline circle. */
  glyph?: string;
  /** Feather icon name shown inside the soft hairline circle (preferred over glyph — never emoji). */
  icon?: React.ComponentProps<typeof Feather>['name'];
  /** Built-in geometric illustration (preferred over glyph). */
  illustration?: IllustrationVariant;
  /** Small uppercase label above the title (e.g. "NOTHING SAVED"). */
  eyebrow?: string;
  /** The "what's going on" line — first thing the eye lands on. */
  title: string;
  /** One-line guidance — what to do, or what'll happen next. */
  message?: string;
  /** Optional CTA — "Browse jobs", "Retry", "Add a skill". */
  cta?: { label: string; onPress: () => void };
  /** Stretch vertically to fill available space. */
  tall?: boolean;
  /**
   * Tone of the glyph badge. 'neutral' (default), 'hero'/'accent' (the
   * small-affordance coral accent), 'blue'/'primary' (the brand-primary
   * blue — now the norm since the theme unification, both names kept as
   * aliases so existing call sites don't need touching), 'premium',
   * 'warning'.
   */
  tone?: 'neutral' | 'hero' | 'accent' | 'blue' | 'primary' | 'premium' | 'warning';
}

export function EmptyState({
  glyph,
  icon,
  illustration,
  eyebrow,
  title,
  message,
  cta,
  tall = false,
  tone = 'neutral',
}: Props) {
  const { theme } = useTheme();

  const toneMap = {
    neutral: { bg: theme.bg.muted, border: theme.border.default, color: theme.text.tertiary },
    hero: { bg: theme.brand.primarySubtle, border: theme.brand.primaryBorder, color: theme.brand.primary },
    accent: { bg: theme.brand.primarySubtle, border: theme.brand.primaryBorder, color: theme.brand.primary },
    blue: { bg: theme.brand.primarySubtle, border: theme.brand.primaryBorder, color: theme.brand.primary },
    primary: { bg: theme.brand.primarySubtle, border: theme.brand.primaryBorder, color: theme.brand.primary },
    premium: { bg: theme.premium.goldSubtle, border: theme.premium.goldBorder, color: theme.premium.gold },
    warning: { bg: theme.status.warningSubtle, border: theme.status.warningBorder, color: theme.status.warning },
  };
  const t = toneMap[tone];

  return (
    <View
      style={{
        flex: tall ? 1 : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing.xl,
      }}
    >
      {illustration ? (
        <EmptyIllustration variant={illustration} color={t.color} bg={t.bg} border={t.border} />
      ) : icon ? (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radii.pill,
            backgroundColor: t.bg,
            borderWidth: 0.5,
            borderColor: t.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.xs,
          }}
        >
          <Feather name={icon} size={26} color={t.color} />
        </View>
      ) : glyph ? (
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radii.pill,
            backgroundColor: t.bg,
            borderWidth: 0.5,
            borderColor: t.border,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.xs,
          }}
        >
          <Text variant="title" style={{ color: t.color }}>
            {glyph}
          </Text>
        </View>
      ) : null}

      {eyebrow ? (
        <Text
          variant="caption"
          tone="tertiary"
          style={{ letterSpacing: 1.2, textAlign: 'center' }}
        >
          {eyebrow}
        </Text>
      ) : null}

      <Text variant="bodyLarge" weight="medium" style={{ textAlign: 'center' }}>
        {title}
      </Text>

      {message ? (
        <Text
          variant="footnote"
          tone="secondary"
          style={{ textAlign: 'center', maxWidth: 280 }}
        >
          {message}
        </Text>
      ) : null}

      {cta ? (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch', maxWidth: 280 }}>
          <Button label={cta.label} onPress={cta.onPress} />
        </View>
      ) : null}
    </View>
  );
}

// ── Geometric line-art illustrations ─────────────────────────────────────────
function EmptyIllustration({
  variant, color, bg, border,
}: { variant: IllustrationVariant; color: string; bg: string; border: string }) {
  const { theme } = useTheme();
  const SIZE = 72;
  const c = color;
  const dim = `${c}40`;

  const shapes: Record<IllustrationVariant, React.ReactNode> = {
    jobs: (
      <>
        {/* Briefcase body */}
        <View style={{ width: 32, height: 22, borderWidth: 2, borderColor: c, borderRadius: 4, position: 'absolute', bottom: 14, left: 20 }} />
        {/* Handle */}
        <View style={{ width: 12, height: 6, borderWidth: 2, borderColor: c, borderRadius: 4, borderBottomWidth: 0, position: 'absolute', bottom: 36, left: 30 }} />
        {/* Center bar */}
        <View style={{ width: 32, height: 2, backgroundColor: c, position: 'absolute', bottom: 24, left: 20 }} />
      </>
    ),
    applicants: (
      <>
        {/* 3 people silhouettes */}
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c, position: 'absolute', top: 12, left: 16 }} />
        <View style={{ width: 14, height: 8, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderWidth: 2, borderColor: c, position: 'absolute', top: 28, left: 16 }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: dim, position: 'absolute', top: 12, left: 34 }} />
        <View style={{ width: 14, height: 8, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderWidth: 2, borderColor: dim, position: 'absolute', top: 28, left: 34 }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: dim, position: 'absolute', top: 12, left: 52 }} />
        <View style={{ width: 14, height: 8, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderWidth: 2, borderColor: dim, position: 'absolute', top: 28, left: 52 }} />
      </>
    ),
    workers: (
      <>
        {/* Person with check */}
        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c, position: 'absolute', top: 8, left: 22 }} />
        <View style={{ width: 22, height: 12, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderWidth: 2, borderColor: c, position: 'absolute', top: 28, left: 20 }} />
        {/* Checkmark circle */}
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c, position: 'absolute', top: 20, right: 10, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 10, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: theme.text.onBrand, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
        </View>
      </>
    ),
    calendar: (
      <>
        {/* Calendar body */}
        <View style={{ width: 34, height: 28, borderWidth: 2, borderColor: c, borderRadius: 4, position: 'absolute', bottom: 12, left: 19 }} />
        {/* Header band */}
        <View style={{ width: 34, height: 8, backgroundColor: c, borderTopLeftRadius: 2, borderTopRightRadius: 2, position: 'absolute', bottom: 32, left: 19 }} />
        {/* Binding rings */}
        <View style={{ width: 4, height: 8, borderWidth: 2, borderColor: c, borderRadius: 2, position: 'absolute', bottom: 34, left: 27 }} />
        <View style={{ width: 4, height: 8, borderWidth: 2, borderColor: c, borderRadius: 2, position: 'absolute', bottom: 34, left: 41 }} />
        {/* Grid dots */}
        {[0,1,2,3,4,5].map((i) => (
          <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dim, position: 'absolute', bottom: 14 + Math.floor(i/3)*8, left: 25 + (i%3)*8 }} />
        ))}
      </>
    ),
    search: (
      <>
        {/* Magnifying glass */}
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, borderColor: c, position: 'absolute', top: 10, left: 16 }} />
        {/* Handle */}
        <View style={{ width: 12, height: 2.5, backgroundColor: c, borderRadius: 2, transform: [{ rotate: '45deg' }], position: 'absolute', bottom: 16, right: 14 }} />
      </>
    ),
    check: (
      <>
        {/* Big circle */}
        <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: c, position: 'absolute', top: 9, left: 17, alignItems: 'center', justifyContent: 'center' }}>
          {/* Checkmark */}
          <View style={{ width: 18, height: 10, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: c, transform: [{ rotate: '-45deg' }], marginTop: -4 }} />
        </View>
      </>
    ),
    docs: (
      <>
        {/* Page */}
        <View style={{ width: 28, height: 36, borderWidth: 2, borderColor: c, borderRadius: 4, position: 'absolute', bottom: 10, left: 24 }} />
        {/* Folded corner */}
        <View style={{ width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 8, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 8, borderTopColor: bg, borderLeftColor: 'transparent', position: 'absolute', top: 8, right: 19 }} />
        {/* Lines */}
        {[0,1,2].map((i) => (
          <View key={i} style={{ width: 16, height: 2, backgroundColor: dim, borderRadius: 1, position: 'absolute', bottom: 16 + i*6, left: 28 }} />
        ))}
      </>
    ),
  };

  return (
    <View style={{
      width: SIZE, height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: bg,
      borderWidth: 0.5, borderColor: border,
      marginBottom: spacing.xs,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {shapes[variant]}
    </View>
  );
}
