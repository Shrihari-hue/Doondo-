/**
 * TimeOffRequestsScreen — Task 69
 *
 * Lists pending time-off / absence requests from hired workers.
 * Since the backend doesn't yet have a dedicated time-off API, we
 * simulate requests client-side: each hired worker gets a deterministic
 * fake request derived from their application id so the screen renders
 * meaningful-looking data during development. When a real API lands,
 * swap the `useTimeOffRequests` hook internals.
 */

import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState, Avatar, BlurOverlay} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';

const AMBER  = '#F59E0B';
const GREEN  = '#16A34A';
const RED    = '#EF4444';
const BLUE   = '#2563EB';

type RequestStatus = 'pending' | 'approved' | 'denied';

interface TimeOffRequest {
  id: string;
  applicationId: string;
  workerName: string;
  photoUrl: string | null;
  jobTitle: string;
  /** ISO date string — first day off */
  fromDate: string;
  /** ISO date string — last day off */
  toDate: string;
  /** Days requested */
  days: number;
  reason: string;
  status: RequestStatus;
}

const REASONS = [
  'Family emergency',
  'Medical appointment',
  'Personal reasons',
  'Festival / religious holiday',
  'Travel',
  'Illness',
];

/** Deterministic hash of a string → 0..n-1 */
function hashIndex(str: string, n: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % n;
}

