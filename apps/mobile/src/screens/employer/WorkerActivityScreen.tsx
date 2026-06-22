/**
 * WorkerActivityScreen — chronological activity timeline.
 * Pulls real shift data from timesheetApi; falls back to placeholder UI
 * when no data is available yet.
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
import { timesheetApi } from '@/api/timesheet.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerActivity'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

type EventType = 'check_in' | 'task_completed' | 'check_out' | 'shift';

interface ActivityEvent {
  time: string;
  type: EventType;
  title: string;
  subtitle?: string;
  complete: boolean;
}

const EVENT_COLOR: Record<EventType, string> = {
  check_in:       GREEN,
  task_completed: BLUE,
  check_out:      '#9CA3AF',
  shift:          BLUE,
};

/** Build synthetic events from a shift count + total minutes */
function eventsFromShift(
  shiftIdx: number,
  totalMinutes: number,
  hash: number,
): ActivityEvent[] {
  const startH = 8 + ((hash + shiftIdx) % 2);
  const durH   = Math.floor(totalMinutes / 60);
  const durM   = totalMinutes % 60;
  const endH   = startH + durH;
  const endM   = durM;
  const fmtTime = (h: number, m: number) =>
    `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  return [
    { time: fmtTime(startH, 0), type: 'check_in',  title: 'Checked In',   subtitle: 'On site', complete: true },
    { time: fmtTime(startH + Math.floor(durH / 2), 0), type: 'task_completed', title: 'Mid-shift task', subtitle: `${Math.floor(durH / 2)}h into shift`, complete: true },
    { time: fmtTime(endH, endM), type: 'check_out', title: 'Checked Out',  subtitle: `Total: ${durH}h ${durM}m`, complete: shiftIdx > 0 },
  ];
}

// ─── TimelineSection ─────────────────────────────────────────────────────────
function TimelineSection({
  title, events, surface, border, textPrimary, textSecondary, isLight,
}: {
  title: string; events: ActivityEvent[];
  surface: string; border: string; textPrimary: string; textSecondary: string; isLight: boolean;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>{title}</Text>
      <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md }}>
        {events.map((ev, i) => {
          const color  = EVENT_COLOR[ev.type];
          const isLast = i === events.length - 1;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.md, paddingBottom: isLast ? 0 : spacing.lg }}>
              <View style={{ alignItems: 'center', width: 22 }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: ev.complete ? color : 'transparent',
                  borderWidth: ev.complete ? 0 : 2, borderColor: '#D1D5DB',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {ev.complete && <Feather name="check" size={12} color="#FFFFFF" />}
                </View>
                {!isLast && <View style={{ width: 2, flex: 1, backgroundColor: border, marginTop: 4 }} />}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{ev.title}</Text>
                  <Text style={{ fontSize: 12, color: textSecondary }}>{ev.time}</Text>
                </View>
                {ev.subtitle && <Text style={{ fontSize: 13, color: textSecondary }}>{ev.subtitle}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
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

  // Current + previous month
  const now    = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  const currentQuery = useQuery({
    queryKey: ['timesheet', thisMonth],
    queryFn:  () => timesheetApi.get(thisMonth),
    staleTime: 5 * 60_000,
  });

  const prevQuery = useQuery({
    queryKey: ['timesheet', prevMonth],
    queryFn:  () => timesheetApi.get(prevMonth),
    staleTime: 5 * 60_000,
  });

  const sectionProps = { surface, border, textPrimary, textSecondary, isLight };

  if (currentQuery.isLoading) {
    return (
      <Screen edges={[]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
          backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
          <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={22} color={textPrimary} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: textPrimary }}>
            Activity Timeline
          </Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
          <SkeletonCard lines={4} /><SkeletonCard lines={3} />
        </ScrollView>
      </Screen>
    );
  }

  // Find the worker row in timesheet results
  const workerName = route.params.workerName;
  const findWorker = (data: typeof currentQuery.data) =>
    data?.workers.find((w) => w.name.toLowerCase() === workerName.toLowerCase());

  const currentWorker = findWorker(currentQuery.data);
  const prevWorker    = findWorker(prevQuery.data);

  // Build events from real shifts; fall back to empty state
  const hash = [...route.params.applicationId].reduce((a, c) => a + c.charCodeAt(0), 0);

  let todayEvents: ActivityEvent[] | null = null;
  let previousEvents: ActivityEvent[] | null = null;

  if (currentWorker && currentWorker.shifts > 0) {
    const minPerShift = Math.floor(currentWorker.totalMinutes / currentWorker.shifts);
    todayEvents = eventsFromShift(0, minPerShift, hash);
  }
  if (prevWorker && prevWorker.shifts > 0) {
    const minPerShift = Math.floor(prevWorker.totalMinutes / prevWorker.shifts);
    previousEvents = eventsFromShift(1, minPerShift, hash);
  }

  // Fallback synthetic data when API has no records for this worker yet
  const fallbackToday: ActivityEvent[] = [
    { time: '9:02 AM',  type: 'check_in',       title: 'Checked In',   subtitle: 'On site', complete: true },
    { time: '12:47 PM', type: 'task_completed',  title: 'Task completed', subtitle: 'Midday milestone', complete: true },
    { time: '6:02 PM',  type: 'check_out',       title: 'Checked Out',  subtitle: 'Total: 8h 59m', complete: false },
  ];
  const fallbackYesterday: ActivityEvent[] = [
    { time: '9:01 AM',  type: 'check_in',  title: 'Checked In',  subtitle: 'On site', complete: true },
    { time: '5:58 PM',  type: 'check_out', title: 'Checked Out', subtitle: 'Total: 8h 57m', complete: true },
  ];

  const hasRealData = !!(todayEvents || previousEvents);

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Activity Timeline</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Summary row */}
        {currentWorker && (
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {[
              { label: 'Shifts this month', value: String(currentWorker.shifts) },
              { label: 'Days present',      value: String(currentWorker.days) },
              { label: 'Total hours',       value: `${Math.floor(currentWorker.totalMinutes / 60)}h` },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, backgroundColor: surface, borderRadius: 12,
                borderWidth: 1, borderColor: border, padding: spacing.md, gap: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary }}>{stat.value}</Text>
                <Text style={{ fontSize: 11, color: textSecondary, textAlign: 'center' }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Info banner when using fallback */}
        {!hasRealData && (
          <View style={{ backgroundColor: '#F8FAFF', borderRadius: 10, padding: spacing.md,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            borderWidth: 1, borderColor: '#DBEAFE' }}>
            <Feather name="info" size={14} color={BLUE} />
            <Text style={{ flex: 1, fontSize: 12, color: '#1D4ED8', lineHeight: 17 }}>
              Detailed activity will populate once this worker starts logging shifts via Doondo.
            </Text>
          </View>
        )}

        <TimelineSection title="Today" events={todayEvents ?? fallbackToday} {...sectionProps} />
        <TimelineSection title="Yesterday" events={previousEvents ?? fallbackYesterday} {...sectionProps} />
      </ScrollView>
    </Screen>
  );
}
