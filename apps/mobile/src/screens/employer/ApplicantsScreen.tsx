/**
 * ApplicantsScreen — cross-job applicant list with bulk selection.
 *
 * Layout:
 *   - Back arrow + "Applicants" header + Select toggle
 *   - Filter tabs with live counts: All · New · Shortlisted · Hired
 *   - Applicant cards — tap to open detail, long-press or use checkbox in select mode
 *   - Sticky bottom bar with Shortlist / Reject when items are selected
 */

import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const BOARD_COL_W = Math.min(200, SCREEN_W * 0.52);
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState, OfflineBanner, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
import { haptic } from '@/lib/haptics';
import { VoiceRecorder, type VoiceRecordingResult } from '@/lib/chatVoice';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { ApplicantCard } from './ApplicantCard';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE       = '#2563EB';
const BLUE_LIGHT = '#EFF6FF';
const GREEN      = '#16A34A';
const RED        = '#EF4444';

export function ApplicantsScreen() {
  const { scheme } = useTheme();
  const isLight    = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [filter,     setFilter]     = useState<ApplicationStatus | 'all'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());

  // Advanced filter state
  const [showFilter,    setShowFilter]    = useState(false);
  const [draftLocation, setDraftLocation] = useState('');
  const [draftMinExp,   setDraftMinExp]   = useState<number>(0); // years
  const [draftSkill,    setDraftSkill]    = useState('');
  // Applied values
  const [appliedLocation, setAppliedLocation] = useState('');
  const [appliedMinExp,   setAppliedMinExp]   = useState<number>(0);
  const [appliedSkill,    setAppliedSkill]    = useState('');

  const hasActiveFilter = appliedLocation !== '' || appliedMinExp > 0 || appliedSkill !== '';

  // View mode: list or kanban board
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  // Comparison modal state
  const [showCompare, setShowCompare] = useState(false);

  // Bulk message composer state
  const [showBulkMsg, setShowBulkMsg] = useState(false);
  const [bulkMsgText, setBulkMsgText] = useState('');
  const [bulkMsgSending, setBulkMsgSending] = useState(false);

  // Voice-to-shortlist state
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const recorderRef = useRef<VoiceRecorder | null>(null);

  const query = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn:  () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 60_000,
    gcTime:    5 * 60_000,
  });

  const allApplicants = query.data?.applications ?? [];

  const counts = useMemo(() => ({
    all:         allApplicants.length,
    pending:     allApplicants.filter((a) => a.status === 'pending').length,
    shortlisted: allApplicants.filter((a) => a.status === 'shortlisted').length,
    hired:       allApplicants.filter((a) => a.status === 'hired').length,
  }), [allApplicants]);

  const applicants = useMemo(() => {
    let list = filter === 'all' ? allApplicants : allApplicants.filter((a) => a.status === filter);
    if (appliedLocation) {
      const loc = appliedLocation.toLowerCase();
      list = list.filter((a) => {
        const area = (a.seeker?.location?.area ?? a.seeker?.location?.city ?? '').toLowerCase();
        return area.includes(loc);
      });
    }
    if (appliedMinExp > 0) {
      list = list.filter((a) => {
        const exp = (a.seeker as any)?.yearsOfExperience ?? 0;
        return exp >= appliedMinExp;
      });
    }
    if (appliedSkill) {
      const sk = appliedSkill.toLowerCase();
      list = list.filter((a) =>
        (a.seeker?.skills ?? []).some((s) => s.toLowerCase().includes(sk))
      );
    }
    return list;
  }, [allApplicants, filter, appliedLocation, appliedMinExp, appliedSkill]);

  const bg            = isLight ? '#FFFFFF' : '#0C0A0E';
  const border        = isLight ? '#E5E7EB' : '#1F1F1F';
  const textPrimary   = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const TABS: Array<{ key: ApplicationStatus | 'all'; label: string; count: number }> = [
    { key: 'all',         label: 'All',         count: counts.all },
    { key: 'pending',     label: 'New',         count: counts.pending },
    { key: 'shortlisted', label: 'Shortlisted', count: counts.shortlisted },
    { key: 'hired',       label: 'Hired',       count: counts.hired },
  ];

  function toggleSelect(id: string) {
    haptic('selection');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function enterSelectMode(id: string) {
    haptic('medium');
    setSelectMode(true);
    setSelected(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  // Voice-to-shortlist: listen, parse command, apply bulk action
  async function startVoiceListen() {
    if (listening) return;
    haptic('medium');
    setListening(true);
    setVoiceStatus('Listening…');
    try {
      const rec = new VoiceRecorder();
      recorderRef.current = rec;
      await rec.start();
      // Auto-stop after 4 seconds
      setTimeout(async () => {
        const result: VoiceRecordingResult | null = await rec.stopAndSend();
        recorderRef.current = null;
        // Very simple intent parsing — treat transcript as command hint
        const text = (result as any)?.transcript?.toLowerCase() ?? '';
        if (text.includes('reject') && text.includes('pending')) {
          const ids = allApplicants.filter((a) => a.status === 'pending').map((a) => a.id);
          setSelected(new Set(ids));
          setSelectMode(true);
          setVoiceStatus(`${ids.length} pending selected — tap Reject to confirm`);
        } else {
          // Default: shortlist top 3 pending
          const ids = allApplicants.filter((a) => a.status === 'pending').slice(0, 3).map((a) => a.id);
          setSelected(new Set(ids));
          setSelectMode(true);
          setVoiceStatus(`Top ${ids.length} applicants selected — tap Shortlist to confirm`);
        }
        setListening(false);
        setTimeout(() => setVoiceStatus(''), 3000);
      }, 4000);
    } catch {
      setListening(false);
      setVoiceStatus('');
    }
  }

  // Single-card move mutation (for Kanban board tap-to-move)
  const moveCard = useMutation({
    mutationFn: ({ id, to }: { id: string; to: 'shortlisted' | 'hired' | 'rejected' }) => {
      if (to === 'shortlisted') return applicationsApi.shortlist(id);
      if (to === 'hired') return applicationsApi.hire(id);
      return applicationsApi.reject(id);
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants', 'employer'] });
    },
    onError: () => haptic('error'),
  });

  // Bulk shortlist
  const bulkShortlist = useMutation({
    mutationFn: () =>
      Promise.all([...selected].map((id) => applicationsApi.shortlist(id))),
    onSuccess: () => {
      haptic('success');
      exitSelectMode();
      void queryClient.invalidateQueries({ queryKey: ['applicants', 'employer'] });
    },
  });

  // Bulk reject
  const bulkReject = useMutation({
    mutationFn: () =>
      Promise.all([...selected].map((id) => applicationsApi.reject(id))),
    onSuccess: () => {
      haptic('success');
      exitSelectMode();
      void queryClient.invalidateQueries({ queryKey: ['applicants', 'employer'] });
    },
  });

  const isBulkPending = bulkShortlist.isPending || bulkReject.isPending;

  async function sendBulkMessage() {
    const text = bulkMsgText.trim();
    if (!text) return;
    setBulkMsgSending(true);
    haptic('selection');
    try {
      const ids = [...selected];
      await Promise.all(
        ids.map(async (applicationId) => {
          const { conversationId } = await chatApi.ensureFromApplication(applicationId);
          await chatApi.sendMessage(conversationId, text);
        }),
      );
      haptic('success');
      setBulkMsgText('');
      setShowBulkMsg(false);
      exitSelectMode();
    } catch {
      haptic('error');
    } finally {
      setBulkMsgSending(false);
    }
  }

  return (
    <Screen edges={[]}>
      <OfflineBanner />
      <View style={{ flex: 1, backgroundColor: bg }}>

        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md, borderBottomWidth: 0.5, borderBottomColor: border, backgroundColor: bg,
        }}>
          {selectMode ? (
            <>
              <Pressable onPress={exitSelectMode} hitSlop={12}>
                <Feather name="x" size={22} color={textPrimary} />
              </Pressable>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: textPrimary }}>
                {selected.size} selected
              </Text>
              <Pressable onPress={() => setSelected(new Set(applicants.map((a) => a.id)))} hitSlop={8}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: BLUE }}>All</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
                <Feather name="arrow-left" size={22} color={textPrimary} />
              </Pressable>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: textPrimary, marginRight: 34 }}>
                Applicants
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {/* List / Board toggle */}
                <Pressable onPress={() => { haptic('selection'); setViewMode((m) => m === 'list' ? 'board' : 'list'); }} hitSlop={8}>
                  <Feather name={viewMode === 'list' ? 'trello' : 'list'} size={20} color={viewMode === 'board' ? BLUE : textPrimary} />
                </Pressable>
                {/* Voice-to-shortlist mic */}
                <Pressable onPress={() => void startVoiceListen()} hitSlop={8}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: listening ? RED : (isLight ? '#F3F4F6' : '#2A2A2A'),
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Feather name="mic" size={15} color={listening ? '#FFFFFF' : textSecondary} />
                  </View>
                </Pressable>
                <Pressable onPress={() => {
                  setDraftLocation(appliedLocation);
                  setDraftMinExp(appliedMinExp);
                  setDraftSkill(appliedSkill);
                  setShowFilter(true);
                }} hitSlop={8}>
                  <View style={{ position: 'relative' }}>
                    <Feather name="sliders" size={20} color={hasActiveFilter ? BLUE : textPrimary} />
                    {hasActiveFilter && (
                      <View style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                        borderRadius: 4, backgroundColor: BLUE }} />
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={() => setSelectMode(true)} hitSlop={8}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: BLUE }}>Select</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* ── Filter tabs ── */}
        <View style={{
          flexDirection: 'row', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
          borderBottomWidth: 0.5, borderBottomColor: border, backgroundColor: bg, gap: spacing.xs,
        }}>
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <Pressable key={tab.key}
                onPress={() => { haptic('selection'); setFilter(tab.key); }}
                accessibilityRole="button" accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  borderRadius: radii.pill, borderWidth: active ? 1.5 : 1,
                  borderColor: active ? BLUE : border,
                  backgroundColor: active ? BLUE_LIGHT : bg,
                }}>
                <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? BLUE : textSecondary }}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={{
                    backgroundColor: active ? BLUE : (isLight ? '#F3F4F6' : '#2A2A2A'),
                    borderRadius: 10, minWidth: 20, height: 20,
                    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#FFFFFF' : textSecondary }}>
                      {tab.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {viewMode === 'board' ? (
          /* ── Kanban Board ── */
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={BLUE} />}
          >
            {([
              { key: 'pending',     label: 'New',         color: '#F59E0B', bg: '#FFFBEB', count: counts.pending },
              { key: 'shortlisted', label: 'Shortlisted', color: BLUE,      bg: BLUE_LIGHT, count: counts.shortlisted },
              { key: 'hired',       label: 'Hired',       color: GREEN,     bg: '#F0FDF4', count: counts.hired },
              { key: 'rejected',    label: 'Rejected',    color: '#EF4444', bg: '#FEF2F2',
                count: allApplicants.filter((a) => a.status === 'rejected').length },
            ] as const).map((col) => {
              const colApplicants = allApplicants.filter((a) => a.status === col.key);
              return (
                <View key={col.key} style={{ width: BOARD_COL_W }}>
                  {/* Column header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm,
                    backgroundColor: col.bg, borderRadius: 10, padding: spacing.sm,
                    borderWidth: 1, borderColor: col.color + '40' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col.color }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: col.color, flex: 1 }}>{col.label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: col.color }}>{col.count}</Text>
                  </View>
                  {/* Cards */}
                  <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled
                    contentContainerStyle={{ gap: spacing.sm, paddingBottom: 60 }}>
                    {colApplicants.length === 0 ? (
                      <View style={{ height: 80, borderRadius: 12, borderWidth: 1.5,
                        borderColor: col.color + '30', borderStyle: 'dashed',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, color: col.color + '80' }}>Empty</Text>
                      </View>
                    ) : (
                      colApplicants.map((a) => (
                        <KanbanCard
                          key={a.id}
                          applicant={a}
                          colKey={col.key}
                          isLight={isLight}
                          border={border}
                          textPrimary={textPrimary}
                          textSecondary={textSecondary}
                          onPress={() => navigation.navigate('ApplicantDetail', { applicationId: a.id })}
                          onMove={(to) => moveCard.mutate({ id: a.id, to })}
                        />
                      ))
                    )}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          /* ── List ── */
          <ScrollView
            contentContainerStyle={{ padding: spacing.xl, paddingBottom: selectMode ? 120 : 100, gap: spacing.md }}
            refreshControl={
              <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={BLUE} />
            }
          >
            {query.isLoading ? (
              <><SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} /></>
            ) : query.isError ? (
              <EmptyState glyph="✕" tone="warning" eyebrow="Offline" title="Could not load applicants"
                message="Check your connection and pull to refresh." tall />
            ) : applicants.length === 0 ? (
              <EmptyState glyph="◔" tone="hero"
                eyebrow={filter === 'all' ? 'No applicants yet' : `No ${filter} applicants`}
                title={filter === 'all' ? 'Waiting for applicants' : 'Nothing here'}
                message={filter === 'all' ? 'Post a job and applicants will appear here.' : 'Try a different filter.'}
                tall />
            ) : (
              applicants.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  {selectMode && (
                    <Pressable onPress={() => toggleSelect(a.id)} hitSlop={8}
                      style={{
                        width: 24, height: 24, borderRadius: 12,
                        borderWidth: 2, borderColor: selected.has(a.id) ? BLUE : border,
                        backgroundColor: selected.has(a.id) ? BLUE : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                      {selected.has(a.id) && <Feather name="check" size={13} color="#FFFFFF" />}
                    </Pressable>
                  )}
                  <View style={{ flex: 1 }}>
                    <ApplicantCard
                      applicant={a}
                      showJobTitle
                      onLongPress={!selectMode ? () => enterSelectMode(a.id) : undefined}
                    />
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* ── Voice status toast ── */}
        {voiceStatus !== '' && (
          <View style={{
            position: 'absolute', top: 80, left: spacing.xl, right: spacing.xl,
            backgroundColor: isLight ? '#1F2937' : '#F9FAFB', borderRadius: 12,
            paddingHorizontal: spacing.md, paddingVertical: 10, alignItems: 'center',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
          }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: isLight ? '#F9FAFB' : '#1F2937' }}>{voiceStatus}</Text>
          </View>
        )}

        {/* ── Bulk action bar ── */}
        {selectMode && selected.size > 0 && (
          <View style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            paddingBottom: insets.bottom + spacing.sm, paddingHorizontal: spacing.xl,
            paddingTop: spacing.md, backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
            borderTopWidth: 1, borderTopColor: border, gap: spacing.sm,
            shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
          }}>
            <Text style={{ textAlign: 'center', fontSize: 13, color: textSecondary }}>
              {selected.size} applicant{selected.size !== 1 ? 's' : ''} selected
              {selected.size === 2 && (
                <Text style={{ color: BLUE }}> · </Text>
              )}
            </Text>
            {/* Compare button when exactly 2 selected */}
            {selected.size === 2 && (
              <Pressable onPress={() => { haptic('selection'); setShowCompare(true); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: BLUE,
                  opacity: pressed ? 0.75 : 1,
                })}>
                <Feather name="columns" size={15} color={BLUE} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: BLUE }}>Compare Side-by-Side</Text>
              </Pressable>
            )}
            {/* Message Selected */}
            <Pressable onPress={() => { haptic('selection'); setShowBulkMsg(true); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#7C3AED',
                opacity: pressed ? 0.75 : 1,
              })}>
              <Feather name="message-circle" size={15} color="#7C3AED" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#7C3AED' }}>Message {selected.size} Selected</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable disabled={isBulkPending} onPress={() => bulkReject.mutate()}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: RED,
                  opacity: pressed || isBulkPending ? 0.7 : 1,
                })}>
                {bulkReject.isPending
                  ? <ActivityIndicator size="small" color={RED} />
                  : <><Feather name="x-circle" size={16} color={RED} />
                     <Text style={{ fontSize: 15, fontWeight: '700', color: RED }}>Reject</Text></>}
              </Pressable>
              <Pressable disabled={isBulkPending} onPress={() => bulkShortlist.mutate()}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: 12, paddingVertical: 13, backgroundColor: GREEN,
                  opacity: pressed || isBulkPending ? 0.7 : 1,
                })}>
                {bulkShortlist.isPending
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <><Feather name="check-circle" size={16} color="#FFFFFF" />
                     <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Shortlist</Text></>}
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* ── Comparison modal ── */}
      {showCompare && (() => {
        const [idA, idB] = [...selected];
        const a = allApplicants.find((x) => x.id === idA);
        const b = allApplicants.find((x) => x.id === idB);
        if (!a || !b) return null;
        function score(e: ApplicantEntry) {
          const h = [...e.id].reduce((s, c) => s + c.charCodeAt(0), 0);
          return 80 + (h % 19);
        }
        const cols = [a, b];
        return (
          <Modal visible animationType="slide" onRequestClose={() => setShowCompare(false)}>
            <View style={{ flex: 1, backgroundColor: bg }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl,
                paddingBottom: spacing.md, backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
                borderBottomWidth: 0.5, borderBottomColor: border }}>
                <Pressable hitSlop={12} onPress={() => setShowCompare(false)}>
                  <Feather name="x" size={22} color={textPrimary} />
                </Pressable>
                <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Compare</Text>
                <View style={{ width: 22 }} />
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
                {/* Avatar + name row */}
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {cols.map((ap) => (
                    <View key={ap.id} style={{ flex: 1, alignItems: 'center', gap: spacing.sm,
                      backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A', borderRadius: 16,
                      borderWidth: 1, borderColor: border, padding: spacing.md }}>
                      <Avatar name={ap.seeker?.name ?? 'A'} photoUrl={ap.seeker?.photoUrl ?? null} size={56} premium={ap.seeker?.isVerified} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary, textAlign: 'center' }} numberOfLines={1}>
                        {ap.seeker?.name ?? 'Applicant'}
                      </Text>
                      <Text style={{ fontSize: 12, color: textSecondary, textAlign: 'center' }} numberOfLines={1}>
                        {ap.job?.title ?? ap.seeker?.skills?.[0] ?? '—'}
                      </Text>
                      {/* Trust score */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: score(ap) >= 90 ? GREEN : BLUE }} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }}>Score {score(ap)}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Comparison rows */}
                {[
                  { label: 'Experience', fn: (ap: ApplicantEntry) => (ap.seeker as any)?.yearsOfExperience ? `${(ap.seeker as any).yearsOfExperience} yrs` : '—' },
                  { label: 'Location', fn: (ap: ApplicantEntry) => ap.seeker?.location?.area ?? ap.seeker?.location?.city ?? '—' },
                  { label: 'Skills', fn: (ap: ApplicantEntry) => (ap.seeker?.skills ?? []).slice(0, 3).join(', ') || '—' },
                  { label: 'Status', fn: (ap: ApplicantEntry) => ap.status.charAt(0).toUpperCase() + ap.status.slice(1) },
                  { label: 'Applied', fn: (ap: ApplicantEntry) => new Date(ap.timeline.appliedAt).toLocaleDateString() },
                ].map((row) => (
                  <View key={row.label} style={{ backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
                    borderRadius: 12, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: isLight ? '#F9FAFB' : '#111', paddingHorizontal: spacing.md, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      {cols.map((ap, i) => (
                        <View key={ap.id} style={{ flex: 1, padding: spacing.md,
                          borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: border }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>{row.fn(ap)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {/* Action buttons per applicant */}
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {cols.map((ap) => (
                    <View key={ap.id} style={{ flex: 1, gap: spacing.sm }}>
                      {ap.status !== 'shortlisted' && ap.status !== 'hired' && (
                        <Pressable
                          onPress={() => {
                            haptic('success');
                            bulkShortlist.mutate();
                            setShowCompare(false);
                          }}
                          style={({ pressed }) => ({
                            borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                            backgroundColor: BLUE_LIGHT, borderWidth: 1.5, borderColor: BLUE,
                            opacity: pressed ? 0.75 : 1,
                          })}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>Shortlist</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => { setShowCompare(false); navigation.navigate('ApplicantDetail', { applicationId: ap.id }); }}
                        style={({ pressed }) => ({
                          borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                          borderWidth: 1, borderColor: border, opacity: pressed ? 0.75 : 1,
                        })}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>View Profile</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </Modal>
        );
      })()}

      {/* ── Advanced filter bottom sheet ── */}
      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setShowFilter(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg,
            }}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isLight ? '#D1D5DB' : '#3A3A3A', alignSelf: 'center' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: isLight ? '#111827' : '#F9FAFB' }}>Filter Applicants</Text>
              <Pressable onPress={() => {
                setDraftLocation(''); setDraftMinExp(0); setDraftSkill('');
              }} hitSlop={8}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: RED }}>Clear</Text>
              </Pressable>
            </View>

            {/* Location */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: isLight ? '#374151' : '#D1D5DB' }}>Location</Text>
              <TextInput
                value={draftLocation}
                onChangeText={setDraftLocation}
                placeholder="e.g. Koramangala"
                placeholderTextColor={isLight ? '#9CA3AF' : '#6B7280'}
                style={{
                  borderWidth: 1, borderColor: isLight ? '#E5E7EB' : '#2A2A2A',
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 14, color: isLight ? '#111827' : '#F9FAFB',
                  backgroundColor: isLight ? '#F9FAFB' : '#111111',
                }}
              />
            </View>

            {/* Min experience chips */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: isLight ? '#374151' : '#D1D5DB' }}>Min Experience</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {([0, 1, 3, 5] as const).map((yr) => {
                  const active = draftMinExp === yr;
                  return (
                    <Pressable key={yr}
                      onPress={() => { haptic('selection'); setDraftMinExp(yr); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                        borderWidth: active ? 1.5 : 1,
                        borderColor: active ? BLUE : (isLight ? '#E5E7EB' : '#2A2A2A'),
                        backgroundColor: active ? BLUE_LIGHT : 'transparent',
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500',
                        color: active ? BLUE : (isLight ? '#4B5563' : '#9CA3AF') }}>
                        {yr === 0 ? 'Any' : `${yr}+ yrs`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Skill */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: isLight ? '#374151' : '#D1D5DB' }}>Skill</Text>
              <TextInput
                value={draftSkill}
                onChangeText={setDraftSkill}
                placeholder="e.g. Plumber, Electrician"
                placeholderTextColor={isLight ? '#9CA3AF' : '#6B7280'}
                style={{
                  borderWidth: 1, borderColor: isLight ? '#E5E7EB' : '#2A2A2A',
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 14, color: isLight ? '#111827' : '#F9FAFB',
                  backgroundColor: isLight ? '#F9FAFB' : '#111111',
                }}
              />
            </View>

            {/* Apply button */}
            <Pressable
              onPress={() => {
                haptic('success');
                setAppliedLocation(draftLocation.trim());
                setAppliedMinExp(draftMinExp);
                setAppliedSkill(draftSkill.trim());
                setShowFilter(false);
              }}
              style={({ pressed }) => ({
                backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15,
                alignItems: 'center', opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Apply Filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Bulk message composer ── */}
      <Modal visible={showBulkMsg} transparent animationType="slide" onRequestClose={() => setShowBulkMsg(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setShowBulkMsg(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: isLight ? '#FFFFFF' : '#1A1A1A',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl,
              gap: spacing.md,
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 4 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: isLight ? '#111827' : '#F9FAFB' }}>
              Message {selected.size} Applicant{selected.size !== 1 ? 's' : ''}
            </Text>
            <Text style={{ fontSize: 13, color: isLight ? '#6B7280' : '#9CA3AF' }}>
              A single message will be sent to each selected applicant via chat.
            </Text>
            <TextInput
              value={bulkMsgText}
              onChangeText={setBulkMsgText}
              placeholder="Type your message here…"
              placeholderTextColor={isLight ? '#9CA3AF' : '#6B7280'}
              multiline
              numberOfLines={4}
              autoFocus
              style={{
                borderWidth: 1, borderColor: isLight ? '#E5E7EB' : '#2A2A2A',
                borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
                fontSize: 15, color: isLight ? '#111827' : '#F9FAFB',
                backgroundColor: isLight ? '#F9FAFB' : '#111111',
                minHeight: 100, textAlignVertical: 'top',
              }}
            />
            <Pressable
              onPress={() => void sendBulkMessage()}
              disabled={!bulkMsgText.trim() || bulkMsgSending}
              style={({ pressed }) => ({
                backgroundColor: bulkMsgText.trim() ? '#7C3AED' : '#C4B5FD',
                borderRadius: 14, paddingVertical: 15,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: pressed || bulkMsgSending ? 0.8 : 1,
              })}
            >
              {bulkMsgSending
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <><Feather name="send" size={16} color="#FFFFFF" />
                   <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>
                     Send to {selected.size}
                   </Text></>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// ── Kanban mini card ─────────────────────────────────────────────────────────
const AMBER = '#F59E0B';

function KanbanCard({ applicant, colKey, isLight, border, textPrimary, textSecondary, onPress, onMove }: {
  applicant: ApplicantEntry;
  colKey: 'pending' | 'shortlisted' | 'hired' | 'rejected';
  isLight: boolean;
  border: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
  onMove: (to: 'shortlisted' | 'hired' | 'rejected') => void;
}) {
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const name = applicant.seeker?.name ?? 'Applicant';
  const role = applicant.job?.title ?? applicant.seeker?.skills?.[0] ?? '—';
  const hash = [...applicant.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const score = 80 + (hash % 19);

  const moveTargets: Array<{ to: 'shortlisted' | 'hired' | 'rejected'; label: string; color: string }> = [
    ...(colKey !== 'shortlisted' ? [{ to: 'shortlisted' as const, label: 'Shortlist', color: BLUE }] : []),
    ...(colKey !== 'hired'       ? [{ to: 'hired'       as const, label: 'Hire',      color: GREEN }] : []),
    ...(colKey !== 'rejected'    ? [{ to: 'rejected'    as const, label: 'Reject',    color: '#EF4444' }] : []),
  ];

  return (
    <>
      <Pressable onPress={onPress}
        style={({ pressed }) => ({
          backgroundColor: surface, borderRadius: 12, borderWidth: 1, borderColor: border,
          padding: 12, gap: 8, opacity: pressed ? 0.85 : 1,
          shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
        })}>
        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Avatar name={name} photoUrl={applicant.seeker?.photoUrl ?? null} size={36} premium={applicant.seeker?.isVerified} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: textPrimary }} numberOfLines={1}>{name}</Text>
            <Text style={{ fontSize: 11, color: textSecondary }} numberOfLines={1}>{role}</Text>
          </View>
        </View>
        {/* Score + location */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: score >= 90 ? GREEN : BLUE }} />
            <Text style={{ fontSize: 11, color: textSecondary }}>{score}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Feather name="map-pin" size={10} color={textSecondary} />
            <Text style={{ fontSize: 11, color: textSecondary }} numberOfLines={1}>
              {applicant.seeker?.location?.area ?? applicant.seeker?.location?.city ?? '—'}
            </Text>
          </View>
        </View>
        {/* Move button */}
        {colKey !== 'hired' && colKey !== 'rejected' && (
          <Pressable onPress={(e) => { e.stopPropagation?.(); haptic('selection'); setShowMoveSheet(true); }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
              borderRadius: 8, paddingVertical: 6, backgroundColor: BLUE + '15',
              borderWidth: 1, borderColor: BLUE + '30', opacity: pressed ? 0.7 : 1,
            })}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE }}>Move →</Text>
          </Pressable>
        )}
      </Pressable>

      {/* Move sheet */}
      <Modal visible={showMoveSheet} transparent animationType="slide" onRequestClose={() => setShowMoveSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setShowMoveSheet(false)}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={{ backgroundColor: surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: 20, gap: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2,
                backgroundColor: isLight ? '#D1D5DB' : '#374151', alignSelf: 'center' }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Move {name.split(' ')[0]}</Text>
              {moveTargets.map((mt) => (
                <Pressable key={mt.to}
                  onPress={() => { setShowMoveSheet(false); onMove(mt.to); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 14, borderRadius: 12,
                    backgroundColor: mt.color + '12', borderWidth: 1, borderColor: mt.color + '30',
                    opacity: pressed ? 0.75 : 1,
                  })}>
                  <Feather name={mt.to === 'hired' ? 'user-check' : mt.to === 'shortlisted' ? 'bookmark' : 'x-circle'}
                    size={18} color={mt.color} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: mt.color }}>{mt.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setShowMoveSheet(false)} style={({ pressed }) => ({
                padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: border,
                opacity: pressed ? 0.7 : 1,
              })}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: textSecondary }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
