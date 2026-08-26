/**
 * RosterScreen — weekly schedule grid from rosterApi.
 * Shows a Mon–Sun header, then one row per job-shift with worker avatars.
 * Task 44: tapping an empty slot opens a worker-picker sheet.
 */

import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { BlurOverlay } from '@/components';
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
import { chatApi } from '@/api/chat.api';
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
  const { width: windowWidth } = useWindowDimensions();

  // The 7 day-columns share each row with a fixed 110px label column. On
  // normal phones (~360px+) there's always room for the original 28px
  // (header) / 22px (shift) circles, so this clamps to those exact sizes
  // there — nothing changes visually. On narrower devices (~320px) the
  // circle diameters (and their inner text/icon) shrink to whatever room
  // is actually left in each flex:1 day column, so neighboring circles
  // never touch or overlap. The two rows have slightly different padding
  // (the header row sits directly in the ScrollView; shift/worker rows sit
  // inside a padded card), so each gets its own computed column width.
  const DAY_LABEL_W = 110;
  const headerDayColW = (windowWidth - spacing.xl * 2 - DAY_LABEL_W - spacing.sm) / 7;
  const entryDayColW = (windowWidth - spacing.xl * 2 - spacing.md * 2 - 2 - DAY_LABEL_W - spacing.sm) / 7;
  const HEADER_CIRCLE = Math.max(18, Math.min(28, Math.floor(headerDayColW - 3)));
  const SHIFT_CIRCLE = Math.max(16, Math.min(22, Math.floor(entryDayColW - 3)));
  const HEADER_FONT = Math.max(10, Math.round(HEADER_CIRCLE * 0.46));
  const CHECK_ICON = Math.max(9, Math.round(SHIFT_CIRCLE * 0.55));

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const [slotPick, setSlotPick] = useState<SlotPick>(null);
  const [showCrewMsg, setShowCrewMsg] = useState(false);
  const [crewMsgText, setCrewMsgText] = useState('');
  const [crewMsgSending, setCrewMsgSending] = useState(false);

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

  const hiredApplications = (workersQuery.data?.applications ?? []).filter((a: ApplicantEntry) => a.status === 'hired');

  async function sendCrewMessage() {
    const text = crewMsgText.trim();
    if (!text || hiredApplications.length === 0) return;
    setCrewMsgSending(true);
    haptic('selection');
    try {
      await Promise.all(
        hiredApplications.map(async (a: ApplicantEntry) => {
          const { conversationId } = await chatApi.ensureFromApplication(a.id);
          await chatApi.sendMessage(conversationId, text);
        }),
      );
      haptic('success');
      setCrewMsgText('');
      setShowCrewMsg(false);
    } catch {
      haptic('error');
    } finally {
      setCrewMsgSending(false);
    }
  }

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
        <Pressable hitSlop={12} onPress={() => { haptic('selection'); setShowCrewMsg(true); }}>
          <Feather name="message-circle" size={22} color={BLUE} />
        </Pressable>
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
                    width: HEADER_CIRCLE, height: HEADER_CIRCLE, borderRadius: HEADER_CIRCLE / 2,
                    backgroundColor: isToday ? BLUE : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{
                      fontSize: HEADER_FONT, fontWeight: '700',
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
            <EmptyState icon="x-circle" tone="warning" eyebrow="Offline" title="Could not load roster"
              message="Check your connection and pull to refresh." tall />
          </View>
        ) : entries.length === 0 ? (
          <View style={{ padding: spacing.xl }}>
            <EmptyState icon="calendar" tone="hero" eyebrow="No shifts yet" title="Your roster is empty"
              message="Post a recurring job and assign workers to see the schedule here." tall />
          </View>
        ) : (
          <View style={{ padding: spacing.xl, gap: spacing.md }}>
            {entries.map((entry) => (
              <View key={entry.jobId} style={{
                backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border,
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
                          width: SHIFT_CIRCLE, height: SHIFT_CIRCLE, borderRadius: SHIFT_CIRCLE / 2,
                          backgroundColor: isActive ? (isToday ? BLUE : GREEN) : 'transparent',
                          borderWidth: isActive ? 0 : 1, borderColor: border,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive && <Feather name="check" size={CHECK_ICON} color="#FFFFFF" />}
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
        <BlurOverlay>
        <Pressable
          style={{ flex: 1 }}
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
        </BlurOverlay>
      </Modal>

      {/* ── Crew Message Composer ── */}
      <Modal visible={showCrewMsg} transparent animationType="slide" onRequestClose={() => setShowCrewMsg(false)}>
        <BlurOverlay>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end' }}
          onPress={() => setShowCrewMsg(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={{
              backgroundColor: surface,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: spacing.xl, gap: spacing.lg,
              paddingBottom: insets.bottom + spacing.xl,
            }}>
              {/* Handle */}
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center' }} />

              {/* Title row */}
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: textPrimary }}>Message All Crew</Text>
                <Text style={{ fontSize: 13, color: textSecondary }}>
                  Sends to {hiredApplications.length} hired worker{hiredApplications.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Text input */}
              <TextInput
                value={crewMsgText}
                onChangeText={setCrewMsgText}
                placeholder="Type your message…"
                placeholderTextColor={textSecondary}
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: isLight ? '#F3F4F6' : '#1E1E1E',
                  borderRadius: 12,
                  padding: spacing.md,
                  fontSize: 15,
                  color: textPrimary,
                  minHeight: 100,
                  textAlignVertical: 'top',
                }}
              />

              {/* Send button */}
              <Pressable
                onPress={() => void sendCrewMessage()}
                disabled={crewMsgSending || !crewMsgText.trim() || hiredApplications.length === 0}
                style={({ pressed }) => ({
                  backgroundColor: BLUE,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: (crewMsgSending || !crewMsgText.trim() || hiredApplications.length === 0) ? 0.5 : pressed ? 0.8 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                })}
              >
                {crewMsgSending
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Feather name="send" size={16} color="#FFFFFF" />
                }
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                  {crewMsgSending ? 'Sending…' : 'Send to All'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </BlurOverlay>
      </Modal>
    </Screen>
  );
}
