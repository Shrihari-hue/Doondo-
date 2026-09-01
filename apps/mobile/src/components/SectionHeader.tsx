import { View } from 'react-native';
import type { ReactNode } from 'react';
import { Text } from './Text';

interface Props {
  title: string;
  /** Optional trailing action, e.g. a "See all" TextButton. Kept on the
   *  same baseline as the title per design/components.md's SectionHeader
   *  spec ("Keep title and action on the same baseline"). */
  action?: ReactNode;
}

/**
 * SectionHeader — a section title with an optional trailing action, used
 * above job lists, community feeds, profile groups, etc. Always reach for
 * this instead of a bare <Text> + inline action row so every section
 * heading in the app aligns identically.
 */
export function SectionHeader({ title, action }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text variant="bodyLarge" weight="semibold" tone="primary">
        {title}
      </Text>
      {action}
    </View>
  );
}
