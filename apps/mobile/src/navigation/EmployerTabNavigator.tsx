/**
 * EmployerTabNavigator — bottom tabs for the employer role.
 *
 * Five destinations:  Home · Jobs · [Mic FAB] · Chat · You
 * The centre slot is a raised blue circular voice-search button (mic FAB).
 */

import { Pressable, View } from 'react-native';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { spacing } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from './types';
import { EmployerHomeScreen } from '@/screens/employer/EmployerHomeScreen';
import { PostsScreen } from '@/screens/employer/PostsScreen';
import { WorkersScreen } from '@/screens/employer/WorkersScreen';
import { EmployerProfileScreen } from '@/screens/employer/EmployerProfileScreen';
import { ChatListScreen } from '@/screens/chat/ChatListScreen';
import type { EmployerTabParamList } from './types';

const Tab = createBottomTabNavigator<EmployerTabParamList>();

const BLUE = '#2563EB';

// Map route → Feather icon name + label
const TAB_META: Record<
  keyof EmployerTabParamList,
  { label: string; icon: React.ComponentProps<typeof Feather>['name'] }
> = {
  EmployerHome: { label: 'Home', icon: 'home' },
  EmployerJobs: { label: 'Jobs', icon: 'briefcase' },
  Workers: { label: 'My Workers', icon: 'users' },
  Chat: { label: 'Chat', icon: 'message-circle' },
  EmployerProfile: { label: 'You', icon: 'user' },
};

export function EmployerTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={(props) => <DoondoEmployerTabBar {...props} />}
    >
      <Tab.Screen name="EmployerHome" component={EmployerHomeScreen} />
      <Tab.Screen name="EmployerJobs" component={PostsScreen} />
      {/* Workers tab sits in the middle slot but is visually replaced by the FAB */}
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
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  const activeColor = BLUE;
  const inactiveColor = isLight ? '#9CA3AF' : '#6B7280';
  const barBg = isLight ? '#FFFFFF' : '#111111';
  const barBorder = isLight ? '#E5E7EB' : '#1F1F1F';

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: barBg,
        borderTopWidth: 0.5,
        borderTopColor: barBorder,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom + spacing.xs,
        paddingHorizontal: spacing.sm,
        alignItems: 'flex-end',
      }}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const meta = TAB_META[route.name as keyof EmployerTabParamList];
        const { options } = descriptors[route.key]!;
        const isMidFAB = index === 2; // Workers slot — replaced by mic FAB

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

        if (isMidFAB) {
          // Raised blue mic FAB in the centre — opens VoiceAgent modal
          return (
            <View
              key={route.key}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voice search"
                onPress={() => { haptic('medium'); rootNav.navigate('VoiceAgent'); }}
                style={({ pressed }) => ({
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: BLUE,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 4,
                  shadowColor: BLUE,
                  shadowOpacity: 0.45,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 8,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Feather name="mic" size={26} color="#FFFFFF" />
              </Pressable>
            </View>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? meta.label}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingBottom: spacing.xs,
              gap: 3,
            }}
          >
            <Feather
              name={meta.icon}
              size={22}
              color={isFocused ? activeColor : inactiveColor}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: isFocused ? '700' : '500',
                color: isFocused ? activeColor : inactiveColor,
              }}
            >
              {meta.label}
            </Text>
            {isFocused && (
              <View
                style={{
                  position: 'absolute',
                  top: -spacing.sm,
                  width: 20,
                  height: 2,
                  backgroundColor: activeColor,
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
