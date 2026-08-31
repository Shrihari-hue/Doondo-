import { View, type ViewProps } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'hero' | 'premium';

interface Props extends Omit<ViewProps, 'children'> {
  label: string;
  /** Color intent. Default 'neutral'. */
  tone?: Tone;
  /** Optional leading character (e.g. star, dot). Kept simple — no icon component yet. */
  leading?: string;
}

/**
 * Pill — small badge for status, match scores, salary, urgency tags.
 *
 * Tone guide:
 *   - neutral  → metadata that doesn't compete (distance, type, time ago)
 *   - success  → match score, verified, completed
 *   - warning  → salary, urgent, expiring
 *   - danger   → SOS, rejected, blocked
 *   - info     → tips, neutral signals
 *   - hero     → highlighted CTAs, hot jobs
 *   - premium  → champagne — verified premium, top match, story highlights
 */
export function Pill({ label, tone = 'neutral', leading, style, ...rest }: Props) {
  const { theme } = useTheme();

  const toneMap = {
    neutral: {
      bg: theme.border.subtle,
      border: theme.border.default,
      color: theme.text.secondary,
    },
    success: {
      bg: theme.status.successSubtle,
      border: theme.status.successBorder,
      color: theme.status.success,
    },
    warning: {
      bg: theme.status.warningSubtle,
      border: theme.status.warningBorder,
      color: theme.status.warning,
    },
    danger: {
      bg: theme.status.dangerSubtle,
      border: theme.status.dangerBorder,
      color: theme.status.danger,
    },
    info: {
      bg: theme.status.infoSubtle,
      border: theme.status.infoBorder,
      color: theme.status.info,
    },
    hero: {
      bg: theme.brand.accentSubtle,
      border: theme.brand.accentBorder,
      color: theme.brand.accent,
    },
    premium: {
      bg: theme.premium.goldSubtle,
      border: theme.premium.goldBorder,
      color: theme.premium.gold,
    },
  };

  const t = toneMap[tone];

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.bg,
          borderColor: t.border,
          borderWidth: 0.5,
          borderRadius: radii.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        },
        style,
      ]}
    >
      {leading ? (
        <Text variant="footnote" weight="medium" style={{ color: t.color }}>
          {leading}
        </Text>
      ) : null}
      <Text variant="footnote" weight="medium" style={{ color: t.color }}>
        {label}
      </Text>
    </View>
  );
}
