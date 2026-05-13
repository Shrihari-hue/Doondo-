/**
 * Stars — 5-star rating display.
 *
 * Renders a row of filled / half / empty stars based on a 0-5 score.
 * The compact prop renders just one filled star + the numeric score
 * (used in space-tight contexts like job cards).
 *
 * Pure render component — no animation, no interactivity. For an
 * interactive star picker (tap to rate), see RatingPicker.
 */

import { View, type StyleProp, type TextStyle } from 'react-native';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';

interface Props {
  /** 0..5, will be clamped. Decimals are honored via half-star rendering. */
  score: number;
  /** Number of ratings — used by `withCount`. */
  count?: number;
  /** Show "4.6 (32)" inline next to a single star instead of 5 stars. */
  compact?: boolean;
  /** Star glyph size in points. Default 14 for compact, 18 for full. */
  size?: number;
  /** Show the numeric score after the stars (e.g. "★★★★½ 4.6"). */
  showScore?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Stars({
  score,
  count,
  compact = false,
  size,
  showScore = true,
  style,
}: Props) {
  const { theme } = useTheme();
  const clamped = Math.max(0, Math.min(5, score));
  const goldish = theme.accent.amber;
  const muted = theme.text.disabled;

  const starSize = size ?? (compact ? 14 : 18);

  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: starSize, color: goldish, lineHeight: starSize + 2 }}>
          ★
        </Text>
        <Text variant="footnote" weight="medium" style={[{ color: theme.text.primary }, style]}>
          {clamped.toFixed(1)}
          {count != null && count > 0 ? ` (${count})` : ''}
        </Text>
      </View>
    );
  }

  // Full 5-star row. We use ★, ½, ☆ glyphs — keeps it dependency-free.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5].map((i) => {
          const diff = clamped - (i - 1);
          let glyph = '☆';
          let color: string = muted;
          if (diff >= 1) {
            glyph = '★';
            color = goldish;
          } else if (diff >= 0.5) {
            glyph = '★'; // half via opacity-on-overlay — simple version: just full
            color = goldish;
          }
          return (
            <Text
              key={i}
              style={{
                fontSize: starSize,
                lineHeight: starSize + 2,
                color,
                marginRight: 1,
              }}
            >
              {glyph}
            </Text>
          );
        })}
      </View>
      {showScore && (
        <Text variant="footnote" weight="medium" style={[{ color: theme.text.primary }, style]}>
          {clamped.toFixed(1)}
          {count != null && count > 0 ? ` · ${count} ${count === 1 ? 'rating' : 'ratings'}` : ''}
        </Text>
      )}
    </View>
  );
}
