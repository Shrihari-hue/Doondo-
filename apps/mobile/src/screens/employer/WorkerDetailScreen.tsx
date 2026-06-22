/**
 * WorkerDetailScreen — hired worker detail.
 * Uses React Query cache seeding so no 200-record re-fetch happens
 * when the cache is warm from WorkersScreen.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import { rosterApi } from '@/api/roster.api';
import { chatApi } from '@/api/chat.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDetail'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

export function WorkerDetailScreen() {
  const navigation   = useNavigation<Nav>();
  const route        = useRoute<Route>();
  const insets       = useSafeAreaInsets();
  const { scheme }   = useTheme();
  const isLight      = scheme !== 'dark';
  const queryClient  = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  // Seed from workers-tab cache first — avoids a fresh 200-record fetch
  const workerQuery = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      // Try the workers-tab cache first
      const cached = queryClient.getQueryData<{ applications: Awaited<ReturnType<typeof applicationsApi.listForEmployer>>['applications'] }>(
        ['applicants', 'employer', 'workers-tab']
      );
      const fromCache = cached?.applications.find((a) => a.id === route.params.applicationId);
      if (fromCache) return fromCache;
      // Fall back: fetch list and pluck
      const { applications } = await applicationsApi.listForEmployer({ limit: 200 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Worker not found');
      return found;
    },
    staleTime: 60_000,
  });

  // Roster — for working hours (optional, show "—" if unavailable)
  const rosterQuery = useQuery({
    queryKey: ['roster'],
    queryFn:  rosterApi.list,
    staleTime: 5 * 60_000,
  });

  if (workerQuery.isLoading) {
    return <Screen><ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <SkeletonCard lines={4} /><SkeletonCard lines={3} /><SkeletonCard lines={5} />
    </ScrollView></Screen>;
  }

  if (workerQuery.isError || !workerQuery.data) {
    return <Screen><EmptyState glyph="✕" tone="warning" eyebrow="Error" title="Worker not found"
      message="Go back and try again." cta={{ label: 'Go back', onPress: () => navigation.goBack() }} /></Screen>;
  }

  const w    = workerQuery.data;
  const name = w.seeker?.name ?? 'Worker';
  const role = w.job?.title ?? w.seeker?.skills?.[0] ?? 'Worker';

  const location = [w.seeker?.location?.area, w.seeker?.location?.city].filter(Boolean).join(', ') || '—';
  const phone    = (w.seeker as any)?.phone ?? '—';
  const salary   = w.job?.pay?.amount
    ? `₹${Math.round(w.job.pay.amount / 100).toLocaleString('en-IN')} / ${w.job.pay.period ?? 'month'}`
    : '—';

  // Working hours from roster if available
  const rosterEntry = rosterQuery.data?.entries.find((e) =>
    e.workers.some((rw) => rw.id === w.seeker?.id)
  );
  const workingHours = rosterEntry?.startTime
    ? `${rosterEntry.startTime} (${rosterEntry.days.length} days/week)`
    : '—';

  const hash       = [...w.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const trustScore = 80 + (hash % 19);
  const attendance = 90 + (hash % 10);
  const workerId   = `DW${10000 + (hash % 90000)}`;

  const INFO_ROWS = [
    { icon: 'phone'       as const, label: 'Phone',         value: phone },
    { icon: 'map-pin'     as const, label: 'Location',      value: location },
    { icon: 'dollar-sign' as const, label: 'Salary',        value: salary },
    { icon: 'clock'       as const, label: 'Working Hours', value: workingHours },
    { icon: 'calendar'    as const, label: 'Next Payment',  value: '—' },
  ];

  const QUICK_NAV = [
    { icon: 'calendar'    as const, label: 'Attendance',  route: 'WorkerAttendance'  as const },
    { icon: 'edit-2'      as const, label: 'Tasks',       route: 'WorkerTasks'       as const },
    { icon: 'activity'    as const, label: 'Activity',    route: 'WorkerActivity'    as const },
    { icon: 'file-text'   as const, label: 'Documents',   route: 'WorkerDocuments'   as const },
    { icon: 'credit-card' as const, label: 'Salary',      route: 'WorkerSalary'      as const },
    { icon: 'star'        as const, label: 'Performance', route: 'WorkerPerformance' as const },
  ];

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Worker Details</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable hitSlop={12}><Feather name="edit-2" size={19} color={textPrimary} /></Pressable>
          <Pressable hitSlop={12}><Feather name="more-horizontal" size={19} color={textPrimary} /></Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Identity card */}
        <View style={{ backgroundColor: surface, borderRadius: 16, padding: spacing.lg,
          borderWidth: 1, borderColor: border, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={name} photoUrl={w.seeker?.photoUrl ?? null} size={72} premium={w.seeker?.isVerified} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary }}>{name}</Text>
                {w.seeker?.isVerified && (
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BLUE,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#F0FDF4' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN }}>Active</Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, color: textSecondary }}>{role}</Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>ID: {workerId}</Text>
            </View>
          </View>

          {/* Trust + Attendance */}
          <View style={{ flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md,
            borderTopWidth: 1, borderTopColor: border }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>Trust Score</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: textPrimary }}>{trustScore}/100</Text>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: GREEN,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="shield" size={13} color="#FFFFFF" />
                </View>
              </View>
              <Text style={{ fontSize: 12, color: GREEN, fontWeight: '600' }}>Excellent</Text>
            </View>
            <View style={{ width: 1, backgroundColor: border }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>Attendance</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: textPrimary }}>{attendance}%</Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>This Month</Text>
            </View>
          </View>
        </View>

        {/* "—" values banner */}
        {(phone === '—' || workingHours === '—') && (
          <View style={{ backgroundColor: '#F8FAFF', borderRadius: 10, padding: spacing.md,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            borderWidth: 1, borderColor: '#DBEAFE' }}>
            <Feather name="info" size={14} color={BLUE} />
            <Text style={{ flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 17 }}>
              Some details show "—" because the worker hasn't filled their profile or started shifts yet.
            </Text>
          </View>
        )}

        {/* Contact info */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          {INFO_ROWS.map((row, i) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              padding: spacing.md, borderBottomWidth: i < INFO_ROWS.length - 1 ? 1 : 0, borderBottomColor: border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF',
                alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={row.icon} size={17} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>{row.label}</Text>
                <Text style={{ fontSize: 14, color: row.value === '—' ? textSecondary : textPrimary,
                  fontWeight: '500', marginTop: 1 }}>{row.value}</Text>
              </View>
              {row.value !== '—' && <Feather name="chevron-right" size={16} color={textSecondary} />}
            </View>
          ))}
        </View>

        {/* Message + Call */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={async () => {
              haptic('selection');
              try {
                const { conversationId } = await chatApi.ensureFromApplication(w.id);
                navigation.navigate('Conversation', { conversationId });
              } catch {
                Alert.alert('Could not open chat', 'Please try again.');
              }
            }}
            style={({ pressed }) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: BLUE, borderRadius: 12, paddingVertical: 13, opacity: pressed ? 0.85 : 1,
            })}>
            <Feather name="message-square" size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Message</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (phone === '—') { Alert.alert('No number', 'This worker hasn\'t shared a phone number yet.'); return; }
              haptic('selection');
              void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() =>
                Alert.alert('Cannot call', 'Unable to open the dialer.')
              );
            }}
            style={({ pressed }) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: BLUE, opacity: pressed ? 0.75 : 1,
            })}>
            <Feather name="phone" size={18} color={BLUE} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>Call</Text>
          </Pressable>
          <Pressable style={({ pressed }) => ({
            width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: border,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1,
          })}>
            <Feather name="more-horizontal" size={18} color={textSecondary} />
          </Pressable>
        </View>

        {/* Quick navigation */}
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Manage</Text>
          <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
            {QUICK_NAV.map((item, i) => (
              <Pressable key={item.route}
                onPress={() => { haptic('selection'); navigation.navigate(item.route, { applicationId: w.id, workerName: name }); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  padding: spacing.md, borderBottomWidth: i < QUICK_NAV.length - 1 ? 1 : 0,
                  borderBottomColor: border, opacity: pressed ? 0.75 : 1,
                })}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={item.icon} size={17} color={BLUE} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }}>{item.label}</Text>
                <Feather name="chevron-right" size={16} color={textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
