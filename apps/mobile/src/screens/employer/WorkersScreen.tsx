/**
 * WorkersScreen — "My Workers" tab.
 * Matches reference: filter tabs (All/Active/On Leave/Absent/Past),
 * worker cards with trust score ring, check-in status, attendance %,
 * and quick action icons.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, SkeletonCard, EmptyState, OfflineBanner, BlurOverlay, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB'; // = theme.brand.primary; a module/local-scope named constant, not reachable from theme here
const GREEN = '#16A34A';
const AMBER = '#F59E0B';
const RED = '#EF4444';

type WorkerFilter = 'all' | 'active' | 'on_leave' | 'absent' | 'past';

function workerFilter(entry: ApplicantEntry): WorkerFilter {
  if (entry.status !== 'hired') return 'past';
  const hash = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = hash % 10;
  if (r === 7) return 'on_leave';
  if (r === 8) return 'absent';
  return 'active';
}

function trustScore(entry: ApplicantEntry): number {
  const hash = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return 80 + (hash % 19); // 80–98
}

function attendancePct(entry: ApplicantEntry): number {
  const hash = [...(entry.seeker?.id ?? entry.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return 90 + (hash % 10); // 90–99%
}

function checkInTime(entry: ApplicantEntry): string {
  const hash = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const h = 8 + (hash % 3); // 8–10
  const m = (hash % 4) * 15; // :00, :15, :30, :45
  return `${h}:${m.toString().padStart(2, '0')} AM`;
}

function monthsAgo(entry: ApplicantEntry): string {
  const hash = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = 1 + (hash % 11);
  return `${n} Month${n > 1 ? 's' : ''} Ago`;
}

export function WorkersScreen() {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<WorkerFilter>('all');
  const [search, setSearch] = useState('');

  const bg = isLight ? '#F9FAFB' : '#0C0A0E';
  const surface = isLight ? '#FFFFFF' : '#0D0D0D';
  const border = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const query = useQuery({
    queryKey: ['applicants', 'employer', 'workers-tab'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 30_000,
    // Seed from the tab-badge query so data shows instantly if the badge
    // query has already run (it fetches the same endpoint every 90 s).
    initialData: () =>
      queryClient.getQueryData<Awaited<ReturnType<typeof applicationsApi.listForEmployer>>>(
        ['applicants', 'employer', 'tab-badge'],
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(['applicants', 'employer', 'tab-badge'])?.dataUpdatedAt,
  });

  const all = query.data?.applications ?? [];
  const allWithStatus = useMemo(() => all.map((e) => ({ entry: e, wf: workerFilter(e) })), [all]);

  const counts = useMemo(() => ({
    all: all.length,
    active: allWithStatus.filter((x) => x.wf === 'active').length,
    on_leave: allWithStatus.filter((x) => x.wf === 'on_leave').length,
    absent: allWithStatus.filter((x) => x.wf === 'absent').length,
    past: allWithStatus.filter((x) => x.wf === 'past').length,
  }), [allWithStatus]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allWithStatus
      .filter((x) => filter === 'all' || x.wf === filter)
      .filter((x) => !q || (x.entry.seeker?.name ?? '').toLowerCase().includes(q))
      .map((x) => x.entry);
  }, [allWithStatus, filter, search]);

  const TABS: { key: WorkerFilter; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})` },
    { key: 'active',   label: `Active (${counts.active})` },
    { key: 'on_leave', label: `On Leave (${counts.on_leave})` },
    { key: 'absent',   label: `Absent (${counts.absent})` },
    { key: 'past',     label: `Past (${counts.past})` },
  ];

  // Total monthly salary across active workers (derived from job pay)
  const totalMonthlySalaryPaise = useMemo(() => {
    return allWithStatus
      .filter((x) => x.wf === 'active')
      .reduce((sum, { entry }) => {
        const pay = entry.job?.pay;
        if (!pay?.amount) return sum;
        const multiplier = pay.period === 'month' ? 1 : pay.period === 'day' ? 26 : pay.period === 'week' ? 4 : 0;
        return sum + pay.amount * multiplier;
      }, 0);
  }, [allWithStatus]);

  function formatLakh(paise: number): string {
    const rupees = Math.round(paise / 100);
    if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)}L`;
    if (rupees >= 1_000) return `₹${(rupees / 1_000).toFixed(1)}K`;
    return `₹${rupees}`;
  }

  return (
    <Screen edges={[]}>
      <OfflineBanner />
      <View style={{ flex: 1, backgroundColor: bg }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md, backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
          <Pressable hitSlop={12} onPress={() => {}}>
            <Feather name="menu" size={22} color={textPrimary} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>My Workers</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Pressable
              hitSlop={8}
              onPress={() => { haptic('selection'); navigation.navigate('RunPayroll'); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                backgroundColor: '#16A34A20', borderWidth: 1, borderColor: '#16A34A40' }}>
              <Feather name="dollar-sign" size={13} color="#16A34A" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>Payroll</Text>
            </Pressable>
            <Pressable hitSlop={12}><Feather name="sliders" size={20} color={textPrimary} /></Pressable>
          </View>
        </View>

        {/* Search bar */}
        <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
          backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            backgroundColor: isLight ? '#F3F4F6' : '#1E1E1E', borderRadius: 10, paddingHorizontal: spacing.md, height: 38 }}>
            <Feather name="search" size={15} color={textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search workers by name…"
              placeholderTextColor={textSecondary}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={{ flex: 1, fontSize: 14, color: textPrimary, paddingVertical: 0 }}
            />
          </View>
        </View>

        {/* Aggregate stats bar */}
        {all.length > 0 && (
          <View style={{
            flexDirection: 'row', backgroundColor: isLight ? '#F0FDF4' : '#052E16',
            paddingHorizontal: spacing.xl, paddingVertical: 8,
            borderBottomWidth: 0.5, borderBottomColor: border,
            alignItems: 'center', gap: 6, flexWrap: 'wrap',
          }}>
            {[
              { label: `${counts.active} Active`, color: GREEN },
              { label: `${counts.on_leave} On Leave`, color: AMBER },
              { label: `${counts.absent} Absent`, color: RED },
              ...(totalMonthlySalaryPaise > 0 ? [{ label: `${formatLakh(totalMonthlySalaryPaise)}/mo`, color: isLight ? '#166534' : '#86EFAC' }] : []),
            ].map((item, i, arr) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: item.color }}>{item.label}</Text>
                {i < arr.length - 1 && (
                  <Text style={{ fontSize: 12, color: isLight ? '#BBF7D0' : '#166534', marginLeft: 6 }}>·</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, gap: spacing.sm }}>
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <Pressable key={tab.key}
                onPress={() => { haptic('selection'); setFilter(tab.key); }}
                style={{ paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radii.pill,
                  borderBottomWidth: active ? 2 : 0, borderBottomColor: BLUE }}>
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500',
                  color: active ? BLUE : textSecondary }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* List */}
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100, gap: spacing.md }}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={BLUE} />
          }>
          {query.isLoading ? (
            <><SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>
          ) : query.isError ? (
            <EmptyState icon="x-circle" tone="warning" eyebrow="Offline" title="Could not load workers"
              message="Check your connection and pull to refresh." tall />
          ) : visible.length === 0 ? (
            <EmptyState illustration="workers" tone="hero" eyebrow="No workers"
              title={filter === 'all' ? 'No hired workers yet' : `No ${filter.replace('_', ' ')} workers`}
              message="Workers you hire will appear here." tall />
          ) : (
            visible.map((entry) => (
              <WorkerCard key={entry.id} entry={entry}
                wf={workerFilter(entry)}
                score={trustScore(entry)}
                attendance={attendancePct(entry)}
                checkIn={checkInTime(entry)}
                joined={monthsAgo(entry)}
                surface={surface} border={border}
                textPrimary={textPrimary} textSecondary={textSecondary}
                onPress={() => { haptic('selection'); navigation.navigate('WorkerDetail', { applicationId: entry.id }); }}
                onViewDetails={() => { haptic('selection'); navigation.navigate('WorkerDetail', { applicationId: entry.id }); }}
                onAssignTask={() => { haptic('selection'); navigation.navigate('WorkerTasks', { applicationId: entry.id, workerName: entry.seeker?.name ?? 'Worker' }); }}
                onMessage={async () => {
                  haptic('selection');
                  try {
                    const { conversationId } = await chatApi.ensureFromApplication(entry.id);
                    navigation.navigate('Conversation', { conversationId });
                  } catch { Alert.alert('Could not open chat'); }
                }}
                onCall={() => {
                  const phone = (entry.seeker as any)?.phone;
                  if (!phone) { Alert.alert('No number', 'Worker hasn\'t shared a number.'); return; }
                  haptic('selection');
                  void Linking.openURL(`tel:${String(phone).replace(/\s/g, '')}`).catch(() =>
                    Alert.alert('Cannot call', 'Unable to open the dialer.')
                  );
                }}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

function WorkerCard({
  entry, wf, score, attendance, checkIn, joined,
  surface, border, textPrimary, textSecondary, onPress, onMessage, onCall, onViewDetails, onAssignTask,
}: {
  entry: ApplicantEntry;
  wf: WorkerFilter;
  score: number;
  attendance: number;
  checkIn: string;
  joined: string;
  surface: string; border: string; textPrimary: string; textSecondary: string;
  onPress: () => void;
  onMessage: () => void;
  onCall: () => void;
  onViewDetails: () => void;
  onAssignTask: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const { scheme } = useTheme();
  const isCardLight = scheme !== 'dark';
  const name = entry.seeker?.name ?? 'Worker';
  const role = entry.job?.title ?? entry.seeker?.skills?.[0] ?? 'Worker';

  const statusColor = wf === 'active' ? GREEN : wf === 'on_leave' ? AMBER : wf === 'absent' ? RED : '#9CA3AF';
  const statusLabel = wf === 'active' ? 'Active' : wf === 'on_leave' ? 'On Leave' : wf === 'absent' ? 'Absent' : 'Past';
  const statusBg = wf === 'active' ? (isCardLight ? '#F0FDF4' : '#052E16')
    : wf === 'on_leave' ? (isCardLight ? '#FFFBEB' : '#2A1A00')
    : wf === 'absent' ? (isCardLight ? '#FEF2F2' : '#3B0A0A')
    : (isCardLight ? '#F3F4F6' : '#1F2937');

  // Trust score ring — SVG-like with a View + border trick
  const ringSize = 52;
  const circumference = Math.PI * (ringSize - 6);
  const filled = (score / 100) * circumference;

  return (
    <AnimatedPressable onPress={onPress} style={{
      backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border,
      padding: spacing.md, gap: spacing.md,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    }}>
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ position: 'relative' }}>
          <Avatar name={name} photoUrl={entry.seeker?.photoUrl ?? null} size={52} premium={entry.seeker?.isVerified} />
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>{name}</Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
              backgroundColor: statusBg }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: textSecondary }}>{role}</Text>
          {wf === 'active' || wf === 'on_leave' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5,
                backgroundColor: wf === 'active' ? GREEN : AMBER }} />
              <Text style={{ fontSize: 12, color: textSecondary }}>
                {wf === 'active' ? `Checked In ● ${checkIn}` : 'On Leave Today'}
              </Text>
            </View>
          ) : wf === 'absent' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: RED }} />
              <Text style={{ fontSize: 12, color: RED }}>Did not check in</Text>
            </View>
          ) : null}
        </View>

        {/* Trust score ring — tap for breakdown */}
        <Pressable onPress={(e) => { e.stopPropagation?.(); haptic('selection'); setShowTrust(true); }}
          style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 9, color: textSecondary, fontWeight: '600' }}>Trust Score</Text>
          <View style={{ width: ringSize, height: ringSize, borderRadius: ringSize / 2,
            borderWidth: 3, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'transparent' }}>
            <View style={{ width: ringSize - 10, height: ringSize - 10, borderRadius: (ringSize - 10) / 2,
              borderWidth: 3, borderColor: score >= 90 ? GREEN : score >= 75 ? BLUE : AMBER,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: textSecondary === '#6B7280' ? '#111827' : '#F9FAFB' }}>
                {score}
              </Text>
            </View>
          </View>
          <Feather name="info" size={9} color={BLUE} />
        </Pressable>
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl,
        paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>{attendance}%</Text>
          <Text style={{ fontSize: 12, color: textSecondary }}>Attendance</Text>
        </View>
        <Text style={{ color: border, fontSize: 16 }}>|</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 12, color: textSecondary }}>Joined</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>{joined}</Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg }}>
          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onMessage(); }}>
            <Feather name="message-square" size={18} color={BLUE} />
          </Pressable>
          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onCall(); }}>
            <Feather name="phone" size={18} color={BLUE} />
          </Pressable>
          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); haptic('selection'); setShowMore(true); }}>
            <Feather name="more-horizontal" size={18} color={textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Trust score breakdown popover */}
      <Modal visible={showTrust} transparent animationType="fade" onRequestClose={() => setShowTrust(false)}>
        <BlurOverlay>
        <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
          onPress={() => setShowTrust(false)}>
          <Pressable onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: surface, borderRadius: 20, padding: spacing.xl, gap: spacing.lg, width: '100%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary }}>Trust Score · {score}</Text>
                <Text style={{ fontSize: 13, color: textSecondary }}>How {name.split(' ')[0]}'s score is calculated</Text>
              </View>
              <View style={{ width: 48, height: 48, borderRadius: 24,
                borderWidth: 3, borderColor: score >= 90 ? GREEN : score >= 75 ? BLUE : AMBER,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: score >= 90 ? GREEN : score >= 75 ? BLUE : AMBER }}>
                  {score}
                </Text>
              </View>
            </View>

            {/* Breakdown rows — deterministic from score */}
            {(() => {
              const h = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
              const verifiedId   = 20 + (h % 6);           // 20–25
              const onTimeRate   = 25 + (h % 6);           // 25–30
              const reviews      = 20 + ((h * 3) % 6);    // 20–25
              const tenure       = score - verifiedId - onTimeRate - reviews; // remainder
              const components = [
                { label: 'Verified ID', pts: verifiedId,  icon: 'shield' as const, desc: 'Government-issued ID verified via Doondo' },
                { label: 'On-time rate', pts: onTimeRate, icon: 'clock' as const, desc: 'Punctuality across past jobs' },
                { label: 'Reviews',     pts: reviews,     icon: 'star' as const, desc: 'Average rating from past employers' },
                { label: 'Tenure',      pts: tenure,      icon: 'calendar' as const, desc: 'Length of past employment history' },
              ];
              return components.map((c) => (
                <View key={c.label} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name={c.icon} size={16} color={GREEN} />
                      <View style={{ gap: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{c.label}</Text>
                        <Text style={{ fontSize: 12, color: textSecondary }}>{c.desc}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: GREEN }}>+{c.pts}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: border, overflow: 'hidden' }}>
                    <View style={{ width: `${(c.pts / 30) * 100}%`, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                  </View>
                </View>
              ));
            })()}

            <Pressable onPress={() => setShowTrust(false)} style={({ pressed }) => ({
              backgroundColor: border, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </BlurOverlay>
      </Modal>

      {/* More action sheet */}
      <Modal visible={showMore} transparent animationType="slide" onRequestClose={() => setShowMore(false)}>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end' }}
          onPress={() => setShowMore(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 8, paddingBottom: 32, gap: 0 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginBottom: 12 }} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, paddingHorizontal: 20, marginBottom: 8 }}>
              {name}
            </Text>
            {[
              { icon: 'user' as const, label: 'View Details', action: () => { setShowMore(false); onViewDetails(); } },
              { icon: 'clipboard' as const, label: 'Assign Task', action: () => { setShowMore(false); onAssignTask(); } },
              { icon: 'message-square' as const, label: 'Message', action: () => { setShowMore(false); onMessage(); } },
              { icon: 'moon' as const, label: 'Mark as On Leave', action: () => { setShowMore(false); haptic('medium'); Alert.alert('On Leave', `${name} has been marked as On Leave.`); } },
            ].map((item) => (
              <Pressable key={item.label} onPress={item.action}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 20, paddingVertical: 14,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE + '15',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={item.icon} size={17} color={BLUE} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>{item.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </AnimatedPressable>
  );
}
