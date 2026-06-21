/**
 * EmployerHomeScreen — redesigned to match Doondo reference design.
 *
 * Layout:
 *   - Top bar: hamburger · Doondo Employer logo · bell
 *   - Greeting + Switch to Household
 *   - Business card (icon, name, rating)
 *   - Wallet balance card (blue gradient)
 *   - Quick action tiles (Post a Job, Find Workers, My Jobs, Shortlist)
 *   - Active Jobs section
 *   - Why Employers love Doondo
 */

import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB';
const BLUE_DARK = '#1D4ED8';
const BLUE_LIGHT = '#EFF6FF';
const GREEN = '#22C55E';
const GREEN_DARK = '#16A34A';
const AMBER = '#F59E0B';

export function EmployerHomeScreen() {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 10 }),
    staleTime: 30_000,
  });

  const appsQuery = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 100 }),
    staleTime: 30_000,
  });

  const activeJobs = jobsQuery.data?.jobs ?? [];
  const applications = useMemo(() => appsQuery.data?.applications ?? [], [appsQuery.data]);

  function newAppsForJob(jobId: string) {
    return applications.filter((a) => a.jobId === jobId && a.status === 'pending').length;
  }

  const refreshing = jobsQuery.isRefetching || appsQuery.isRefetching;
  function refetch() {
    void jobsQuery.refetch();
    void appsQuery.refetch();
  }

  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const cardBg = isLight ? '#FFFFFF' : '#1A1A1A';
  const cardBorder = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: bg }}>

        {/* ── Top Logo Bar ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.sm,
            backgroundColor: bg,
          }}
        >
          <Pressable
            hitSlop={12}
            onPress={() => haptic('selection')}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Feather name="menu" size={22} color={textPrimary} />
          </Pressable>

          {/* Doondo Employer logo */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 26 }}>
              <Text style={{ color: BLUE }}>D</Text>
              <Text style={{ color: GREEN }}>oo</Text>
              <Text style={{ color: BLUE }}>ndo</Text>
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN, letterSpacing: 0.5, marginTop: -2 }}>
              Employer
            </Text>
          </View>

          <Pressable
            hitSlop={12}
            onPress={() => {
              haptic('selection');
              navigation.navigate('Notifications');
            }}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={22} color={textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={BLUE} />
          }
        >
          {/* ── Greeting Row ── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
              {timeGreeting()}, {(user?.name ?? 'there').split(' ')[0]} 👋
            </Text>
            <Pressable
              onPress={() => haptic('selection')}
              style={{
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: BLUE }}>
                Switch to Household
              </Text>
            </Pressable>
          </View>

          {/* ── Business Card ── */}
          <View
            style={{
              marginHorizontal: spacing.xl,
              marginBottom: spacing.md,
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor: cardBorder,
              borderRadius: radii.lg,
              padding: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 12,
                backgroundColor: BLUE_LIGHT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="briefcase" size={24} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
                {(user as any)?.businessName ?? user?.name ?? 'My Business'}
              </Text>
              <Text style={{ fontSize: 12, color: textSecondary, marginTop: 1 }}>
                Business Account
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Text style={{ color: AMBER, fontSize: 13 }}>★</Text>
                <Text style={{ fontSize: 12, color: textSecondary }}>
                  {(user as any)?.rating
                    ? `${(user as any).rating} (${(user as any).reviewCount ?? 0} reviews)`
                    : '4.7 (128 reviews)'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Wallet Card ── */}
          <LinearGradient
            colors={[BLUE_DARK, BLUE, '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              marginHorizontal: spacing.xl,
              marginBottom: spacing.lg,
              borderRadius: radii.lg,
              padding: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="credit-card" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' }}>
                  Wallet Balance
                </Text>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 1 }}>
                  ₹1,250
                </Text>
              </View>
            </View>
            <Pressable
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 8,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
              onPress={() => haptic('selection')}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F2937' }}>
                Add Money
              </Text>
            </Pressable>
          </LinearGradient>

          {/* ── Quick Actions ── */}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: spacing.xl,
              marginBottom: spacing.lg,
              gap: 4,
            }}
          >
            {([
              { icon: 'plus', label: 'Post a Job', bg: BLUE_LIGHT, onPress: () => navigation.navigate('PostJob') },
              { icon: 'search', label: 'Find Workers', bg: BLUE_LIGHT, onPress: () => navigation.navigate('Workers' as never) },
              { icon: 'clipboard', label: 'My Jobs', bg: '#EDE9FE', onPress: () => navigation.navigate('EmployerJobs' as never) },
              { icon: 'star', label: 'Shortlist', bg: '#FFF7ED', onPress: () => haptic('selection') },
            ] as const).map((item) => (
              <Pressable
                key={item.label}
                onPress={() => { haptic('selection'); item.onPress(); }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  gap: spacing.sm,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    backgroundColor: item.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={item.icon} size={24} color={BLUE} />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: textPrimary,
                    textAlign: 'center',
                    lineHeight: 14,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Active Jobs ── */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing.xl,
              marginBottom: spacing.md,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>
              Active Jobs
            </Text>
            <Pressable onPress={() => navigation.navigate('EmployerJobs' as never)}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
            </Pressable>
          </View>

          {activeJobs.length === 0 ? (
            <View
              style={{
                marginHorizontal: spacing.xl,
                padding: spacing.xl,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: cardBg,
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 28 }}>📋</Text>
              <Text style={{ fontSize: 14, color: textSecondary, textAlign: 'center' }}>
                No active jobs yet.{'\n'}Post one to start receiving applicants.
              </Text>
              <Pressable
                onPress={() => { haptic('selection'); navigation.navigate('PostJob'); }}
                style={{
                  backgroundColor: BLUE,
                  borderRadius: 20,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  marginTop: spacing.xs,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Post a Job</Text>
              </Pressable>
            </View>
          ) : (
            activeJobs.slice(0, 5).map((job) => {
              const newCount = newAppsForJob(job.id);
              return (
                <Pressable
                  key={job.id}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('JobDetail', { jobId: job.id });
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    marginHorizontal: spacing.xl,
                    marginBottom: spacing.sm,
                    backgroundColor: cardBg,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 23,
                      backgroundColor: isLight ? '#F3F4F6' : '#2A2A2A',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="briefcase" size={22} color={textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>
                      {job.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                      {job.type === 'full_time' ? 'Full time' : job.type === 'part_time' ? 'Part time' : 'One time'}
                    </Text>
                    <Text style={{ fontSize: 12, color: textSecondary, marginTop: 3 }}>
                      {(job as any).applicationCount ?? 0} applications
                    </Text>
                  </View>
                  {newCount > 0 && (
                    <View
                      style={{
                        backgroundColor: '#DCFCE7',
                        borderRadius: 20,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN_DARK }}>
                        {newCount} New
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}

          {/* ── Why Employers Love Doondo ── */}
          <View
            style={{
              backgroundColor: isLight ? '#F9FAFB' : '#111',
              marginTop: spacing.lg,
              padding: spacing.xl,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: textPrimary, marginBottom: spacing.md }}>
              Why Employers ❤️ Doondo
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {([
                { icon: '🎙️', title: 'Audio Search', desc: 'Find workers by speaking' },
                { icon: '📍', title: 'Map Based Search', desc: 'Find nearby workers instantly' },
                { icon: '👥', title: 'Verified Workers', desc: 'Background verified & trusted' },
                { icon: '💬', title: 'Easy Communication', desc: 'Chat or call in app' },
                { icon: '🛡️', title: 'Secure Payments', desc: 'Pay via Doondo Wallet' },
                { icon: '🎧', title: '24/7 Support', desc: 'We are here to help' },
              ] as const).map((item) => (
                <View
                  key={item.title}
                  style={{
                    width: '31%',
                    backgroundColor: cardBg,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }}
                >
                  <Text style={{ fontSize: 26, marginBottom: 6 }}>{item.icon}</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: textPrimary,
                      textAlign: 'center',
                      marginBottom: 3,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: textSecondary,
                      textAlign: 'center',
                      lineHeight: 14,
                    }}
                  >
                    {item.desc}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}
