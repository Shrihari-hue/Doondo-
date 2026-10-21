/**
 * WorkerAttendanceScreen — monthly attendance calendar built from the
 * worker's real shift check-ins, leave days and the job's schedule
 * (via /workforce/:applicationId?month=YYYY-MM).
 */

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { workforceApi, clockTime } from '@/api/workforce.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerAttendance'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';
const RED   = '#EF4444';
const AMBER = '#F59E0B';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

type DayStatus = 'present' | 'late' | 'absent' | 'leave' | 'weekly_off' | 'future';

interface CalDay { day: number; date: string; status: DayStatus; isToday: boolean; }

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function WorkerAttendanceScreen() {
  const navigation   = useNavigation<Nav>();
  const route        = useRoute<Route>();
  const insets       = useSafeAreaInsets();
  const { scheme }   = useTheme();
  const isLight      = scheme !== 'dark';
  const queryClient  = useQueryClient();

  const today   = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const query = useQuery({
    queryKey: ['workforce', 'detail', route.params.applicationId, monthStr],
    queryFn:  () => workforceApi.detail(route.params.applicationId, { month: monthStr }),
    staleTime: 60_000,
  });

  const toggleLeave = useMutation({
    mutationFn: async (cell: CalDay) =>
      cell.status === 'leave'
        ? workforceApi.cancelLeave(route.params.applicationId, cell.date)
        : workforceApi.markLeave(route.params.applicationId, { date: cell.date }),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['workforce'] });
    },
    onError: () => Alert.alert('Could not update leave', 'Please try again.'),
  });

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const data = query.data;
  const byDate = new Map((data?.calendar ?? []).map((c) => [c.date, c.status]));
  const firstDow    = new Date(year, month, 1).getDay();
  const offset      = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const days: CalDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const date = ymd(year, month, i + 1);
    const api = byDate.get(date);
    const status: DayStatus =
      api === 'present' || api === 'late' || api === 'absent' || api === 'leave'
        ? api
        : api === 'off' || api === 'before_hire'
          ? 'weekly_off'
          : 'future';
    return { day: i + 1, date, status, isToday: date === todayStr };
  });

  const stats     = data?.attendance;
  const present   = stats?.present ?? 0;
  const late      = stats?.late ?? 0;
  const absent    = stats?.absent ?? 0;
  const leave     = stats?.leave ?? 0;
  const workDays  = stats?.workingDays ?? 0;
  const attendancePct = stats?.percent ?? 0;
  const hasShifts = (data?.shifts.length ?? 0) > 0;
  const monthMinutes = (data?.shifts ?? []).reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const monthShiftDays = new Set((data?.shifts ?? []).map((s) => s.date)).size;

  function onCellPress(cell: CalDay) {
    if (cell.status === 'future' && !cell.isToday) return;
    if (cell.status === 'present' || cell.status === 'late') {
      const shift = data?.shifts.find((s) => s.date === cell.date);
      Alert.alert(
        `${cell.day} ${MONTHS[month]}`,
        shift
          ? `In ${clockTime(shift.checkInAt)}${shift.checkOutAt ? ` · Out ${clockTime(shift.checkOutAt)}` : ' · not checked out'}`
          : 'Checked in',
      );
      return;
    }
    if (cell.status === 'weekly_off' && !cell.isToday) return;
    const marking = cell.status !== 'leave';
    Alert.alert(
      marking ? 'Mark leave' : 'Remove leave',
      `${marking ? 'Mark' : 'Un-mark'} ${route.params.workerName.split(' ')[0]} as on leave on ${cell.day} ${MONTHS[month]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: marking ? 'Mark leave' : 'Remove', onPress: () => toggleLeave.mutate(cell) },
      ],
    );
  }

  const cellBg: Record<DayStatus, string> = {
    present:    GREEN + '25',
    late:       AMBER + '30',
    absent:     RED   + '20',
    leave:      '#8B5CF620',
    weekly_off: 'transparent',
    future:     'transparent',
  };
  const cellBorder: Record<DayStatus, string> = {
    present:    GREEN + '50',
    late:       AMBER + '60',
    absent:     RED   + '40',
    leave:      '#8B5CF640',
    weekly_off: 'transparent',
    future:     'transparent',
  };
  const cellText: Record<DayStatus, string | null> = {
    present:    GREEN,
    late:       '#B45309',
    absent:     RED,
    leave:      '#7C3AED',
    weekly_off: null,
    future:     null,
  };

  function prevMonth() {
    haptic('selection');
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    haptic('selection');
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const rows = Math.ceil((offset + days.length) / 7);

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
          Attendance — {route.params.workerName.split(' ')[0]}
        </Text>
        <Pressable hitSlop={12}><Feather name="calendar" size={20} color={textPrimary} /></Pressable>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: insets.bottom + 32 }}>

        {query.isError && (
          <View style={{ backgroundColor: isLight ? '#FEF2F2' : '#2A0A0A', borderRadius: 12, padding: spacing.md,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: RED + '40' }}>
            <Feather name="alert-circle" size={16} color={RED} />
            <Text style={{ flex: 1, fontSize: 13, color: RED, lineHeight: 18 }}>
              Couldn't load attendance. Pull back and open this screen again.
            </Text>
          </View>
        )}
        {!hasShifts && !query.isLoading && !query.isError && (
          <View style={{ backgroundColor: isLight ? '#FFFBEB' : '#2A1A00', borderRadius: 12, padding: spacing.md,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            borderWidth: 1, borderColor: isLight ? '#FDE68A' : '#78350F' }}>
            <Feather name="info" size={16} color={AMBER} />
            <Text style={{ flex: 1, fontSize: 13, color: isLight ? '#92400E' : '#FCD34D', lineHeight: 18 }}>
              No shift check-ins this month. Days fill in automatically when the worker checks in on the Doondo app. Tap a day to mark leave.
            </Text>
          </View>
        )}

        {hasShifts && (
          <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
            <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {MONTHS[month]} · From Shifts{data?.pattern.startTime ? ` · starts ${data.pattern.startTime}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Days Worked', value: String(monthShiftDays) },
                { label: 'Total Shifts', value: String(data?.shifts.length ?? 0) },
                { label: 'Hours Logged', value: `${Math.floor(monthMinutes / 60)}h` },
              ].map((s, i) => (
                <View key={s.label} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md,
                  borderRightWidth: i < 2 ? 1 : 0, borderRightColor: border }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary }}>{s.value}</Text>
                  <Text style={{ fontSize: 10, color: textSecondary, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Attendance summary strip */}
        <View style={{ backgroundColor: surface, borderRadius: 14, borderWidth: 1, borderColor: border,
          padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: textPrimary }}>
              {present + late}/{workDays} days
            </Text>
            <Text style={{ fontSize: 13, color: textSecondary }}>
              {stats?.percent == null ? 'No working days yet' : `${attendancePct}% attendance · ${MONTHS[month]}`}
            </Text>
          </View>
          <View style={{ width: 56, height: 56, borderRadius: 28,
            backgroundColor: attendancePct >= 85 ? GREEN + '20' : attendancePct >= 70 ? AMBER + '20' : RED + '20',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: attendancePct >= 85 ? GREEN : attendancePct >= 70 ? AMBER : RED }}>
            <Text style={{ fontSize: 15, fontWeight: '900',
              color: attendancePct >= 85 ? GREEN : attendancePct >= 70 ? AMBER : RED }}>
              {attendancePct}%
            </Text>
          </View>
        </View>

        {/* Calendar card */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md }}>
          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Pressable hitSlop={12} onPress={prevMonth}>
              <Feather name="chevron-left" size={22} color={textPrimary} />
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>{MONTHS[month]} {year}</Text>
              {(query.isFetching || toggleLeave.isPending) && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            <Pressable hitSlop={12} onPress={nextMonth}>
              <Feather name="chevron-right" size={22} color={isCurrentMonth ? border : textPrimary} />
            </Pressable>
          </View>

          {/* Day-of-week headers */}
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {DAYS.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: textSecondary, letterSpacing: 0.5 }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Grid rows */}
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: 'row', marginBottom: 4, gap: 2 }}>
              {Array.from({ length: 7 }).map((_, colIdx) => {
                const cellIdx = rowIdx * 7 + colIdx;
                const dayIdx  = cellIdx - offset;
                if (dayIdx < 0 || dayIdx >= days.length) {
                  return <View key={colIdx} style={{ flex: 1, height: 38 }} />;
                }
                const cell     = days[dayIdx]!;
                const isWeekend = cell.status === 'weekly_off';
                const isFuture  = cell.status === 'future';
                return (
                  <Pressable key={colIdx} onPress={() => onCellPress(cell)}
                    style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: 34, height: 34,
                      borderRadius: 8,
                      backgroundColor: cell.isToday ? BLUE
                        : isWeekend || isFuture ? 'transparent'
                        : cellBg[cell.status],
                      borderWidth: cell.isToday ? 0 : isWeekend || isFuture ? 0 : 1,
                      borderColor: cell.isToday ? 'transparent' : cellBorder[cell.status],
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: cell.isToday ? '900' : '500',
                        color: cell.isToday ? '#FFFFFF'
                          : isWeekend ? textSecondary
                          : isFuture ? isLight ? '#D1D5DB' : '#374151'
                          : (cellText[cell.status] ?? textPrimary),
                      }}>
                        {cell.day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap',
            gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md,
            borderTopWidth: 1, borderTopColor: border }}>
            {[
              { color: GREEN,     label: 'Present' },
              { color: AMBER,     label: 'Late' },
              { color: RED,       label: 'Absent' },
              { color: '#7C3AED', label: 'Leave' },
            ].map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color + '40',
                  borderWidth: 1, borderColor: item.color + '60' }} />
                <Text style={{ fontSize: 11, color: textSecondary }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Summary stats */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            {[
              { value: present,   label: 'Present',    color: GREEN },
              { value: late,      label: 'Late',       color: AMBER },
              { value: absent,    label: 'Absent',     color: RED },
              { value: leave,     label: 'Leave',      color: '#7C3AED' },
            ].map((stat, i) => (
              <View key={stat.label} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md,
                borderRightWidth: i < 3 ? 1 : 0, borderRightColor: border }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 10, color: textSecondary, textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={{ fontSize: 12, color: textSecondary, textAlign: 'center' }}>
          Tap a day to see check-in times or to mark / remove leave.
        </Text>
      </ScrollView>
    </Screen>
  );
}
