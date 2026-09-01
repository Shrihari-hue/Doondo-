import { View, type ViewProps } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'hero' | 'primary' | 'premium';

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
 *   - hero / primary → highlighted CTAs, hot jobs (blue — same tone, `hero` kept as an alias name for existing call sites)
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
    /**
     * design/theme.md: blue is the one hero color everywhere (Voice is the
     * only thing that gets orange). `hero` is kept as a name so the ~7
     * existing call sites using tone="hero" don't need touching, but it
     * now renders in brand.primary blue, not the legacy coral — same
     * values as `primary` below.
     */
    hero: {
      bg: theme.brand.primarySubtle,
      border: theme.brand.primaryBorder,
      color: theme.brand.primary,
    },
    primary: {
      bg: theme.brand.primarySubtle,
      border: theme.brand.primaryBorder,
      color: theme.brand.primary,
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
          paddingHorizontal: spacing.md, // design/components.md Chip: 12-14px
          minHeight: 32, // design/components.md Chip: 32-36px
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
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
