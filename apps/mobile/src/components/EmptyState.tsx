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
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';
import { Button } from './Button';

interface Props {
  /** Single character / emoji shown inside the soft hairline circle. */
  glyph?: string;
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
  /** Tone of the glyph badge. 'neutral' (default), 'hero', 'premium', 'warning'. */
  tone?: 'neutral' | 'hero' | 'premium' | 'warning';
}

export function EmptyState({
  glyph,
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
    hero: { bg: theme.brand.heroSubtle, border: theme.brand.heroBorder, color: theme.brand.hero },
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
      {glyph ? (
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
