/**
 * WorkerActivityScreen — chronological activity timeline for one hire,
 * grouped by day. Built from real events (check-ins/outs, work photos,
 * payments, leave, hire) via /workforce/:applicationId.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text, SkeletonCard } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { workforceApi, clockTime, type WorkerDetail } from '@/api/workforce.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerActivity'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

type EventKind = WorkerDetail['activity'][number]['kind'];

const EVENT_STYLE: Record<EventKind, { color: string; icon: React.ComponentProps<typeof Feather>['name'] }> = {
  check_in:   { color: GREEN,     icon: 'log-in' },
  check_out:  { color: '#6B7280', icon: 'log-out' },
  work_proof: { color: BLUE,      icon: 'camera' },
  payment:    { color: '#059669', icon: 'credit-card' },
  leave:      { color: '#7C3AED', icon: 'moon' },
  hired:      { color: '#D97706', icon: 'award' },
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function WorkerActivityScreen() {
  const navigation   = useNavigation<Nav>();
  const route        = useRoute<Route>();
  const insets       = useSafeAreaInsets();
  const { scheme }   = useTheme();
  const isLight      = scheme !== 'dark';

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const query = useQuery({
    queryKey: ['workforce', 'detail', route.params.applicationId, 'activity'],
    queryFn:  () => workforceApi.detail(route.params.applicationId, { days: 60 }),
    staleTime: 60_000,
  });

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
      backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
      <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
        <Feather name="arrow-left" size={22} color={textPrimary} />
      </Pressable>
      <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
        Activity — {route.params.workerName.split(' ')[0]}
      </Text>
      <View style={{ width: 22 }} />
    </View>
  );

  if (query.isLoading) {
    return (
      <Screen edges={[]}>
        {header}
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
          <SkeletonCard lines={4} /><SkeletonCard lines={3} />
        </ScrollView>
      </Screen>
    );
  }

  const data = query.data;
  const events = data?.activity ?? [];
  const groups: Array<{ label: string; events: typeof events }> = [];
  for (const ev of events) {
    const label = dayLabel(ev.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.events.push(ev);
    else groups.push({ label, events: [ev] });
  }
  const totalMinutes = (data?.shifts ?? []).reduce((s, x) => s + (x.minutes ?? 0), 0);

  return (
    <Screen edges={[]}>
      {header}
      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {data && (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {[
              { label: 'Shifts (60 days)', value: String(data.shifts.length) },
              { label: 'Days present',     value: String(data.attendance.present + data.attendance.late) },
              { label: 'Hours logged',     value: `${Math.floor(totalMinutes / 60)}h` },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, backgroundColor: surface, borderRadius: 12,
                borderWidth: 1, borderColor: border, padding: spacing.md, gap: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary }}>{stat.value}</Text>
                <Text style={{ fontSize: 11, color: textSecondary, textAlign: 'center' }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {(query.isError || groups.length === 0) && (
          <View style={{ backgroundColor: isLight ? '#F8FAFF' : '#1E2A3A', borderRadius: 10, padding: spacing.md,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            borderWidth: 1, borderColor: isLight ? '#DBEAFE' : '#1E3A5F' }}>
            <Feather name="info" size={14} color={BLUE} />
            <Text style={{ flex: 1, fontSize: 12, color: isLight ? '#1D4ED8' : '#93C5FD', lineHeight: 17 }}>
              {query.isError
                ? "Couldn't load activity. Go back and try again."
                : 'No activity yet. Check-ins, work photos and payments will appear here as they happen.'}
            </Text>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.label} style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>{g.label}</Text>
            <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md }}>
              {g.events.map((ev, i) => {
                const st = EVENT_STYLE[ev.kind];
                const isLast = i === g.events.length - 1;
                return (
                  <View key={`${ev.at}-${i}`} style={{ flexDirection: 'row', gap: spacing.md, paddingBottom: isLast ? 0 : spacing.lg }}>
                    <View style={{ alignItems: 'center', width: 24 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: st.color,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={st.icon} size={12} color="#FFFFFF" />
                      </View>
                      {!isLast && <View style={{ width: 2, flex: 1, backgroundColor: border, marginTop: 4 }} />}
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: textPrimary, flex: 1 }}>{ev.label}</Text>
                      {ev.kind !== 'leave' && (
                        <Text style={{ fontSize: 12, color: textSecondary }}>{clockTime(ev.at)}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
