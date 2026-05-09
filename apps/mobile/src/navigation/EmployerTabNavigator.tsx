/**
 * EmployerTabNavigator — bottom tabs for the employer role.
 *
 * Same custom tab bar shape as the seeker side; different glyphs and
 * different destinations:
 *
 *   Posts → Applicants → Workforce → Profile
 */

import { Pressable, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { PostsScreen } from '@/screens/employer/PostsScreen';
import { ApplicantsScreen } from '@/screens/employer/ApplicantsScreen';
import { EmployerProfileScreen } from '@/screens/employer/EmployerProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { EmployerTabParamList } from './types';

const Tab = createBottomTabNavigator<EmployerTabParamList>();

const TAB_META: Record<keyof EmployerTabParamList, { label: string; glyph: string }> = {
  Posts: { label: 'Posts', glyph: '◊' },
  Applicants: { label: 'Applicants', glyph: '◉' },
  Chat: { label: 'Chat', glyph: '✦' },
  EmployerProfile: { label: 'You', glyph: '⌘' },
};

export function EmployerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
      tabBar={(props) => <DoondoEmployerTabBar {...props} />}
    >
      <Tab.Screen name="Posts" component={PostsScreen} />
      <Tab.Screen name="Applicants" component={ApplicantsScreen} />
      <Tab.Screen name="Chat" component={ChatListScreen} />
      <Tab.Screen
        name="EmployerProfile"
        component={EmployerProfileScreen}
        options={{ tabBarAccessibilityLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

function DoondoEmployerTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.bg.surface,
        borderTopWidth: 0.5,
        borderTopColor: theme.border.default,
        paddingTop: spacing.xs,
        paddingBottom: spacing.lg,
        paddingHorizontal: spacing.sm,
      }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const meta = TAB_META[route.name as keyof EmployerTabParamList];
        const { options } = descriptors[route.key]!;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            haptic('selection');
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: spacing.xs,
              gap: 2,
            }}
          >
            <Text
              variant="bodyLarge"
              style={{
                color: isFocused ? theme.brand.hero : theme.text.tertiary,
                fontSize: 18,
                lineHeight: 22,
              }}
            >
              {meta.glyph}
            </Text>
            <Text
              variant="footnote"
              weight={isFocused ? 'medium' : 'regular'}
              style={{
                fontSize: 11,
                color: isFocused ? theme.brand.hero : theme.text.tertiary,
              }}
            >
              {meta.label}
            </Text>
            {isFocused && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 24,
                  height: 1.5,
                  backgroundColor: theme.brand.hero,
                  borderRadius: 1,
                }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
