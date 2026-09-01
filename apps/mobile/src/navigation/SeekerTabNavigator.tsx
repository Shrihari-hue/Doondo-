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
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';

import { spacing } from '@doondo/tokens';
import { Text, VoiceAction } from '@/components';
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

/**
 * Feather icons, size 22 — matches the employer tab bar exactly (see
 * EmployerTabNavigator's TAB_META) so the two navigators read as the same
 * component with different destinations, not two different icon systems.
 * Labels resolve to translations via useTranslate().
 */
const TAB_META: Record<
  keyof SeekerTabParamList,
  { i18nKey: string; icon: React.ComponentProps<typeof Feather>['name'] }
> = {
  Home: { i18nKey: 'tabs.home', icon: 'home' },
  Jobs: { i18nKey: 'tabs.jobs', icon: 'briefcase' },
  Community: { i18nKey: 'tabs.community', icon: 'users' },
  Chat: { i18nKey: 'tabs.chat', icon: 'message-circle' },
  Earnings: { i18nKey: 'tabs.earnings', icon: 'credit-card' },
  Profile: { i18nKey: 'tabs.profile', icon: 'user' },
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
  const insets = useSafeAreaInsets();

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
        <Feather
          name={meta.icon}
          size={22}
          color={isFocused ? theme.brand.primary : theme.text.tertiary}
        />
        <Text
          variant="caption"
          weight={isFocused ? 'medium' : 'regular'}
          numberOfLines={1}
          style={{
            fontSize: 10,
            color: isFocused ? theme.brand.primary : theme.text.tertiary,
          }}
        >
          {t(meta.i18nKey)}
        </Text>
      </Pressable>
    );
  }

  function renderVoiceAction() {
    return (
      <View
        key="voice-search"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 2,
        }}
      >
        {/* Raised above the row per design/design.md §17 "Elevated" — the
           marginBottom lifts it without shifting the sibling tabs, which
           stay in their own flex:1 slots at the row's normal baseline. */}
        <View style={{ marginBottom: 16 }}>
          <VoiceAction
            size={42}
            accessibilityLabel={t('tabs.voice')}
            onPress={() => rootNavigation.navigate('VoiceAgent')}
          />
        </View>
        <Text
          variant="caption"
          weight="medium"
          numberOfLines={1}
          style={{
            fontSize: 10,
            color: theme.voice,
            position: 'absolute',
            bottom: spacing.xs,
          }}
        >
          {t('tabs.voice')}
        </Text>
      </View>
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
        paddingBottom: insets.bottom + spacing.xs,
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
