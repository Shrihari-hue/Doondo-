/**
 * NotificationsBell — header icon with unread-count badge.
 *
 * Wired to `useUnreadCount()` which polls every minute and refetches
 * on app foreground. Tapping pushes the (yet-to-be-built) Notifications
 * list screen.
 *
 * Used in the seeker home header and (later) the employer header.
 */

import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';

interface Props {
  onPress?: () => void;
  /** Tint color for the bell glyph. Defaults to current text.primary. */
  color?: string;
}

export function NotificationsBell({ onPress, color }: Props) {
  const { theme } = useTheme();
  const { data } = useUnreadCount();
  const count = data?.count ?? 0;

  const tint = color ?? theme.text.primary;

  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress?.();
      }}
      hitSlop={10}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 22, color: tint, lineHeight: 24 }}>🔔</Text>
      {count > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: theme.status.danger,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: theme.bg.canvas,
          }}
        >
          <Text
            variant="caption"
            weight="medium"
            style={{
              color: '#FFFFFF',
              fontSize: 10,
              lineHeight: 12,
            }}
          >
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
