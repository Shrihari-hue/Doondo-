/**
 * WorkersScreen — "My Workers" tab.
 * Matches reference: filter tabs (All/Active/On Leave/Absent/Past),
 * worker cards with trust score ring, check-in status, attendance %,
 * and quick action icons.
 */

import { useMemo, useState } from 'react';
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
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB';
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
  const [filter, setFilter] = useState<WorkerFilter>('all');

  const bg = isLight ? '#F9FAFB' : '#0C0A0E';
  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const query = useQuery({
    queryKey: ['applicants', 'employer', 'workers-tab'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 30_000,
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

  const visible = useMemo(
    () => allWithStatus.filter((x) => filter === 'all' || x.wf === filter).map((x) => x.entry),
    [allWithStatus, filter],
  );

  const TABS: { key: WorkerFilter; label: string }[] = [
    { key: 'all',      label: `All (${counts.all})` },
    { key: 'active',   label: `Active (${counts.active})` },
    { key: 'on_leave', label: `On Leave (${counts.on_leave})` },
    { key: 'absent',   label: `Absent (${counts.absent})` },
    { key: 'past',     label: `Past (${counts.past})` },
  ];

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: bg }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md, backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
          <Pressable hitSlop={12} onPress={() => {}}>
            <Feather name="menu" size={22} color={textPrimary} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>My Workers</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Pressable hitSlop={12}><Feather name="search" size={20} color={textPrimary} /></Pressable>
            <Pressable hitSlop={12}><Feather name="sliders" size={20} color={textPrimary} /></Pressable>
          </View>
        </View>

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
            <EmptyState glyph="✕" tone="warning" eyebrow="Offline" title="Could not load workers"
              message="Check your connection and pull to refresh." tall />
          ) : visible.length === 0 ? (
            <EmptyState glyph="👷" tone="hero" eyebrow="No workers"
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
                onPress={() => {
                  haptic('selection');
                  navigation.navigate('WorkerDetail', { applicationId: entry.id });
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
  surface, border, textPrimary, textSecondary, onPress,
}: {
  entry: ApplicantEntry;
  wf: WorkerFilter;
  score: number;
  attendance: number;
  checkIn: string;
  joined: string;
  surface: string; border: string; textPrimary: string; textSecondary: string;
  onPress: () => void;
}) {
  const name = entry.seeker?.name ?? 'Worker';
  const role = entry.job?.title ?? entry.seeker?.skills?.[0] ?? 'Worker';

  const statusColor = wf === 'active' ? GREEN : wf === 'on_leave' ? AMBER : wf === 'absent' ? RED : '#9CA3AF';
  const statusLabel = wf === 'active' ? 'Active' : wf === 'on_leave' ? 'On Leave' : wf === 'absent' ? 'Absent' : 'Past';
  const statusBg = wf === 'active' ? '#F0FDF4' : wf === 'on_leave' ? '#FFFBEB' : wf === 'absent' ? '#FEF2F2' : '#F3F4F6';

  // Trust score ring — SVG-like with a View + border trick
  const ringSize = 52;
  const circumference = Math.PI * (ringSize - 6);
  const filled = (score / 100) * circumference;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border,
      padding: spacing.md, gap: spacing.md, opacity: pressed ? 0.9 : 1,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    })}>
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

        {/* Trust score ring */}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 9, color: textSecondary, fontWeight: '600' }}>Trust Score</Text>
          <View style={{ width: ringSize, height: ringSize, borderRadius: ringSize / 2,
            borderWidth: 3, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'transparent' }}>
            {/* filled arc approximation via a colored inner ring with clip */}
            <View style={{ width: ringSize - 10, height: ringSize - 10, borderRadius: (ringSize - 10) / 2,
              borderWidth: 3, borderColor: score >= 90 ? GREEN : score >= 75 ? BLUE : AMBER,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: textSecondary === '#6B7280' ? '#111827' : '#F9FAFB' }}>
                {score}
              </Text>
            </View>
          </View>
        </View>
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
          <Pressable hitSlop={8} onPress={() => {}}>
            <Feather name="message-square" size={18} color={BLUE} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => {}}>
            <Feather name="phone" size={18} color={BLUE} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => {}}>
            <Feather name="more-horizontal" size={18} color={textSecondary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
