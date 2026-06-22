/**
 * EmployerTabNavigator — bottom tabs for the employer role.
 *
 * Five destinations:  Home · Jobs · [Mic FAB] · Chat · You
 * The centre slot is a raised blue circular voice-search button (mic FAB).
 */

import { Animated, Dimensions, Modal, Pressable, TextInput, View } from 'react-native';
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { spacing } from '@doondo/tokens';
import { Text, BlurOverlay } from '@/components';
import { jobsApi } from '@/api/jobs.api';
import { getSecure, setSecure } from '@/lib/secureStore';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
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

  // Sliding pill animation
  const TAB_COUNT = 5;
  const SCREEN_W = Dimensions.get('window').width;
  // paddingHorizontal: spacing.sm (8px) on outer container
  const TAB_W = (SCREEN_W - spacing.sm * 2) / TAB_COUNT;
  const PILL_W = TAB_W * 0.6;
  const PILL_MARGIN = (TAB_W - PILL_W) / 2;

  const pillAnim = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.spring(pillAnim, {
      toValue: state.index,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [state.index]);

  const pillTranslateX = pillAnim.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [0, 1, 2, 3, 4].map((i) => i * TAB_W),
  });

  const activeColor = BLUE;
  const inactiveColor = isLight ? '#9CA3AF' : '#6B7280';
  const barBg = isLight ? '#FFFFFF' : '#111111';
  const barBorder = isLight ? '#E5E7EB' : '#1F1F1F';

  // Live badge counts
  const applicantsQuery = useQuery({
    queryKey: ['applicants', 'employer', 'tab-badge'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
  const chatQuery = useQuery({
    queryKey: ['conversations', 'tab-badge'],
    queryFn: chatApi.listMine,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const pendingCount = (applicantsQuery.data?.applications ?? [])
    .filter((a) => a.status === 'pending').length;
  const unreadCount = (chatQuery.data?.conversations ?? [])
    .filter((c) => (c as any).unreadCount > 0).length;

  /** badge count per tab route name */
  const badges: Partial<Record<keyof typeof TAB_META, number>> = {
    Workers: pendingCount,
    Chat: unreadCount,
  };

  // Global search state (declared after applicantsQuery so it can reference its data)
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    void getSecure('recentSearches').then((raw) => {
      if (raw) setRecentSearches(JSON.parse(raw) as string[]);
    });
  }, []);

  async function saveSearch(q: string) {
    const next = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5);
    setRecentSearches(next);
    await setSecure('recentSearches', JSON.stringify(next));
  }

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }),
    staleTime: 60_000,
    enabled: showSearch,
  });

  const searchResults = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    if (!q) return { jobs: [], workers: [], applicants: [] };
    const jobs = (jobsQuery.data?.jobs ?? []).filter((j) =>
      j.title.toLowerCase().includes(q) || (j.location?.city ?? '').toLowerCase().includes(q),
    ).slice(0, 4);
    const workers = (applicantsQuery.data?.applications ?? []).filter((a) =>
      a.status === 'hired' && (a.seeker?.name ?? '').toLowerCase().includes(q),
    ).slice(0, 4);
    const applicants = (applicantsQuery.data?.applications ?? []).filter((a) =>
      a.status !== 'hired' && (a.seeker?.name ?? '').toLowerCase().includes(q),
    ).slice(0, 4);
    return { jobs, workers, applicants };
  }, [searchQ, jobsQuery.data, applicantsQuery.data]);

  return (
    <View
      style={{
        backgroundColor: barBg,
        borderTopWidth: 0.5,
        borderTopColor: barBorder,
        paddingBottom: insets.bottom + spacing.xs,
        paddingHorizontal: spacing.sm,
      }}
    >
      {/* Sliding active pill */}
      <View style={{ position: 'relative', height: 3 }} pointerEvents="none">
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: PILL_MARGIN,
            width: PILL_W,
            height: 3,
            borderRadius: 2,
            backgroundColor: BLUE,
            transform: [{ translateX: pillTranslateX }],
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', paddingTop: spacing.sm, alignItems: 'flex-end' }}>
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
                onLongPress={() => { haptic('medium'); setShowSearch(true); }}
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

        const badgeCount = badges[route.name as keyof typeof TAB_META] ?? 0;

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
            <View style={{ position: 'relative' }}>
              <Feather
                name={meta.icon}
                size={22}
                color={isFocused ? activeColor : inactiveColor}
              />
              {badgeCount > 0 && (
                <View style={{
                  position: 'absolute',
                  top: -4, right: -6,
                  minWidth: 16, height: 16,
                  borderRadius: 8,
                  backgroundColor: '#EF4444',
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                  borderWidth: 1.5,
                  borderColor: barBg,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', lineHeight: 12 }}>
                    {badgeCount > 99 ? '99+' : String(badgeCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={{
                fontSize: 10,
                fontWeight: isFocused ? '700' : '500',
                color: isFocused ? activeColor : inactiveColor,
              }}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
      </View>

      {/* ── Global Spotlight Search ── */}
      <Modal visible={showSearch} transparent animationType="fade" onRequestClose={() => { setShowSearch(false); setSearchQ(''); }}>
        <BlurOverlay intensity={60}>
          <Pressable style={{ flex: 1 }} onPress={() => { setShowSearch(false); setSearchQ(''); }}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={{
                marginTop: insets.top + 16, marginHorizontal: 16,
                backgroundColor: isLight ? '#FFFFFF' : '#0D0D0D',
                borderRadius: 20, overflow: 'hidden',
                shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
                elevation: 20,
              }}>
                {/* Search input */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 0.5, borderBottomColor: isLight ? '#E5E7EB' : '#1E1E1E' }}>
                  <Feather name="search" size={18} color={isLight ? '#9CA3AF' : '#6B7280'} />
                  <TextInput
                    autoFocus
                    placeholder="Search jobs, workers, applicants…"
                    placeholderTextColor={isLight ? '#9CA3AF' : '#6B7280'}
                    value={searchQ}
                    onChangeText={setSearchQ}
                    onSubmitEditing={() => { if (searchQ.trim()) void saveSearch(searchQ.trim()); }}
                    returnKeyType="search"
                    style={{ flex: 1, fontSize: 16, color: isLight ? '#111827' : '#F9FAFB', paddingVertical: 2 }}
                  />
                  {searchQ.length > 0 && (
                    <Pressable onPress={() => setSearchQ('')} hitSlop={8}>
                      <Feather name="x-circle" size={16} color={isLight ? '#9CA3AF' : '#6B7280'} />
                    </Pressable>
                  )}
                </View>

                {/* Results / recent */}
                <View style={{ maxHeight: 360 }}>
                  {searchQ.length === 0 ? (
                    <View style={{ padding: 16, gap: 12 }}>
                      {recentSearches.length > 0 && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isLight ? '#9CA3AF' : '#6B7280', letterSpacing: 0.5 }}>RECENT</Text>
                          {recentSearches.map((s) => (
                            <Pressable key={s} onPress={() => setSearchQ(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Feather name="clock" size={14} color={isLight ? '#D1D5DB' : '#374151'} />
                              <Text style={{ fontSize: 14, color: isLight ? '#374151' : '#D1D5DB' }}>{s}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isLight ? '#9CA3AF' : '#6B7280', letterSpacing: 0.5, marginTop: 4 }}>TRY SEARCHING</Text>
                      {['chef', 'delivery', 'bengaluru'].map((hint) => (
                        <Pressable key={hint} onPress={() => setSearchQ(hint)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Feather name="trending-up" size={14} color={BLUE} />
                          <Text style={{ fontSize: 14, color: BLUE }}>{hint}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={{ padding: 16, gap: 12 }}>
                      {searchResults.jobs.length > 0 && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isLight ? '#9CA3AF' : '#6B7280', letterSpacing: 0.5 }}>JOBS</Text>
                          {searchResults.jobs.map((j) => (
                            <Pressable key={j.id} onPress={() => { void saveSearch(searchQ.trim()); setShowSearch(false); setSearchQ(''); rootNav.navigate('PostJob', { editJobId: j.id }); }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                                <Feather name="briefcase" size={13} color={BLUE} />
                              </View>
                              <Text style={{ fontSize: 14, color: isLight ? '#111827' : '#F9FAFB' }}>{j.title}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}
                      {searchResults.workers.length > 0 && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isLight ? '#9CA3AF' : '#6B7280', letterSpacing: 0.5, marginTop: 4 }}>WORKERS</Text>
                          {searchResults.workers.map((a) => (
                            <Pressable key={a.id} onPress={() => { void saveSearch(searchQ.trim()); setShowSearch(false); setSearchQ(''); rootNav.navigate('WorkerDetail', { applicationId: a.id }); }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#16A34A18', alignItems: 'center', justifyContent: 'center' }}>
                                <Feather name="user-check" size={13} color="#16A34A" />
                              </View>
                              <Text style={{ fontSize: 14, color: isLight ? '#111827' : '#F9FAFB' }}>{a.seeker?.name ?? 'Worker'}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}
                      {searchResults.applicants.length > 0 && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isLight ? '#9CA3AF' : '#6B7280', letterSpacing: 0.5, marginTop: 4 }}>APPLICANTS</Text>
                          {searchResults.applicants.map((a) => (
                            <Pressable key={a.id} onPress={() => { void saveSearch(searchQ.trim()); setShowSearch(false); setSearchQ(''); rootNav.navigate('ApplicantDetail', { applicationId: a.id }); }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                                <Feather name="users" size={13} color={BLUE} />
                              </View>
                              <Text style={{ fontSize: 14, color: isLight ? '#111827' : '#F9FAFB' }}>{a.seeker?.name ?? 'Applicant'}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}
                      {searchResults.jobs.length === 0 && searchResults.workers.length === 0 && searchResults.applicants.length === 0 && (
                        <Text style={{ fontSize: 14, color: isLight ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingVertical: 20 }}>No results for "{searchQ}"</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          </Pressable>
        </BlurOverlay>
      </Modal>
    </View>
  );
}
