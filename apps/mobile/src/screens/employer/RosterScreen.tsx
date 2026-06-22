/**
 * RosterScreen — weekly schedule grid from rosterApi.
 * Shows a Mon–Sun header, then one row per job-shift with worker avatars.
 * Task 44: tapping an empty slot opens a worker-picker sheet.
 */

import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { rosterApi, type RosterEntry, type RosterWorker } from '@/api/roster.api';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#F59E0B';

// Roster days: 0=Sun…6=Sat, but we display Mon–Sun
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Map display column index (0=Mon) → JS day index (1=Mon)
const COL_TO_JS = [1, 2, 3, 4, 5, 6, 0];

type SlotPick = { entry: RosterEntry; colIndex: number } | null;

export function RosterScreen() {
  const navigation  = useNavigation<Nav>();
  const insets      = useSafeAreaInsets();
  const { scheme }  = useTheme();
  const isLight     = scheme !== 'dark';
  const qc          = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#1A1A1A';
  const border        = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const [slotPick, setSlotPick] = useState<SlotPick>(null);

  const query = useQuery({
    queryKey: ['roster'],
    queryFn:  rosterApi.list,
    staleTime: 5 * 60_000,
  });

  // Workers pool — all employer applicants, filtered to hired client-side
  const workersQuery = useQuery({
    queryKey: ['applicants', 'employer', 'workers-tab'],
    queryFn:  () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const assignMutation = useMutation({
    mutationFn: ({ jobId, workerId, days }: { jobId: string; workerId: string; days: number[] }) =>
      rosterApi.assign(jobId, workerId, days),
    onMutate: async ({ jobId, workerId }) => {
      // Optimistic: find worker name and add to entry
      const worker = workersQuery.data?.applications.find((a) => a.seeker?.id === workerId);
      if (!worker) return;
      const newWorker: RosterWorker = { id: workerId, name: worker.seeker?.name ?? 'Worker', photoUrl: worker.seeker?.photoUrl ?? null };
      await qc.cancelQueries({ queryKey: ['roster'] });
      const prev = qc.getQueryData<{ entries: RosterEntry[] }>(['roster']);
      qc.setQueryData<{ entries: RosterEntry[] }>(['roster'], (old) => {
        if (!old) return old;
        return {
          entries: old.entries.map((e) =>
            e.jobId === jobId
              ? { ...e, workers: [...e.workers.filter((w) => w.id !== workerId), newWorker] }
              : e,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['roster'], ctx.prev);
      haptic('error');
    },
    onSuccess: () => {
      haptic('success');
      setSlotPick(null);
      void qc.invalidateQueries({ queryKey: ['roster'] });
    },
  });

  const entries = query.data?.entries ?? [];
  const todayJS = new Date().getDay();

  // Workers available to assign (hired, not already on the selected entry)
  const availableWorkers = (workersQuery.data?.applications ?? []).filter((a: ApplicantEntry) => {
    if (!slotPick) return false;
    if (a.status !== 'hired') return false;
    return !slotPick.entry.workers.some((w) => w.id === a.seeker?.id);
  });

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Weekly Roster</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: bg }}
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={BLUE} />
        }
      >
        {/* Day-of-week header */}
        <View style={{ backgroundColor: surface, borderBottomWidth: 1, borderBottomColor: border }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm }}>
            <View style={{ width: 110, marginRight: spacing.sm }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: textSecondary }}>SHIFT / ROLE</Text>
            </View>
            {DAY_LABELS.map((d, i) => {
              const isToday = COL_TO_JS[i] === todayJS;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: isToday ? BLUE : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '700',
                      color: isToday ? '#FFFFFF' : (i >= 5 ? '#EF4444' : textSecondary),
                    }}>
                      {d}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Loading / empty */}
        {query.isLoading ? (
          <View style={{ padding: spacing.xl, gap: spacing.md }}>
            <SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} />
          </View>
        ) : query.isError ? (
          <View style={{ padding: spacing.xl }}>
            <EmptyState glyph="✕" tone="warning" eyebrow="Offline" title="Could not load roster"
              message="Check your connection and pull to refresh." tall />
          </View>
        ) : entries.length === 0 ? (
          <View style={{ padding: spacing.xl }}>
            <EmptyState glyph="📅" tone="hero" eyebrow="No shifts yet" title="Your roster is empty"
              message="Post a recurring job and assign workers to see the schedule here." tall />
          </View>
        ) : (
          <View style={{ padding: spacing.xl, gap: spacing.md }}>
            {entries.map((entry) => (
              <View key={entry.jobId} style={{
                backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border,
                overflow: 'hidden',
              }}>
                {/* Shift header row */}
                <View style={{ flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  borderBottomWidth: 1, borderBottomColor: border,
                  backgroundColor: isLight ? '#F8FAFF' : '#1E2A3A' }}>
                  <View style={{ width: 110, marginRight: spacing.sm, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }} numberOfLines={1}>
                      {entry.title}
                    </Text>
                    {entry.startTime && (
                      <Text style={{ fontSize: 11, color: textSecondary }}>{entry.startTime}</Text>
                    )}
                  </View>
                  {DAY_LABELS.map((_, i) => {
                    const jsDay    = COL_TO_JS[i];
                    const isActive = entry.days.includes(jsDay);
                    const isToday  = jsDay === todayJS;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: isActive ? (isToday ? BLUE : GREEN) : 'transparent',
                          borderWidth: isActive ? 0 : 1, borderColor: border,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive && <Feather name="check" size={12} color="#FFFFFF" />}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Workers */}
                {entry.workers.map((w, wi) => (
                  <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    paddingHorizontal: spacing.md, paddingVertical: 10,
                    borderTopWidth: wi > 0 ? 1 : 0, borderTopColor: border }}>
                    <View style={{ width: 110, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: spacing.sm }}>
                      <Avatar name={w.name} photoUrl={w.photoUrl} size={32} />
                      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: textPrimary }} numberOfLines={1}>
                        {w.name}
                      </Text>
                    </View>
                    {DAY_LABELS.map((_, i) => {
                      const jsDay    = COL_TO_JS[i];
                      const isActive = entry.days.includes(jsDay);
                      return (
                        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                          {isActive && (
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}

                {/* "Add worker" empty slot row */}
                <Pressable
                  onPress={() => { haptic('selection'); setSlotPick({ entry, colIndex: 0 }); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                    paddingHorizontal: spacing.md, paddingVertical: 10,
                    borderTopWidth: 1, borderTopColor: border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
                    borderWidth: 1.5, borderStyle: 'dashed', borderColor: BLUE,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="plus" size={16} color={BLUE} />
                  </View>
                  <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>Assign worker</Text>
                </Pressable>
              </View>
            ))}

            {/* Legend */}
            <View style={{ flexDirection: 'row', gap: spacing.xl, justifyContent: 'center', paddingTop: spacing.sm }}>
              {[{ color: BLUE, label: "Today's shift" }, { color: GREEN, label: 'Scheduled' }].map((l) => (
                <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color }} />
                  <Text style={{ fontSize: 12, color: textSecondary }}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Worker Picker Sheet */}
      <Modal visible={slotPick !== null} transparent animationType="slide" onRequestClose={() => setSlotPick(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setSlotPick(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: surface,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 12, paddingBottom: insets.bottom + 24,
              maxHeight: '70%',
            }}
          >
            {/* Handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 16 }} />

            <View style={{ paddingHorizontal: spacing.xl, marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
                Assign to: {slotPick?.entry.title}
              </Text>
              <Text style={{ fontSize: 13, color: textSecondary, marginTop: 2 }}>
                Pick a worker from your hired team
              </Text>
            </View>

            <ScrollView style={{ paddingHorizontal: spacing.xl }}>
              {workersQuery.isLoading ? (
                <View style={{ gap: spacing.sm }}>
                  <SkeletonCard lines={2} /><SkeletonCard lines={2} />
                </View>
              ) : availableWorkers.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ fontSize: 14, color: textSecondary }}>
                    {(workersQuery.data?.applications ?? []).filter((a: ApplicantEntry) => a.status === 'hired').length === 0
                      ? 'No hired workers yet. Hire applicants first.'
                      : 'All hired workers are already assigned to this shift.'}
                  </Text>
                </View>
              ) : (
                availableWorkers.map((app: ApplicantEntry) => (
                  <Pressable
                    key={app.id}
                    onPress={() => {
                      if (!slotPick || !app.seeker?.id) return;
                      assignMutation.mutate({
                        jobId: slotPick.entry.jobId,
                        workerId: app.seeker.id,
                        days: slotPick.entry.days,
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Avatar name={app.seeker?.name ?? '?'} photoUrl={app.seeker?.photoUrl ?? null} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>{app.seeker?.name ?? 'Worker'}</Text>
                      <Text style={{ fontSize: 12, color: textSecondary }}>{app.job?.title ?? ''}</Text>
                    </View>
                    <View style={{
                      paddingHorizontal: 12, paddingVertical: 6,
                      backgroundColor: BLUE, borderRadius: radii.pill,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Assign</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
