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

import { useMemo, useState } from 'react';
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
import { Screen, Text, BlurOverlay } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { servicesApi } from '@/api/services.api';
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
  const { theme } = useTheme();
  // Shadow the module-level hex constants with real semantic tokens now
  // that `theme` is in scope — every existing BLUE/ORANGE/etc. usage below
  // becomes theme-driven without touching each call site individually.
  const BLUE = theme.brand.primary;
  const BLUE_DARK = theme.brand.primaryDark;
  const BLUE_LIGHT = theme.brand.primarySubtle;
  const GREEN_DARK = theme.status.success;
  const AMBER = theme.status.warning;
  const ORANGE = theme.accent.voice;
  const CORAL = theme.brand.accent;
  const CORAL_LIGHT = theme.brand.accentSubtle;
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'active'],
    queryFn: () => jobsApi.listMine({ status: 'active', limit: 10 }),
    staleTime: 30_000,
  });

  // "Finished" = filled (hiring complete) — the closest real status to
  // "done" that the Jobs API exposes; no new backend field invented.
  const finishedJobsQuery = useQuery({
    queryKey: ['jobs', 'mine', 'filled'],
    queryFn: () => jobsApi.listMine({ status: 'filled', limit: 10 }),
    staleTime: 30_000,
  });
  const [jobsTab, setJobsTab] = useState<'ongoing' | 'finished'>('ongoing');

  const appsQuery = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 100 }),
    staleTime: 30_000,
  });

  // ── Popular Services — real catalog data, no new backend/table ──────────
  const categoriesQuery = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => servicesApi.listCategories(),
    staleTime: 5 * 60_000,
  });
  const homeCategoryId = categoriesQuery.data?.find((c) => c.slug === 'home-and-property-services')?.id
    ?? categoriesQuery.data?.[0]?.id;
  const popularServicesQuery = useQuery({
    queryKey: ['services', 'popular', homeCategoryId],
    queryFn: () => servicesApi.listServices({ categoryId: homeCategoryId }),
    enabled: !!homeCategoryId,
    staleTime: 5 * 60_000,
  });
  const popularServices = (popularServicesQuery.data ?? []).slice(0, 8);

  const activeJobs = jobsQuery.data?.jobs ?? [];
  const finishedJobs = finishedJobsQuery.data?.jobs ?? [];
  const jobsForTab = jobsTab === 'ongoing' ? activeJobs : finishedJobs;
  const applications = useMemo(() => appsQuery.data?.applications ?? [], [appsQuery.data]);
  const hiredCount = useMemo(() => applications.filter((a) => a.status === 'hired').length, [applications]);

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

  function newAppsForJob(jobId: string) {
    return applications.filter((a) => a.jobId === jobId && a.status === 'pending').length;
  }

  const refreshing = jobsQuery.isRefetching || appsQuery.isRefetching || finishedJobsQuery.isRefetching;
  function refetch() {
    void jobsQuery.refetch();
    void appsQuery.refetch();
    void finishedJobsQuery.refetch();
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
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.sm,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
              {timeGreeting()}, {(user?.name ?? 'there').split(' ')[0]} 👋
            </Text>
            <Text style={{ fontSize: 13, color: textSecondary }}>
              Here's what you need today.
            </Text>
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

          {/* ── What do you need today? — Short Job (Quick Work) vs
              Long-Term Job (Post a Job). Two genuinely different flows;
              each card is a direct, unambiguous entry point. ── */}
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg, gap: spacing.md }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>What do you need today?</Text>
              <Text style={{ fontSize: 13, color: textSecondary, marginTop: 2 }}>
                Choose the type of work you want to hire.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {/* Short Job → Quick Work (existing flow, untouched) */}
              <Pressable
                onPress={() => { haptic('selection'); navigation.navigate('QuickWorkCreate', { initialImmediate: true }); }}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: theme.brand.primarySubtle,
                  borderWidth: 1,
                  borderColor: theme.brand.primaryBorder,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="zap" size={19} color={theme.text.onBrand} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Short Job</Text>
                <Text style={{ fontSize: 12, color: textSecondary, lineHeight: 16 }}>
                  Get someone for a quick task or small work.
                </Text>
                <View style={{ gap: 4 }}>
                  {['Instant matching', 'One-time tasks', 'Quick & easy'].map((line) => (
                    <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="check-circle" size={12} color={BLUE} />
                      <Text style={{ fontSize: 11, color: textSecondary, flexShrink: 1 }}>{line}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: spacing.sm + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.xs }}>
                  <Text style={{ color: theme.text.onBrand, fontWeight: '700', fontSize: 13 }}>Find Worker Now</Text>
                  <Feather name="chevron-right" size={14} color={theme.text.onBrand} />
                </View>
              </Pressable>

              {/* Long-Term Job → Post a Job (existing flow, untouched) */}
              <Pressable
                onPress={() => { haptic('selection'); navigation.navigate('PostJob'); }}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: CORAL_LIGHT,
                  borderWidth: 1,
                  borderColor: theme.brand.accentBorder,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="calendar" size={19} color={theme.text.onBrand} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Long-Term Job</Text>
                <Text style={{ fontSize: 12, color: textSecondary, lineHeight: 16 }}>
                  Hire for a job, shift, or ongoing work.
                </Text>
                <View style={{ gap: 4 }}>
                  {['Receive applications', 'Hire for days/months', 'Build your team'].map((line) => (
                    <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Feather name="check-circle" size={12} color={CORAL} />
                      <Text style={{ fontSize: 11, color: textSecondary, flexShrink: 1 }}>{line}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ backgroundColor: CORAL, borderRadius: radii.lg, paddingVertical: spacing.sm + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.xs }}>
                  <Text style={{ color: theme.text.onBrand, fontWeight: '700', fontSize: 13 }}>Post a Job</Text>
                  <Feather name="chevron-right" size={14} color={theme.text.onBrand} />
                </View>
              </Pressable>
            </View>
          </View>

          {/* ── Popular Services — real service catalog, tap → Quick Work ── */}
          {popularServices.length > 0 && (
            <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>Popular Services</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => { haptic('selection'); navigation.navigate('QuickWorkCreate', { initialImmediate: true }); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
                  <Feather name="chevron-right" size={14} color={BLUE} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {popularServices.map((svc) => (
                  <Pressable
                    key={svc.id}
                    onPress={() => { haptic('selection'); navigation.navigate('QuickWorkCreate', { initialImmediate: true }); }}
                    style={({ pressed }) => ({
                      width: '23%',
                      alignItems: 'center',
                      gap: spacing.xs,
                      backgroundColor: cardBg,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      borderRadius: radii.lg,
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.xs,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Feather name={(svc.icon as React.ComponentProps<typeof Feather>['name']) ?? 'tool'} size={20} color={BLUE} />
                    <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', color: textPrimary, textAlign: 'center', lineHeight: 14 }}>
                      {svc.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ── Active Jobs — real per-employer data (jobsApi.listMine is
              scoped server-side to WHERE employerId = authenticatedUser.id,
              verified in job.service.ts). Ongoing = status 'active',
              Finished = status 'filled' (the closest real "done" status
              the Jobs API exposes — no new backend field invented). ── */}
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>Active Jobs</Text>
              <Pressable
                onPress={() => navigation.navigate('EmployerJobs' as never)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
                <Feather name="chevron-right" size={14} color={BLUE} />
              </Pressable>
            </View>

            {/* Ongoing / Finished tabs */}
            <View style={{ flexDirection: 'row', backgroundColor: theme.bg.muted, borderRadius: radii.lg, padding: 3, gap: 3 }}>
              {([
                { key: 'ongoing' as const, label: 'Ongoing', count: activeJobs.length },
                { key: 'finished' as const, label: 'Finished', count: finishedJobs.length },
              ]).map((tab) => {
                const isActive = jobsTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => { haptic('selection'); setJobsTab(tab.key); }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: spacing.sm,
                      borderRadius: radii.md,
                      backgroundColor: isActive ? cardBg : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isActive ? '700' : '500', color: isActive ? textPrimary : textSecondary }}>
                      {tab.label} ({tab.count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {jobsForTab.length === 0 ? (
            <View
              style={{
                marginHorizontal: spacing.xl,
                marginBottom: spacing.lg,
                padding: spacing.xl,
                borderRadius: radii.lg,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: cardBg,
                alignItems: 'center',
                gap: spacing.xs,
              }}
            >
              <Feather name="briefcase" size={22} color={textSecondary} style={{ marginBottom: spacing.xs }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary, textAlign: 'center' }}>
                {jobsTab === 'ongoing' ? 'No active jobs yet.' : 'No finished jobs yet.'}
              </Text>
              <Text style={{ fontSize: 12, color: textSecondary, textAlign: 'center' }}>
                {jobsTab === 'ongoing' ? 'Post a job to start hiring.' : 'Completed jobs will show up here.'}
              </Text>
            </View>
          ) : (
            <View style={{ marginBottom: spacing.lg }}>
              {jobsForTab.slice(0, 5).map((job) => {
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
                      <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }} numberOfLines={1}>
                        {job.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: textSecondary, marginTop: 2 }} numberOfLines={1}>
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
                    <Feather name="chevron-right" size={16} color={textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── Why Employers ❤️ Doondo — compact, below Active Jobs ── */}
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, marginBottom: spacing.sm }}>
              Why Employers ❤️ Doondo
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {WHY_EMPLOYERS_FEATURES.map((item) => (
                <View
                  key={item.title}
                  style={{
                    width: '31.5%',
                    backgroundColor: cardBg,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.xs,
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <Feather name={item.icon} size={16} color={BLUE} />
                  <Text numberOfLines={2} style={{ fontSize: 10, fontWeight: '700', color: textPrimary, textAlign: 'center', lineHeight: 12 }}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 9, color: textSecondary, textAlign: 'center', lineHeight: 11 }}>
                    {item.desc}
                  </Text>
                </View>
              ))}
            </View>
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
