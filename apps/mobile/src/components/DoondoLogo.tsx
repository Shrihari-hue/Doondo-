/**
 * Doondo brand mark — code-only, theme-aware, no asset required.
 *
 * Recreates the brand glyph (a chunky D silhouette with three horizontal
 * gold "motion" bars stacked inside its hollow) using pure RN Views so we
 * don't need react-native-svg or a static PNG asset. Scales perfectly at
 * any size — borders, gaps, and bar dimensions are all derived from the
 * `size` prop.
 *
 * Renders in two flavours:
 *   - <DoondoMark size={N} />        — just the icon
 *   - <DoondoLockup size={N} />      — icon + "DOONDO" wordmark side-by-side
 *
 * Color rules:
 *   - The D outline uses theme.text.primary (white-ish on dark, navy on
 *     light) so it always reads with strong contrast against the canvas.
 *   - The motion bars use the champagne-gold accent — same warm tone the
 *     landing already uses for premium accents and the gold ★ Verified pill.
 *
 * If you later want pixel-perfect brand fidelity, drop a transparent PNG
 * at apps/mobile/assets/images/doondo-logo.png and swap this component for
 * an <Image source={...} />. The API stays the same.
 */

import { View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

interface MarkProps {
  /** Pixel size of the bounding square. Default 32. */
  size?: number;
  /** Override the D-outline color (defaults to theme.text.primary). */
  color?: string;
  /** Override the motion-bars accent (defaults to champagne gold). */
  accent?: string;
}

export function DoondoMark({ size = 32, color, accent }: MarkProps) {
  const { theme } = useTheme();
  const fg = color ?? theme.text.primary;
  const acc = accent ?? theme.premium.gold;

  // Stroke is ~16% of the size — thick enough to feel chunky, thin enough
  // to leave a generous hollow inside for the bars.
  const stroke = Math.max(3, Math.round(size * 0.16));
  const inner = size - stroke * 2;

  // Motion bars: three stacked horizontals, slightly narrower than the
  // hollow so they sit comfortably inside without touching the right curve.
  const barW = Math.round(inner * 0.62);
  const barH = Math.max(2, Math.round(size * 0.08));
  const barGap = Math.max(2, Math.round(size * 0.06));
  const stackH = barH * 3 + barGap * 2;
  const stackTop = (inner - stackH) / 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: stroke,
        borderColor: fg,
        // Right side becomes a perfect semi-circle (radius = half-height),
        // left side keeps a small radius for a clean rectilinear edge.
        // Together they read as a chunky uppercase D.
        borderTopRightRadius: size / 2,
        borderBottomRightRadius: size / 2,
        borderTopLeftRadius: stroke / 2,
        borderBottomLeftRadius: stroke / 2,
        backgroundColor: 'transparent',
      }}
    >
      <View
        style={{
          position: 'absolute',
          // Pull slightly outside the inner edge so the bars look like
          // they're emerging from the D's left edge — the brand's "motion
          // out of the mark" cue.
          left: -stroke / 3,
          top: stackTop,
          gap: barGap,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: barW,
              height: barH,
              borderRadius: barH / 2,
              backgroundColor: acc,
            }}
          />
        ))}
      </View>
    </View>
  );
}

interface LockupProps extends MarkProps {
  /** Letter-spacing on the wordmark. Default 4. */
  letterSpacing?: number;
  /** Wordmark text. Default 'DOONDO'. */
  word?: string;
  /** Wordmark text variant. Default 'titleLarge'. */
  wordVariant?: 'body' | 'bodyLarge' | 'title' | 'titleLarge' | 'display';
}

/**
 * Mark + wordmark side-by-side. Use in headers, splash screens, and the
 * brand footer. The mark sizes to the wordmark's cap height visually by
 * deriving its size from the parent prop.
 */
export function DoondoLockup({
  size = 32,
  color,
  accent,
  letterSpacing = 4,
  word = 'DOONDO',
  wordVariant = 'titleLarge',
}: LockupProps) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Math.round(size * 0.4),
      }}
    >
      <DoondoMark size={size} color={color} accent={accent} />
      <Text
        variant={wordVariant}
        weight="medium"
        style={{
          letterSpacing,
          color: color ?? theme.text.primary,
        }}
        numberOfLines={1}
      >
        {word}
      </Text>
    </View>
  );
}
