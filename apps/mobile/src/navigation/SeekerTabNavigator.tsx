/**
 * SeekerTabNavigator — bottom tabs for the seeker role.
 *
 * Custom tab bar so we control the look (champagne accent on active tab,
 * subtle scale animation, no default icon library). The tab icons are
 * single-character glyphs for now — Phase 2 polish swaps them for proper
 * SVG icons. Order matches the seeker mental model:
 *
 *   Jobs  → Saved → Applications → Profile
 *
 * Lazy-loading tabs via `lazy: true` keeps cold start fast — only Jobs
 * mounts on first open; the others mount on first visit.
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
import { JobsScreen } from '@/screens/seeker/JobsScreen';
import { SavedJobsScreen } from '@/screens/seeker/SavedJobsScreen';
import { ApplicationsScreen } from '@/screens/seeker/ApplicationsScreen';
import { ProfileScreen } from '@/screens/seeker/ProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { SeekerTabParamList } from './types';

const Tab = createBottomTabNavigator<SeekerTabParamList>();

const TAB_META: Record<keyof SeekerTabParamList, { label: string; glyph: string }> = {
  Jobs: { label: 'Jobs', glyph: '◇' },
  Saved: { label: 'Saved', glyph: '♡' },
  Applications: { label: 'Status', glyph: '▤' },
  Chat: { label: 'Chat', glyph: '✦' },
  Profile: { label: 'You', glyph: '◉' },
};

export function SeekerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
      tabBar={(props) => <DoondoTabBar {...props} />}
    >
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Saved" component={SavedJobsScreen} />
      <Tab.Screen name="Applications" component={ApplicationsScreen} />
      <Tab.Screen name="Chat" component={ChatListScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─── Custom tab bar ──────────────────────────────────────────────────────────

function DoondoTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
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
        const meta = TAB_META[route.name as keyof SeekerTabParamList];
        const { options } = descriptors[route.key]!;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            haptic('selection');
            // Tab routes have no params — cast through unknown to satisfy
            // the TS inference for the polymorphic navigate signature.
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
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