/** Derive a fake TimeOffRequest from a hired ApplicantEntry */
function deriveRequest(a: ApplicantEntry): TimeOffRequest {
  const seed = a.id;
  const daysOff = (hashIndex(seed + 'd', 4) || 1); // 1..4 days
  const offsetDays = hashIndex(seed + 'o', 14) + 1; // starts 1-14 days from now
  const from = new Date();
  from.setDate(from.getDate() + offsetDays);
  const to = new Date(from);
  to.setDate(to.getDate() + daysOff - 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const reason = REASONS[hashIndex(seed + 'r', REASONS.length)]!;

  return {
    id: `toff-${a.id}`,
    applicationId: a.id,
    workerName: a.seeker?.name ?? 'Worker',
    photoUrl: a.seeker?.photoUrl ?? null,
    jobTitle: a.job?.title ?? 'Job',
    fromDate: fmt(from),
    toDate: fmt(to),
    days: daysOff,
    reason,
    status: 'pending',
  };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function TimeOffRequestsScreen() {
  const navigation = useNavigation();
  const insets     = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight    = scheme !== 'dark';
  const qc         = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  // Local override map: requestId → approved | denied
  const [decisions, setDecisions] = useState<Record<string, RequestStatus>>({});
  const [selected, setSelected]   = useState<TimeOffRequest | null>(null);

  const workersQuery = useQuery({
    queryKey: ['applicants', 'employer', 'hired-timeoff'],
    queryFn:  () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const hired: ApplicantEntry[] = (workersQuery.data?.applications ?? []).filter(
    (a) => a.status === 'hired',
  );

  // Derive requests — only the first half (deterministically) have pending requests
  const allRequests: TimeOffRequest[] = hired
    .filter((_, i) => i % 2 === 0) // simulate ~50% have requests
    .map(deriveRequest)
    .map((r) => ({ ...r, status: decisions[r.id] ?? r.status }));

  const pending  = allRequests.filter((r) => r.status === 'pending');
  const resolved = allRequests.filter((r) => r.status !== 'pending');

  function decide(id: string, status: 'approved' | 'denied') {
    haptic(status === 'approved' ? 'success' : 'medium');
    setDecisions((prev) => ({ ...prev, [id]: status }));
    setSelected(null);
  }

  const statusColor = (s: RequestStatus) =>
    s === 'pending' ? AMBER : s === 'approved' ? GREEN : RED;
  const statusLabel = (s: RequestStatus) =>
    s === 'pending' ? 'Pending' : s === 'approved' ? 'Approved' : 'Denied';

  function RequestCard({ req }: { req: TimeOffRequest }) {
    const color = statusColor(req.status);
    return (
      <Pressable
        onPress={() => setSelected(req)}
        style={({ pressed }) => ({
          backgroundColor: surface,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: border,
          padding: spacing.md,
          gap: spacing.sm,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {/* Worker row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Avatar name={req.workerName} photoUrl={req.photoUrl} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>{req.workerName}</Text>
            <Text style={{ fontSize: 12, color: textSecondary }}>{req.jobTitle}</Text>
          </View>
          {/* Status pill */}
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4,
            borderRadius: radii.pill,
            backgroundColor: color + '1A',
            borderWidth: 0.5,
            borderColor: color,
          }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color }}>{statusLabel(req.status)}</Text>
          </View>
        </View>

        {/* Date + reason row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="calendar" size={13} color={textSecondary} />
            <Text style={{ fontSize: 13, color: textSecondary }}>
              {fmtDate(req.fromDate)}
              {req.days > 1 ? ` – ${fmtDate(req.toDate)}` : ''}
              {' '}({req.days} day{req.days !== 1 ? 's' : ''})
            </Text>
          </View>
          <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: textSecondary }} />
          <Text style={{ fontSize: 13, color: textSecondary, flex: 1 }} numberOfLines={1}>
            {req.reason}
          </Text>
        </View>

        {/* Quick-action row for pending */}
        {req.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); decide(req.id, 'approved'); }}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                paddingVertical: 8,
                backgroundColor: GREEN + (pressed ? 'CC' : '1A'),
                borderRadius: radii.md, borderWidth: 1, borderColor: GREEN,
              })}
            >
              <Feather name="check" size={13} color={GREEN} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN }}>Approve</Text>
            </Pressable>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); decide(req.id, 'denied'); }}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                paddingVertical: 8,
                backgroundColor: RED + (pressed ? 'CC' : '1A'),
                borderRadius: radii.md, borderWidth: 1, borderColor: RED,
              })}
            >
              <Feather name="x" size={13} color={RED} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: RED }}>Deny</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border,
      }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Time-Off Requests</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={{ backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={workersQuery.isFetching}
            onRefresh={() => void workersQuery.refetch()}
          />
        }
      >
        {workersQuery.isLoading ? (
          <View style={{ gap: spacing.sm }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : allRequests.length === 0 ? (
          <EmptyState
            icon="check-circle"
            tone="hero"
            eyebrow="All clear"
            title="No time-off requests from your crew yet."
          />
        ) : (
          <>
            {/* Pending section */}
            {pending.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Pending ({pending.length})
                  </Text>
                </View>
                {pending.map((r) => <RequestCard key={r.id} req={r} />)}
              </View>
            )}

            {/* Resolved section */}
            {resolved.length > 0 && (
              <View style={{ gap: spacing.sm, marginTop: pending.length > 0 ? spacing.md : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: textSecondary }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Resolved ({resolved.length})
                  </Text>
                </View>
                {resolved.map((r) => <RequestCard key={r.id} req={r} />)}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <BlurOverlay>
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end' }}
          onPress={() => setSelected(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            {selected && (
              <View style={{
                backgroundColor: surface,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: spacing.xl, gap: spacing.lg,
                paddingBottom: insets.bottom + spacing.xl,
              }}>
                {/* Handle */}
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center' }} />

                {/* Worker info */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar name={selected.workerName} photoUrl={selected.photoUrl} size={52} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: textPrimary }}>{selected.workerName}</Text>
                    <Text style={{ fontSize: 14, color: textSecondary }}>{selected.jobTitle}</Text>
                  </View>
                </View>

                {/* Details */}
                {[
                  { icon: 'calendar' as const, label: 'Dates', value: `${fmtDate(selected.fromDate)}${selected.days > 1 ? ` – ${fmtDate(selected.toDate)}` : ''}` },
                  { icon: 'clock' as const, label: 'Duration', value: `${selected.days} day${selected.days !== 1 ? 's' : ''}` },
                  { icon: 'info' as const, label: 'Reason', value: selected.reason },
                ].map(({ icon, label, value }) => (
                  <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isLight ? '#F3F4F6' : '#1E1E1E', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={icon} size={14} color={textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: textSecondary }}>{label}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>{value}</Text>
                    </View>
                  </View>
                ))}

                {/* Actions or status */}
                {selected.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <Pressable
                      onPress={() => decide(selected.id, 'denied')}
                      style={({ pressed }) => ({
                        flex: 1, alignItems: 'center', paddingVertical: 14,
                        backgroundColor: isLight ? '#FEF2F2' : '#3B0000',
                        borderRadius: 14, borderWidth: 1, borderColor: RED,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: RED }}>Deny</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => decide(selected.id, 'approved')}
                      style={({ pressed }) => ({
                        flex: 1, alignItems: 'center', paddingVertical: 14,
                        backgroundColor: GREEN,
                        borderRadius: 14,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Approve</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{
                    paddingVertical: 12, alignItems: 'center', borderRadius: 14,
                    backgroundColor: statusColor(selected.status) + '1A',
                  }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: statusColor(selected.status) }}>
                      {statusLabel(selected.status)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
        </BlurOverlay>
      </Modal>
    </Screen>
  );
}
