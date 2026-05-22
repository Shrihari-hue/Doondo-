/**
 * SeekerTabNavigator — bottom tabs for the seeker role, new blue design.
 *
 * Layout:
 *   Home | Jobs | [Mic FAB] | Chat | Profile
 *
 * The mic in the center isn't a tab — it's a floating action button that
 * pushes the VoiceAgent modal. Implemented inside the tab bar so it
 * visually anchors the row; the BottomTab nav only knows about 4 real
 * tabs.
 *
 * Wrapped in SeekerThemeOverride so every tab inside this navigator gets
 * the royal-blue palette without flipping the employer side.
 */

import { Pressable, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { SeekerHomeScreen } from '@/screens/seeker/SeekerHomeScreen';
import { JobsScreen } from '@/screens/seeker/JobsScreen';
import { ProfileScreen } from '@/screens/seeker/ProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { AppStackParamList, SeekerTabParamList } from './types';

const Tab = createBottomTabNavigator<SeekerTabParamList>();

/** Glyphs only — labels resolve to translations via useTranslate(). */
const TAB_META: Record<keyof SeekerTabParamList, { i18nKey: string; glyph: string }> = {
  Home: { i18nKey: 'tabs.home', glyph: '⌂' },
  Jobs: { i18nKey: 'tabs.jobs', glyph: '◇' },
  Chat: { i18nKey: 'tabs.chat', glyph: '✦' },
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
        <Tab.Screen name="Chat" component={ChatListScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </SeekerThemeOverride>
  );
}

// ─── Custom tab bar ──────────────────────────────────────────────────────────

function DoondoTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const appNav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const t = useTranslate();

  const tabsBeforeMic: Array<keyof SeekerTabParamList> = ['Home', 'Jobs'];
  const tabsAfterMic: Array<keyof SeekerTabParamList> = ['Chat', 'Profile'];

  function renderTab(name: keyof SeekerTabParamList) {
    const routeIndex = state.routes.findIndex((r) => r.name === name);
    if (routeIndex === -1) return null;
    const route = state.routes[routeIndex]!;
    const isFocused = state.index === routeIndex;
    const meta = TAB_META[name];
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
            fontSize: 22,
            lineHeight: 24,
          }}
        >
          {meta.glyph}
        </Text>
        <Text
          variant="caption"
          weight={isFocused ? 'medium' : 'regular'}
          style={{
            fontSize: 11,
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
        paddingHorizontal: spacing.sm,
        alignItems: 'flex-end',
        minHeight: 76,
      }}
    >
      {tabsBeforeMic.map(renderTab)}

      {/* Center mic FAB — pushes the VoiceAgent modal */}
      <View
        style={{
          width: 64,
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 0,
        }}
      >
        <Pressable
          onPress={() => {
            haptic('selection');
            appNav.navigate('VoiceAgent');
          }}
          accessibilityRole="button"
          accessibilityLabel="Voice search"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.brand.hero,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -24,
            shadowColor: theme.brand.hero,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 6,
            borderWidth: 3,
            borderColor: theme.bg.surface,
          }}
        >
          <Text style={{ fontSize: 24, color: '#FFFFFF' }}>🎤</Text>
        </Pressable>
      </View>

      {tabsAfterMic.map(renderTab)}
    </View>
  );
}
