/**
 * WomenSafetyBadge — the "Doondo for Women" tier marker.
 *
 * A small pill shown on job detail and the Women hub when an employer
 * has declared one or more women-safety signals. The colour shifts with
 * the tier (green = high, blue = medium, neutral = basic); it renders
 * nothing for the `none` tier.
 *
 * The label is deliberately modest — "Women-safe" — and every surface
 * that places this badge also makes clear, in words nearby, that the
 * signals are *employer-declared*, not Doondo-verified.
 */

import { View } from 'react-native';
import { radii } from '@doondo/tokens';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import type { WomenSafetyTier } from '@/api/types';

interface Props {
  tier: WomenSafetyTier;
  /** Tighter padding for use inside dense card rows. */
  compact?: boolean;
}

export function WomenSafetyBadge({ tier, compact = false }: Props) {
  const { theme } = useTheme();
  const t = useTranslate();

  if (tier === 'none') return null;

  // Green for a strong record, brand-blue for medium, neutral for basic.
  const palette =
    tier === 'high'
      ? { bg: theme.status.successSubtle, fg: theme.status.success }
      : tier === 'medium'
        ? { bg: theme.brand.primarySubtle, fg: theme.brand.primary }
        : { bg: theme.bg.surface, fg: theme.text.secondary };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 3 : 5,
        borderRadius: radii.pill,
        backgroundColor: palette.bg,
      }}
    >
      <Text style={{ fontSize: compact ? 11 : 12 }}>🛡</Text>
      <Text
        variant="caption"
        weight="medium"
        style={{ color: palette.fg }}
      >
        {t('women.badge_label')}
      </Text>
    </View>
  );
}
