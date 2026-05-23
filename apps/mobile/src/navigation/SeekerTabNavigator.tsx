/**
 * SeekerTabNavigator — bottom tabs for the seeker role, blue design.
 *
 * Layout:
 *   Home | Jobs | Community | Chat | Earnings | Profile
 *
 * Six equal-width tabs. Voice search is no longer a center FAB — it now
 * lives on the Home screen (the voice hero card), which keeps the tab
 * row uncluttered. See Doondo-Profile-Redesign-Spec.md at the repo root.
 *
 * Note: six tabs is the upper bound for a bottom bar. Labels are kept to
 * single words and the active tab is marked by colour only (it never
 * widens) so every tab stays an equal ~16.6% slice. Test at 320 dp width
 * and in every locale before shipping.
 *
 * Wrapped in SeekerThemeOverride so every tab inside this navigator gets
 * the royal-blue palette without flipping the employer side.
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
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { SeekerHomeScreen } from '@/screens/seeker/SeekerHomeScreen';
import { JobsScreen } from '@/screens/seeker/JobsScreen';
import { CommunityScreen } from '@/screens/seeker/CommunityScreen';
import { EarningsScreen } from '@/screens/seeker/EarningsScreen';
import { ProfileScreen } from '@/screens/seeker/ProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { SeekerTabParamList } from './types';

const Tab = createBottomTabNavigator<SeekerTabParamList>();

/** Glyphs only — labels resolve to translations via useTranslate(). */
const TAB_META: Record<keyof SeekerTabParamList, { i18nKey: string; glyph: string }> = {
  Home: { i18nKey: 'tabs.home', glyph: '⌂' },
  Jobs: { i18nKey: 'tabs.jobs', glyph: '◇' },
  Community: { i18nKey: 'tabs.community', glyph: '❖' },
  Chat: { i18nKey: 'tabs.chat', glyph: '✦' },
  Earnings: { i18nKey: 'tabs.earnings', glyph: '₹' },
  Profile: { i18nKey: 'tabs.profile', glyph: '◉' },
};

export function SeekerTabNavigator() {
  return (
    <SeekerThemeOverride>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          lazy: true,
        }}
        tabBar={(props) => <DoondoTabBar {...props} />}
      >
        <Tab.Screen name="Home" component={SeekerHomeScreen} />
        <Tab.Screen name="Jobs" component={JobsScreen} />
        <Tab.Screen name="Community" component={CommunityScreen} />
        <Tab.Screen name="Chat" component={ChatListScreen} />
        <Tab.Screen name="Earnings" component={EarningsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </SeekerThemeOverride>
  );
}

// ─── Custom tab bar ──────────────────────────────────────────────────────────

function DoondoTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const t = useTranslate();

  function renderTab(routeIndex: number) {
    const route = state.routes[routeIndex]!;
    const name = route.name as keyof SeekerTabParamList;
    const meta = TAB_META[name];
    if (!meta) return null;
    const isFocused = state.index === routeIndex;
    const { options } = descriptors[route.key]!;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        haptic('selection');
        navigation.navigate(name as never);
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
        // Every tab is an equal flex:1 slice — the active tab is marked by
        // colour only and never grows, so six tabs stay evenly spaced.
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.xs,
          gap: 2,
        }}
      >
        <Text
          style={{
            color: isFocused ? theme.brand.hero : theme.text.tertiary,
            fontSize: 20,
            lineHeight: 22,
          }}
        >
          {meta.glyph}
        </Text>
        <Text
          variant="caption"
          weight={isFocused ? 'medium' : 'regular'}
          numberOfLines={1}
          style={{
            fontSize: 10,
            color: isFocused ? theme.brand.hero : theme.text.tertiary,
          }}
        >
          {t(meta.i18nKey)}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.bg.surface,
        borderTopWidth: 0.5,
        borderTopColor: theme.border.default,
        paddingTop: spacing.xs,
        paddingBottom: spacing.lg,
        paddingHorizontal: spacing.xs,
        alignItems: 'flex-end',
        minHeight: 76,
      }}
    >
      {state.routes.map((_, index) => renderTab(index))}
    </View>
  );
}
