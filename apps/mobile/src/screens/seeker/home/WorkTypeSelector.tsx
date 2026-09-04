/**
 * WorkTypeSelector — the persistent Short Term / Long Term / Both control
 * that lives at the top of seeker Home.
 *
 * This is the whole point of the work-type feature: a worker changes what
 * kind of work they're looking at from Home, in one tap, and the feed
 * below re-sections immediately. No settings screen, no re-onboarding.
 *
 * Both feeds share one nearby-jobs query and are partitioned client-side,
 * so switching is instant — there is no refetch and no spinner between
 * modes.
 */

import { Pressable, View } from 'react-native';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { WorkTypeMode } from '@/stores/workType.store';
import type { TFn } from '@/lib/jobFormat';

const OPTIONS: Array<{ mode: WorkTypeMode; i18nKey: string }> = [
  { mode: 'SHORT_TERM', i18nKey: 'work_type.short_term' },
  { mode: 'LONG_TERM', i18nKey: 'work_type.long_term' },
  { mode: 'BOTH', i18nKey: 'work_type.both' },
];

interface Props {
  value: WorkTypeMode;
  onChange: (mode: WorkTypeMode) => void;
  t: TFn;
}

export function WorkTypeSelector({ value, onChange, t }: Props) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.bg.muted,
        borderRadius: radii.button,
        padding: spacing.xs,
        gap: spacing.xs,
      }}
      accessibilityRole="tablist"
    >
      {OPTIONS.map((opt) => {
        const active = opt.mode === value;
        return (
          <Pressable
            key={opt.mode}
            onPress={() => {
              if (active) return;
              haptic('selection');
              onChange(opt.mode);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              // Three equal columns — design/layout.md §5.
              flex: 1,
              backgroundColor: active ? theme.brand.primary : 'transparent',
              borderRadius: radii.md,
              paddingVertical: spacing.sm + 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              variant="footnote"
              weight={active ? 'semibold' : 'medium'}
              tone={active ? 'onBrand' : 'secondary'}
              numberOfLines={1}
            >
              {t(opt.i18nKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
