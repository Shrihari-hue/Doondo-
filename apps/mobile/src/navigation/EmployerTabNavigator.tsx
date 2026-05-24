/**
 * EmployerTabNavigator — bottom tabs for the employer role.
 *
 * Five top-level destinations (Phase E1 of the Employer-Side Spec):
 *
 *   Home → Jobs → Workers → Chat → You
 *
 * - Home is the command center — "what needs me now?".
 * - Jobs is the job-postings list (the former Posts tab).
 * - Workers unifies worker discovery + the hired workforce.
 * - Chat and You are unchanged in spirit.
 *
 * The old flat Applicants tab is gone: applicant review is reached from
 * Home's "applicants waiting on you" list and from each job.
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
import { EmployerHomeScreen } from '@/screens/employer/EmployerHomeScreen';
import { PostsScreen } from '@/screens/employer/PostsScreen';
import { WorkersScreen } from '@/screens/employer/WorkersScreen';
import { EmployerProfileScreen } from '@/screens/employer/EmployerProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { EmployerTabParamList } from './types';

const Tab = createBottomTabNavigator<EmployerTabParamList>();

const TAB_META: Record<keyof EmployerTabParamList, { label: string; glyph: string }> = {
  EmployerHome: { label: 'Home', glyph: '⌂' },
  EmployerJobs: { label: 'Jobs', glyph: '◊' },
  Workers: { label: 'Workers', glyph: '◉' },
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
      <Tab.Screen name="EmployerHome" component={EmployerHomeScreen} />
      <Tab.Screen name="EmployerJobs" component={PostsScreen} />
      <Tab.Screen name="Workers" component={WorkersScreen} />
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
