import { View, type ViewProps } from 'react-native';
import { radii, spacing } from '@doondo/tokens';
import { useTheme } from '@/theme/useTheme';

interface Props extends ViewProps {
  /**
   * Apply the champagne hairline border treatment. Use this on:
   *   - Verified profile cards
   *   - Top-match (90+) job cards
   *   - Premium subscriber indicators
   *   - Featured story cards
   *   - Hire-celebration surfaces
   *
   * Restraint matters — if every card is premium, none of them are.
   */
  premium?: boolean;
  /** Use the elevated surface color instead of standard surface. */
  elevated?: boolean;
  /** Bypass default padding (use when the child is a fullbleed image, etc). */
  flush?: boolean;
  children: React.ReactNode;
}

/**
 * Card — the standard surface for grouped content. Job cards, applicant cards,
 * info panels. Always reach for this instead of styling a <View> from scratch.
 */
export function Card({
  premium = false,
  elevated = false,
  flush = false,
  style,
  children,
  ...rest
}: Props) {
  const { theme } = useTheme();

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: elevated ? theme.bg.elevated : theme.bg.surface,
          borderRadius: radii.lg,
          borderWidth: 0.5,
          borderColor: premium ? theme.premium.hairline : theme.border.default,
          padding: flush ? 0 : spacing.lg,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
