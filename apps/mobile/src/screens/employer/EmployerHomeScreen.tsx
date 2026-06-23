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

import { useMemo, useCallback, useState } from 'react';
import {
  Modal,
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
import { Screen, Text, AnimatedPressable, BlurOverlay } from '@/components';
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
  const hiredCount = useMemo(() => applications.filter((a) => a.status === 'hired').length, [applications]);

  // Hired "this week" — compare appliedAt to 7 days ago
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const hiredThisWeek = useMemo(
    () => applications.filter((a) => a.status === 'hired' && new Date(a.timeline.appliedAt).getTime() > oneWeekAgo).length,
    [applications],
  );

  const counts = useMemo(() => ({
    pending:     applications.filter((a) => a.status === 'pending').length,
    shortlisted: applications.filter((a) => a.status === 'shortlisted').length,
    openRoles:   jobsQuery.data?.jobs.filter((j) => j.status === 'active').length ?? 0,
  }), [applications, jobsQuery.data]);

  // ── Document expiry alerts — scan hired workers' documents ───────────────
  const expiringDocs = useMemo(() => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const ONE_YEAR    = 365 * 24 * 60 * 60 * 1000;
    const now         = Date.now();
    const alerts: Array<{ workerName: string; docTitle: string; daysLeft: number; applicationId: string }> = [];

    for (const a of applications) {
      if (a.status !== 'hired') continue;
      const docs = (a.seeker as any)?.skillDocuments as Array<{ id: string; fileName: string; uploadedAt: string; extracted?: { title: string | null } | null }> | undefined;
      if (!docs) continue;
      for (const doc of docs) {
        // Simulate expiry: 1 year from upload date for ID-type documents
        const uploadedMs = new Date(doc.uploadedAt).getTime();
        const expiresMs  = uploadedMs + ONE_YEAR;
        const daysLeft   = Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000));
        if (daysLeft > 0 && daysLeft <= 30) {
          alerts.push({
            workerName:    a.seeker?.name ?? 'Worker',
            docTitle:      doc.extracted?.title ?? doc.fileName,
            daysLeft,
            applicationId: a.id,
          });
        }
      }
    }
    return alerts.slice(0, 3); // cap at 3 alerts
  }, [applications]);

  // ── Live activity feed — derived from applications cache ──────────────────
  type FeedEvent = { key: string; icon: string; text: string; time: string; bg: string };

  const feedEvents = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];

    for (const a of applications) {
      const name = a.seeker?.name ?? 'A worker';
      const job  = a.job?.title ?? 'a job';

      if (a.status === 'hired' && a.timeline.hiredAt) {
        events.push({
          key:  `hire-${a.id}`,
          icon: '🎉',
          text: `${name} hired for ${job}`,
          time: a.timeline.hiredAt,
          bg:   isLight ? '#F0FDF4' : '#052E16',
        });
      }
      if (a.status === 'shortlisted' && a.timeline.shortlistedAt) {
        events.push({
          key:  `short-${a.id}`,
          icon: '⭐',
          text: `${name} shortlisted for ${job}`,
          time: a.timeline.shortlistedAt,
          bg:   isLight ? '#EFF6FF' : '#1E3A5F',
        });
      }
      if (a.status === 'pending' && a.timeline.appliedAt) {
        events.push({
          key:  `apply-${a.id}`,
          icon: '👤',
          text: `${name} applied for ${job}`,
          time: a.timeline.appliedAt,
          bg:   isLight ? '#FFFBEB' : '#2A1A00',
        });
      }
      if (a.interview && a.interview.scheduledAt) {
        events.push({
          key:  `intv-${a.id}`,
          icon: '📅',
          text: `Interview with ${name} scheduled`,
          time: a.interview.scheduledAt,
          bg:   '#EDE9FE',
        });
      }
    }

    // Sort newest first, cap at 6
    return events
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 6);
  }, [applications]);

  const formatEventTime = useCallback((iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24)   return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }, []);

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

  // ── Notification tray ────────────────────────────────────────────────────
  const [showNotifTray, setShowNotifTray] = useState(false);

  // ── Profile completeness nudge ───────────────────────────────────────────
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const profileFields = [
    { label: 'Business name',     filled: !!user?.name },
    { label: 'Business location', filled: !!(user?.employerLocation?.city) },
    { label: 'Phone number',      filled: !!user?.phone },
    { label: 'Business logo',     filled: !!user?.photoUrl },
    { label: 'GST / PAN',         filled: !!(user as any)?.gstNumber || !!(user as any)?.panNumber },
  ];
  const filledCount  = profileFields.filter((f) => f.filled).length;
  const profilePct   = Math.round((filledCount / profileFields.length) * 100);
  const showNudge    = !nudgeDismissed && profilePct < 100;

  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const cardBg = isLight ? '#FFFFFF' : '#0D0D0D';
  const cardBorder = isLight ? '#E5E7EB' : '#1E1E1E';
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
            onPress={() => { haptic('selection'); setShowNotifTray(true); }}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={{ position: 'relative' }}
          >
            <Feather name="bell" size={22} color={textPrimary} />
            {counts.pending > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -6,
                minWidth: 16, height: 16, borderRadius: 8,
                backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3, borderWidth: 1.5, borderColor: bg,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>
                  {counts.pending > 99 ? '99+' : String(counts.pending)}
                </Text>
              </View>
            )}
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

          {/* ── Profile completeness nudge ── */}
          {showNudge && (
            <Pressable
              onPress={() => { haptic('selection'); navigation.navigate('EditProfile', { section: 'business_basics' }); }}
              style={({ pressed }) => ({
                marginHorizontal: spacing.xl, marginBottom: spacing.md,
                backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
                borderRadius: 14, borderWidth: 1, borderColor: BLUE + '40',
                padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {/* Segmented dot-arc progress ring */}
              <ProfileRing pct={profilePct} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isLight ? '#1E40AF' : '#93C5FD' }}>
                  Complete your profile
                </Text>
                <Text style={{ fontSize: 12, color: isLight ? '#3B82F6' : '#60A5FA' }}>
                  {filledCount}/{profileFields.length} fields done · Get 2× more applicants
                </Text>
              </View>
              <Pressable onPress={(e) => { e.stopPropagation?.(); haptic('selection'); setNudgeDismissed(true); }} hitSlop={8}>
                <Feather name="x" size={16} color={isLight ? '#3B82F6' : '#60A5FA'} />
              </Pressable>
            </Pressable>
          )}

          {/* ── Hero Gradient Summary Card ── */}
          <LinearGradient
            colors={['#1D4ED8', '#2563EB', '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.md,
              borderRadius: 20, padding: spacing.lg,
              shadowColor: '#2563EB', shadowOpacity: 0.35,
              shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            {/* Top row: heading + greeting */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>
                  Dashboard Overview
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginTop: 2 }}>
                  {appsQuery.isLoading ? 'Loading...' : `${counts.openRoles} active role${counts.openRoles !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="briefcase" size={20} color="#FFFFFF" />
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: spacing.md }} />

            {/* Stats row */}
            <View style={{ flexDirection: 'row' }}>
              {[
                { value: counts.pending, label: 'New Apps', icon: 'users' as const, onPress: () => navigation.navigate('EmployerJobs' as never) },
                { value: counts.shortlisted, label: 'Shortlisted', icon: 'bookmark' as const, onPress: () => navigation.navigate('EmployerJobs' as never) },
                { value: hiredThisWeek, label: 'Hired/wk', icon: 'user-check' as const, onPress: () => navigation.navigate('Workers' as never) },
              ].map((stat, i) => (
                <Pressable
                  key={stat.label}
                  onPress={() => { haptic('selection'); stat.onPress(); }}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    borderLeftWidth: i > 0 ? 1 : 0,
                    borderLeftColor: 'rgba(255,255,255,0.2)',
                    opacity: pressed ? 0.75 : 1,
                    paddingVertical: 2,
                  })}
                >
                  <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFFFFF', lineHeight: 32 }}>
                    {appsQuery.isLoading ? '—' : String(stat.value)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Feather name={stat.icon} size={11} color="rgba(255,255,255,0.7)" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
                      {stat.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </LinearGradient>

          {/* ── Document Expiry Alerts ── */}
          {expiringDocs.length > 0 && (
            <View style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.md,
              backgroundColor: isLight ? '#FFFBEB' : '#2A1A00', borderRadius: 14, borderWidth: 1, borderColor: isLight ? '#FDE68A' : '#78350F',
              padding: spacing.md, gap: spacing.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: isLight ? '#92400E' : '#FCD34D' }}>
                  Documents expiring soon
                </Text>
              </View>
              {expiringDocs.map((alert, i) => (
                <Pressable
                  key={i}
                  onPress={() => { haptic('selection'); navigation.navigate('WorkerDocuments', { applicationId: alert.applicationId, workerName: alert.workerName }); }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm })}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: AMBER }} />
                  <Text style={{ flex: 1, fontSize: 13, color: isLight ? '#78350F' : '#FDE68A' }} numberOfLines={1}>
                    {alert.workerName} — {alert.docTitle}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isLight ? '#B45309' : '#FCD34D' }}>
                    {alert.daysLeft}d left
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Time-Off Requests shortcut ── */}
          <AnimatedPressable
            onPress={() => { haptic('selection'); navigation.navigate('TimeOffRequests' as never); }}
            style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.md,
              backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
              borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE',
              padding: spacing.md,
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="calendar" size={18} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isLight ? '#1E40AF' : '#93C5FD' }}>Time-Off Requests</Text>
              <Text style={{ fontSize: 12, color: isLight ? '#3B82F6' : '#60A5FA' }}>Review leave requests from your crew</Text>
            </View>
            <Feather name="chevron-right" size={16} color={BLUE} />
          </AnimatedPressable>

          {/* ── Hire More Workers ── */}
          <AnimatedPressable onPress={() => { haptic('selection'); navigation.navigate('Workers' as never); }}
            style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.lg,
              backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Hire More Workers</Text>
          </AnimatedPressable>

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
              { icon: 'calendar', label: 'Attendance', bg: BLUE_LIGHT, onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'dollar-sign', label: 'Salary', bg: '#F0FDF4', onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'clipboard', label: 'Assign Task', bg: '#EDE9FE', onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'bar-chart-2', label: 'Analytics', bg: '#FFF7ED', onPress: () => { haptic('selection'); navigation.navigate('EmployerAnalytics' as never); } },
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

          {/* ── Recent Activity (live) ── */}
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>Recent Activity</Text>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('Applicants' as never)}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: cardBg, borderRadius: radii.lg, borderWidth: 1, borderColor: cardBorder, overflow: 'hidden' }}>
              {feedEvents.length === 0 ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: textSecondary }}>No activity yet — post a job to get started.</Text>
                </View>
              ) : (
                feedEvents.map((event, i) => (
                  <View key={event.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    padding: spacing.md, borderBottomWidth: i < feedEvents.length - 1 ? 1 : 0, borderBottomColor: cardBorder }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: event.bg,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{event.icon}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: textPrimary }} numberOfLines={2}>{event.text}</Text>
                    <Text style={{ fontSize: 12, color: textSecondary, flexShrink: 0 }}>{formatEventTime(event.time)}</Text>
                  </View>
                ))
              )}
            </View>
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
                      backgroundColor: isLight ? '#F3F4F6' : '#1E1E1E',
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

      {/* ── Notification Tray ── */}

      <Modal visible={showNotifTray} transparent animationType="slide" onRequestClose={() => setShowNotifTray(false)}>
        <BlurOverlay>
          <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setShowNotifTray(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={{
                backgroundColor: isLight ? '#FFFFFF' : '#0D0D0D',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingBottom: insets.bottom + spacing.xl,
                paddingTop: spacing.md,
                maxHeight: 520,
              }}>
                {/* Handle */}
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isLight ? '#D1D5DB' : '#333', alignSelf: 'center', marginBottom: spacing.md }} />

                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>Notifications</Text>
                  <Pressable hitSlop={8} onPress={() => { haptic('selection'); navigation.navigate('NotifPreferences'); setShowNotifTray(false); }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Settings</Text>
                  </Pressable>
                </View>

                {/* Groups */}
                {[
                  {
                    group: 'Applications',
                    icon: 'users' as const,
                    color: BLUE,
                    bg: BLUE_LIGHT,
                    items: applications.filter((a) => a.status === 'pending').slice(0, 3).map((a) => ({
                      id: a.id,
                      text: `${a.seeker?.name ?? 'Someone'} applied for ${a.job?.title ?? 'your job'}`,
                      time: a.timeline.appliedAt,
                    })),
                  },
                  {
                    group: 'Interviews',
                    icon: 'calendar' as const,
                    color: '#7C3AED',
                    bg: isLight ? '#F5F3FF' : '#2D1B69',
                    items: applications.filter((a) => (a as any).interview?.scheduledAt).slice(0, 2).map((a) => ({
                      id: a.id,
                      text: `Interview with ${a.seeker?.name ?? 'a candidate'} coming up`,
                      time: (a as any).interview.scheduledAt as string,
                    })),
                  },
                  {
                    group: 'Documents',
                    icon: 'file-text' as const,
                    color: AMBER,
                    bg: isLight ? '#FFFBEB' : '#2A1A00',
                    items: expiringDocs.map((d) => ({
                      id: d.applicationId,
                      text: `${d.workerName}'s ${d.docTitle} expires in ${d.daysLeft}d`,
                      time: '',
                    })),
                  },
                ].map((section) => section.items.length > 0 && (
                  <View key={section.group} style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
                      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: section.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={section.icon} size={12} color={section.color} />
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: section.color }}>{section.group}</Text>
                    </View>
                    {section.items.map((item) => (
                      <Pressable key={item.id} onPress={() => { haptic('selection'); setShowNotifTray(false); navigation.navigate('Applicants' as never); }}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
                          paddingVertical: spacing.sm,
                          borderTopWidth: 0.5, borderTopColor: isLight ? '#F3F4F6' : '#1E1E1E',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: section.color, marginTop: 6, flexShrink: 0 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: isLight ? '#374151' : '#D1D5DB', lineHeight: 19 }} numberOfLines={2}>{item.text}</Text>
                        {item.time ? (
                          <Text style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280', flexShrink: 0 }}>
                            {(() => { const m = Math.floor((Date.now() - new Date(item.time).getTime()) / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h`; })()}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ))}

                {counts.pending === 0 && expiringDocs.length === 0 && (
                  <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                    <Feather name="check-circle" size={32} color={isLight ? '#D1D5DB' : '#374151'} />
                    <Text style={{ fontSize: 14, color: isLight ? '#9CA3AF' : '#6B7280' }}>All caught up!</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Pressable>
        </BlurOverlay>
      </Modal>
    </Screen>
  );
}

// ── Profile completeness ring ─────────────────────────────────────────────────
// Segmented dot-arc: 20 dots arranged in a circle, filled proportionally to pct.
function ProfileRing({ pct }: { pct: number }) {
  const DOTS = 20;
  const SIZE = 48;
  const RADIUS = 20;
  const DOT_R = 2.5;
  const filled = Math.round((pct / 100) * DOTS);
  const isGreen = pct >= 80;
  const activeColor = isGreen ? '#16A34A' : '#2563EB';

  const dots = Array.from({ length: DOTS }, (_, i) => {
    const angle = (i / DOTS) * 2 * Math.PI - Math.PI / 2; // start at top
    const x = SIZE / 2 + RADIUS * Math.cos(angle);
    const y = SIZE / 2 + RADIUS * Math.sin(angle);
    const active = i < filled;
    return { x, y, active };
  });

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {/* Dot ring drawn with absolute positioned Views */}
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x - DOT_R,
            top: d.y - DOT_R,
            width: DOT_R * 2,
            height: DOT_R * 2,
            borderRadius: DOT_R,
            backgroundColor: d.active ? activeColor : activeColor + '25',
          }}
        />
      ))}
      {/* Center label */}
      <Text style={{ fontSize: 11, fontWeight: '800', color: activeColor }}>{pct}%</Text>
    </View>
  );
}
