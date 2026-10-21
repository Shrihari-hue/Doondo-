/**
 * SeekerTabNavigator — bottom tabs for the seeker role, blue design.
 *
 * Layout:
 *   Home | Jobs | Community | Voice | Chat | Earnings | Profile
 *
 * Community now occupies the old My Job slot, and the center slot is a
 * dedicated voice-search action that opens the VoiceAgent modal.
 *
 * Wrapped in SeekerThemeOverride so every tab inside this navigator gets
 * the royal-blue palette without flipping the employer side.
 */

import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '@/api/chat.api';
import { useUnreadCount } from '@/hooks/useNotifications';
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
import type { AppStackParamList, SeekerTabParamList } from './types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const Tab = createBottomTabNavigator<SeekerTabParamList>();
type AppNav = NativeStackNavigationProp<AppStackParamList>;

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
  const rootNavigation = useNavigation<AppNav>();
  // Badges (spec §8.1): Chat shows the number of unread threads, Home a dot
  // for unread notifications. Badges overlay the icon — never widen a tab.
  const chatQuery = useQuery({
    queryKey: ['conversations', 'tab-badge'],
    queryFn: chatApi.listMine,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadThreads = (chatQuery.data?.conversations ?? []).filter((c) => (c.unread ?? 0) > 0).length;
  const unreadNotifs = useUnreadCount().data?.count ?? 0;

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
        <View>
          <Text
            style={{
              color: isFocused ? theme.brand.hero : theme.text.tertiary,
              fontSize: 20,
              lineHeight: 22,
            }}
          >
            {meta.glyph}
          </Text>
          {name === 'Chat' && unreadThreads > 0 && (
            <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8,
              backgroundColor: theme.status.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>{unreadThreads > 9 ? '9+' : unreadThreads}</Text>
            </View>
          )}
          {name === 'Home' && unreadNotifs > 0 && (
            <View style={{ position: 'absolute', top: -1, right: -5, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.status.danger }} />
          )}
        </View>
        <Text
          variant="caption"
          weight={isFocused ? 'medium' : 'regular'}
          numberOfLines={1}
          // Spec §8.1: never truncate — shrink slightly on 320 dp / long
          // regional labels instead, and cap system font scaling.
          adjustsFontSizeToFit
          minimumFontScale={0.9}
          maxFontSizeMultiplier={1.2}
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

  function renderVoiceAction() {
    return (
      <Pressable
        key="voice-search"
        accessibilityRole="button"
        accessibilityLabel={t('tabs.voice')}
        onPress={() => {
          haptic('selection');
          rootNavigation.navigate('VoiceAgent');
        }}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.xs,
          gap: 2,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: theme.brand.hero,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: theme.brand.hero,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.24,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 18,
              lineHeight: 18,
            }}
          >
            🎤
          </Text>
        </View>
        <Text
          variant="caption"
          weight="medium"
          numberOfLines={1}
          style={{
            fontSize: 10,
            color: theme.brand.hero,
          }}
        >
          {t('tabs.voice')}
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
      {state.routes.slice(0, 3).map((_, index) => renderTab(index))}
      {renderVoiceAction()}
      {state.routes.slice(3).map((_, index) => renderTab(index + 3))}
    </View>
  );
}
