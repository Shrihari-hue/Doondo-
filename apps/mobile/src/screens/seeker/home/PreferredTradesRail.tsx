/**
 * PreferredTradesRail — the worker's own trades, across the top of the
 * Short Term feed, with an Edit affordance.
 *
 * It answers "why am I seeing these jobs?" before the worker has to ask,
 * and gives them a one-tap route to change the answer. Tapping a trade
 * jumps to the Jobs tab pre-searched for it; tapping Edit reopens the
 * Job Preferences picker in edit mode.
 *
 * When the worker has picked no trades at all this renders a prompt
 * instead — an empty rail with no explanation would just look broken.
 */

import { Pressable, ScrollView, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { TRADES } from '@/lib/trades';
import type { TFn } from '@/lib/jobFormat';

interface Props {
  /** Trade slugs from `user.skills`, in the worker's own order. */
  slugs: string[];
  t: TFn;
  onEdit: () => void;
  onSelect: (slug: string) => void;
  /** Horizontal screen gutter, so the rail can bleed to the edges. */
  gutter: number;
}

export function PreferredTradesRail({ slugs, t, onEdit, onSelect, gutter }: Props) {
  const { theme } = useTheme();

  if (slugs.length === 0) {
    return (
      <Pressable onPress={onEdit} accessibilityRole="button">
        <View
          style={{
            borderRadius: radii.xl,
            borderWidth: 0.5,
            borderColor: theme.brand.primaryBorder,
            backgroundColor: theme.brand.primarySubtle,
            padding: spacing.lg,
            gap: spacing.xs,
          }}
        >
          <Text variant="body" weight="semibold">
            {t('work_type.pick_trades')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('work_type.pick_trades_message')}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="body" weight="semibold" style={{ flex: 1 }}>
          {t('work_type.preferred_jobs')}
        </Text>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button">
          <Text variant="footnote" weight="medium" style={{ color: theme.brand.primary }}>
            {t('work_type.edit')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Negative margin + matching padding lets the rail scroll edge to
        // edge while its first tile still lines up with the screen gutter.
        style={{ marginHorizontal: -gutter }}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: spacing.md }}
      >
        {slugs.map((slug) => {
          const trade = TRADES.find((tr) => tr.slug === slug);
          return (
            <Pressable
              key={slug}
              onPress={() => {
                haptic('selection');
                onSelect(slug);
              }}
              accessibilityRole="button"
              accessibilityLabel={trade?.label ?? slug}
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <View
                style={{
                  width: 80,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: theme.border.default,
                  backgroundColor: theme.bg.surface,
                  alignItems: 'center',
                  gap: spacing.xs,
                }}
              >
                <Text variant="bodyLarge">{trade?.emoji ?? '💼'}</Text>
                <Text
                  variant="caption"
                  weight="medium"
                  numberOfLines={2}
                  style={{ textAlign: 'center' }}
                >
                  {trade?.shortLabel ?? trade?.label ?? slug}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
