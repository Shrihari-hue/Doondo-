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
  Alert,
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

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here
const BLUE_DARK = '#1D4ED8';
const BLUE_LIGHT = '#EFF6FF';
const GREEN_DARK = '#16A34A';
const AMBER = '#F59E0B';
const ORANGE = '#F97316';
const CORAL = BLUE;
const CORAL_LIGHT = BLUE_LIGHT;

const WHY_EMPLOYERS_FEATURES: ReadonlyArray<{
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  desc: string;
}> = [
  { icon: 'mic', title: 'Audio Search', desc: 'Find workers by speaking' },
  { icon: 'map-pin', title: 'Map Based Search', desc: 'Find nearby workers instantly' },
  { icon: 'shield', title: 'Verified Workers', desc: 'Background verified & trusted' },
  { icon: 'message-circle', title: 'Easy Communication', desc: 'Chat or call in app' },
  { icon: 'lock', title: 'Secure Payments', desc: 'Pay via Doondo Wallet' },
  { icon: 'headphones', title: '24/7 Support', desc: 'We are here to help' },
];

export function EmployerHomeScreen() {
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

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
  type FeedEvent = {
    key: string;
    icon: React.ComponentProps<typeof Feather>['name'];
    color: string;
    text: string;
    time: string;
    bg: string;
  };

  const feedEvents = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];

    for (const a of applications) {
      const name = a.seeker?.name ?? 'A worker';
      const job  = a.job?.title ?? 'a job';

      if (a.status === 'hired' && a.timeline.hiredAt) {
        events.push({
          key:  `hire-${a.id}`,
          icon: 'check-circle',
          color: GREEN_DARK,
          text: `${name} hired for ${job}`,
          time: a.timeline.hiredAt,
          bg:   theme.status.successSubtle,
        });
      }
      if (a.status === 'shortlisted' && a.timeline.shortlistedAt) {
        events.push({
          key:  `short-${a.id}`,
          icon: 'star',
          color: BLUE,
          text: `${name} shortlisted for ${job}`,
          time: a.timeline.shortlistedAt,
          bg:   theme.brand.primarySubtle,
        });
      }
      if (a.status === 'pending' && a.timeline.appliedAt) {
        events.push({
          key:  `apply-${a.id}`,
          icon: 'user',
          color: AMBER,
          text: `${name} applied for ${job}`,
          time: a.timeline.appliedAt,
          bg:   theme.status.warningSubtle,
        });
      }
      if (a.interview && a.interview.scheduledAt) {
        events.push({
          key:  `intv-${a.id}`,
          icon: 'calendar',
          color: CORAL,
          text: `Interview with ${name} scheduled`,
          time: a.interview.scheduledAt,
          bg:   CORAL_LIGHT,
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

  const bg = theme.bg.canvas;
  const cardBg = theme.bg.surface;
  const cardBorder = theme.border.default;
  const textPrimary = theme.text.primary;
  const textSecondary = theme.text.secondary;

  // "Why Employers ❤️ Doondo" section — follows the system/app theme like
  // the rest of the screen, just with a slightly distinct card surface.
  const whySectionBg = theme.bg.muted;
  const whyCardBg = theme.bg.surface;
  const whyCardBorder = theme.border.default;
  const whyTitleColor = theme.text.primary;
  const whyDescColor = textSecondary;

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
            onPress={() => { haptic('selection'); setShowMenu(true); }}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Feather name="menu" size={22} color={textPrimary} />
          </Pressable>

          {/* Doondo Employer logo */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 26 }}>
              <Text style={{ color: BLUE }}>D</Text>
              <Text style={{ color: ORANGE }}>oo</Text>
              <Text style={{ color: BLUE }}>ndo</Text>
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: ORANGE, letterSpacing: 0.5, marginTop: -2 }}>
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
                backgroundColor: theme.error, alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 3, borderWidth: 1.5, borderColor: bg,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: theme.text.onBrand }}>
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
              gap: spacing.md,
            }}
          >
            <Text
              style={{ flexShrink: 1, fontSize: 17, fontWeight: '700', color: textPrimary }}
              numberOfLines={1}
            >
              {timeGreeting()}, {(user?.name ?? 'there').split(' ')[0]} 👋
            </Text>
            <Pressable
              onPress={() => haptic('selection')}
              style={{
                flexShrink: 1,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                borderRadius: 20,
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: BLUE }} numberOfLines={1}>
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
                backgroundColor: theme.brand.primarySubtle,
                borderRadius: 14, borderWidth: 1, borderColor: BLUE + '40',
                padding: spacing.md,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); haptic('selection'); setNudgeDismissed(true); }}
                hitSlop={8}
                style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 }}
              >
                <Feather name="x" size={16} color={theme.brand.primary} />
              </Pressable>

              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                {/* Segmented dot-arc progress ring */}
                <ProfileRing pct={profilePct} />
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.primary, textAlign: 'center' }}>
                    Complete your profile
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.brand.primary, textAlign: 'center' }}>
                    {filledCount}/{profileFields.length} fields done · Get 2× more applicants
                  </Text>
                </View>
              </View>
            </Pressable>
          )}

          {/* ── Hero Gradient Summary Card ── */}
          <LinearGradient
            colors={theme.brand.primaryImmersiveGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.md,
              borderRadius: 20, padding: spacing.lg,
              shadowColor: theme.brand.primary, shadowOpacity: 0.35,
              shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
              elevation: 10,
            }}
          >
            {/* Top row: heading + greeting */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.2 }}>
                  Dashboard Overview
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text.onBrand }}>
                  {appsQuery.isLoading ? 'Loading...' : `${counts.openRoles} active role${counts.openRoles !== 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name="briefcase" size={20} color={theme.text.onBrand} />
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: spacing.md }} />

            {/* Stats row — 3 equal-width columns, never touching/overlapping */}
            <View style={{ flexDirection: 'row', width: '100%' }}>
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
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.xs,
                  })}
                >
                  <Text style={{ fontSize: 26, fontWeight: '900', color: theme.text.onBrand, lineHeight: 32, textAlign: 'center' }}>
                    {appsQuery.isLoading ? '—' : String(stat.value)}
                  </Text>
                  <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
                    <Feather name={stat.icon} size={12} color="rgba(255,255,255,0.7)" />
                    <Text
                      style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.1, textAlign: 'center' }}
                      numberOfLines={1}
                    >
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
              backgroundColor: theme.status.warningSubtle, borderRadius: 14, borderWidth: 1, borderColor: theme.status.warningBorder,
              padding: spacing.md, gap: spacing.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.warning }}>
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
                  <Text style={{ flex: 1, fontSize: 13, color: theme.warning }} numberOfLines={1}>
                    {alert.workerName} — {alert.docTitle}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.warning }}>
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
              backgroundColor: theme.brand.primarySubtle,
              borderRadius: 14, borderWidth: 1,
              borderColor: isLight ? 'rgba(37,99,235,0.14)' : 'rgba(96,165,250,0.18)',
              padding: spacing.md,
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="calendar" size={18} color={BLUE} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.primary }}>Time-Off Requests</Text>
              <Text style={{ fontSize: 12, color: theme.brand.primary }}>Review leave requests from your crew</Text>
            </View>
            <Feather name="chevron-right" size={16} color={BLUE} />
          </AnimatedPressable>

          {/* ── Hire More Workers ── */}
          <AnimatedPressable onPress={() => { haptic('selection'); navigation.navigate('AvailableWorkers' as never); }}
            style={{
              marginHorizontal: spacing.xl, marginBottom: spacing.md,
              backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Feather name="plus" size={18} color={theme.text.onBrand} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>Hire More Workers</Text>
          </AnimatedPressable>

          {/* ── Business Card ── */}
          <AnimatedPressable
            onPress={() => { haptic('selection'); navigation.navigate('EmployerProfile' as never); }}
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
            <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
                {(user as any)?.businessName ?? user?.name ?? 'My Business'}
              </Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>
                Business Account
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: AMBER, fontSize: 13 }}>★</Text>
                <Text style={{ fontSize: 12, color: textSecondary }}>
                  {(user as any)?.rating
                    ? `${(user as any).rating} (${(user as any).reviewCount ?? 0} reviews)`
                    : '4.7 (128 reviews)'}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={textSecondary} />
          </AnimatedPressable>

          {/* ── Wallet Card ── */}
          <AnimatedPressable
            onPress={() => { haptic('selection'); navigation.navigate('WalletTopUp'); }}
            style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}
          >
            <LinearGradient
              colors={theme.brand.primaryImmersiveGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: radii.lg,
                padding: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
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
                  <Feather name="credit-card" size={18} color={theme.text.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>
                    Wallet Balance
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}
                  >
                    Manage your wallet and transactions
                  </Text>
                </View>
              </View>
              <Pressable
                style={{
                  backgroundColor: theme.bg.inverse,
                  borderRadius: 8,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
                onPress={() => {
                  haptic('selection');
                  navigation.navigate('WalletTopUp');
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.inverse }}>
                  Add Money
                </Text>
              </Pressable>
            </LinearGradient>
          </AnimatedPressable>

          {/* ── Quick Actions ── */}
          <View
            style={{
              flexDirection: 'row',
              width: '100%',
              paddingHorizontal: spacing.xl,
              marginBottom: spacing.lg,
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            {([
              { icon: 'calendar', label: 'Attendance', bg: BLUE_LIGHT, color: BLUE, onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'dollar-sign', label: 'Salary', bg: theme.status.successSubtle, color: GREEN_DARK, onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'clipboard', label: 'Assign Task', bg: CORAL_LIGHT, color: CORAL, onPress: () => { haptic('selection'); navigation.navigate('Workers' as never); } },
              { icon: 'bar-chart-2', label: 'Analytics', bg: theme.status.warningSubtle, color: ORANGE, onPress: () => { haptic('selection'); navigation.navigate('EmployerAnalytics' as never); } },
            ] as const).map((item) => (
              <Pressable
                key={item.label}
                onPress={() => { haptic('selection'); item.onPress(); }}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  minWidth: 0,
                  gap: spacing.sm,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: item.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={item.icon} size={22} color={item.color} />
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
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
              <Pressable
                hitSlop={8}
                onPress={() => navigation.navigate('Applicants' as never)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
                <Feather name="chevron-right" size={14} color={BLUE} />
              </Pressable>
            </View>
            <View style={{ backgroundColor: cardBg, borderRadius: radii.lg, borderWidth: 1, borderColor: cardBorder, overflow: 'hidden' }}>
              {feedEvents.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg }}>
                  <View
                    style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: BLUE_LIGHT,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="clock" size={18} color={BLUE} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>No activity yet</Text>
                    <Text style={{ fontSize: 12, color: textSecondary }}>Post a job to get started.</Text>
                  </View>
                  <View
                    style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: theme.bg.muted,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="search" size={18} color={textSecondary} />
                  </View>
                </View>
              ) : (
                feedEvents.map((event, i) => (
                  <View key={event.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    padding: spacing.md, borderBottomWidth: i < feedEvents.length - 1 ? 1 : 0, borderBottomColor: cardBorder }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: event.bg,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={event.icon} size={16} color={event.color} />
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
            <Pressable
              onPress={() => navigation.navigate('EmployerJobs' as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
              <Feather name="chevron-right" size={14} color={BLUE} />
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
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: BLUE_LIGHT,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Feather name="clipboard" size={26} color={BLUE} />
              </View>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary, textAlign: 'center' }}>
                  No active jobs yet.
                </Text>
                <Text style={{ fontSize: 13, color: textSecondary, textAlign: 'center' }}>
                  Post one to start receiving applicants.
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic('selection'); navigation.navigate('PostJob'); }}
                style={{
                  backgroundColor: BLUE,
                  borderRadius: radii.lg,
                  paddingHorizontal: spacing.xl,
                  paddingVertical: 13,
                  marginTop: spacing.xs,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: theme.text.onBrand, fontWeight: '700', fontSize: 14 }}>Post a Job</Text>
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
                      backgroundColor: theme.bg.muted,
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
                        backgroundColor: theme.status.successSubtle,
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
              backgroundColor: whySectionBg,
              marginTop: spacing.lg,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.xl,
            }}
          >
            <Text
              style={{
                fontSize: 19,
                fontWeight: '800',
                color: whyTitleColor,
                textAlign: 'center',
                marginBottom: spacing.xl,
              }}
            >
              Why Employers ❤️ Doondo
            </Text>

            {[0, 1].map((rowIndex) => (
              <View
                key={rowIndex}
                style={{
                  flexDirection: 'row',
                  gap: spacing.sm,
                  marginBottom: rowIndex === 0 ? spacing.sm : 0,
                }}
              >
                {WHY_EMPLOYERS_FEATURES.slice(rowIndex * 3, rowIndex * 3 + 3).map((item) => (
                  <View
                    key={item.title}
                    style={{
                      flex: 1,
                      minHeight: 150,
                      backgroundColor: whyCardBg,
                      borderWidth: 1,
                      borderColor: whyCardBorder,
                      borderRadius: radii.lg,
                      paddingVertical: spacing.lg,
                      paddingHorizontal: spacing.xs,
                      alignItems: 'center',
                    }}
                  >
                    {/* Fixed-height icon area — keeps titles aligned across every card */}
                    <View
                      style={{
                        height: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Feather name={item.icon} size={22} color={BLUE} />
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: whyTitleColor,
                        textAlign: 'center',
                      }}
                    >
                      {item.title}
                    </Text>
                    <View
                      style={{
                        width: 24,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: ORANGE,
                        marginTop: spacing.xs,
                        marginBottom: spacing.xs,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        color: whyDescColor,
                        textAlign: 'center',
                        lineHeight: 15,
                      }}
                    >
                      {item.desc}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* ── Hamburger Menu ── */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <BlurOverlay>
          <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setShowMenu(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={{
                backgroundColor: theme.bg.surface,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingBottom: insets.bottom + spacing.xl,
                paddingTop: spacing.md,
              }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border.strong, alignSelf: 'center', marginBottom: spacing.lg }} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text.primary, paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>Quick Access</Text>
                <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
                  {([
                    { icon: 'bar-chart-2' as const, label: 'Analytics',            description: 'View performance & insights',    onPress: () => navigation.navigate('EmployerAnalytics') },
                    { icon: 'calendar'    as const, label: 'Roster & Schedule',     description: 'Manage shifts and your team',    onPress: () => navigation.navigate('Roster') },
                    { icon: 'dollar-sign' as const, label: 'Run Payroll',           description: 'Process payments for your team', onPress: () => navigation.navigate('RunPayroll') },
                    { icon: 'clock'       as const, label: 'Time-Off Requests',     description: 'Review and approve requests',    onPress: () => navigation.navigate('TimeOffRequests') },
                    { icon: 'bell'        as const, label: 'Notification Settings', description: 'Manage alerts and preferences',  onPress: () => navigation.navigate('NotifPreferences') },
                    { icon: 'settings'    as const, label: 'Settings',              description: 'Account and app preferences',    onPress: () => navigation.navigate('Settings') },
                  ] as { icon: React.ComponentProps<typeof Feather>['name']; label: string; description: string; onPress: () => void }[]).map((item) => (
                    <QuickAccessCard
                      key={item.label}
                      icon={item.icon}
                      title={item.label}
                      description={item.description}
                      onPress={() => { haptic('selection'); setShowMenu(false); item.onPress(); }}
                    />
                  ))}
                </View>
              </View>
            </Pressable>
          </Pressable>
        </BlurOverlay>
      </Modal>

      {/* ── Notification Tray ── */}

      <Modal visible={showNotifTray} transparent animationType="slide" onRequestClose={() => setShowNotifTray(false)}>
        <BlurOverlay>
          <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setShowNotifTray(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={{
                backgroundColor: theme.bg.surface,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingBottom: insets.bottom + spacing.xl,
                paddingTop: spacing.md,
                maxHeight: 520,
              }}>
                {/* Handle */}
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border.strong, alignSelf: 'center', marginBottom: spacing.md }} />

                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text.primary }}>Notifications</Text>
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
                    color: CORAL,
                    bg: theme.brand.primarySubtle,
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
                    bg: theme.status.warningSubtle,
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
                          borderTopWidth: 0.5, borderTopColor: theme.bg.muted,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: section.color, marginTop: 6, flexShrink: 0 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: theme.text.secondary, lineHeight: 19 }} numberOfLines={2}>{item.text}</Text>
                        {item.time ? (
                          <Text style={{ fontSize: 11, color: theme.text.tertiary, flexShrink: 0 }}>
                            {(() => { const m = Math.floor((Date.now() - new Date(item.time).getTime()) / 60_000); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h`; })()}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ))}

                {counts.pending === 0 && expiringDocs.length === 0 && (
                  <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.sm }}>
                    <Feather name="check-circle" size={32} color={theme.border.strong} />
                    <Text style={{ fontSize: 14, color: theme.text.tertiary }}>All caught up!</Text>
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

// ── Quick Access card ──────────────────────────────────────────────────────────
function QuickAccessCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <LinearGradient
        colors={[blue[900], blue[800], blue[700]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 76,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: 'rgba(96,165,250,0.25)',
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(96,165,250,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(96,165,250,0.35)',
          }}
        >
          <Feather name={icon} size={19} color={blue[200]} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>{title}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: blue[300] }}>
            {description}
          </Text>
        </View>

        <Feather name="chevron-right" size={18} color={blue[300]} />
      </LinearGradient>
    </Pressable>
  );
}

// ── Profile completeness ring ─────────────────────────────────────────────────
// Segmented dot-arc: 20 dots arranged in a circle, filled proportionally to pct.
function ProfileRing({ pct }: { pct: number }) {
  const { theme } = useTheme();
  const DOTS = 20;
  const SIZE = 48;
  const RADIUS = 20;
  const DOT_R = 2.5;
  const filled = Math.round((pct / 100) * DOTS);
  const isGreen = pct >= 80;
  const activeColor = isGreen ? theme.success : theme.brand.primary;

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
