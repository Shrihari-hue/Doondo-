import { View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

export interface Stat {
  /** The number/value — e.g. "0", "4.8", "—". */
  value: string;
  /** The label underneath — e.g. "Applications". */
  label: string;
}

interface Props {
  stats: Stat[];
}

/**
 * StatCard — equal-width statistic columns with aligned dividers.
 *
 * design/components.md's exact spec: three (or more) values in a row, each
 * column flex:1 + alignItems:center, dividers 1px wide / 60-70% height /
 * centered. This is what design/layout.md §8 calls out by name as a
 * frequent alignment bug ("the three numbers... must not be positioned
 * independently") — always reach for this instead of hand-rolling a stats
 * row per screen.
 */
export function StatCard({ stats }: Props) {
  const { theme } = useTheme();

  return (
    <View style={{ flexDirection: 'row' }}>
      {stats.map((stat, index) => (
        <View key={stat.label} style={{ flexDirection: 'row', flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="title" weight="semibold" tone="primary">
              {stat.value}
            </Text>
            <Text variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {stat.label}
            </Text>
          </View>
          {index < stats.length - 1 ? (
            <View
              style={{
                width: 1,
                alignSelf: 'center',
                height: '65%',
                backgroundColor: theme.border.default,
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
