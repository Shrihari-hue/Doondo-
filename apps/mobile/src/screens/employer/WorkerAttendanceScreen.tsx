/**
 * WorkerAttendanceScreen — monthly attendance calendar.
 * Matches reference: month nav, calendar grid with colored dots,
 * legend, summary stats, View Attendance History button.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerAttendance'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

type DayStatus = 'present' | 'absent' | 'leave' | 'weekly_off' | 'empty' | 'today';

function buildCalendar(year: number, month: number): DayStatus[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // Convert Sun=0 to Mon=0 grid
  const offset = (firstDay === 0 ? 6 : firstDay - 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: DayStatus[] = [];
  for (let i = 0; i < offset; i++) grid.push('empty');
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0) { grid.push('weekly_off'); continue; } // Sunday
    if (dow === 6) { grid.push('weekly_off'); continue; } // Saturday
    const pct = Math.random();
    if (pct < 0.80) grid.push('present');
    else if (pct < 0.88) grid.push('absent');
    else grid.push('leave');
  }
  return grid;
}

export function WorkerAttendanceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const grid = buildCalendar(year, month);
  const present = grid.filter((d) => d === 'present').length;
  const absent = grid.filter((d) => d === 'absent').length;
  const leave = grid.filter((d) => d === 'leave').length;
  const weeklyOff = grid.filter((d) => d === 'weekly_off').length;

  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg = isLight ? '#F9FAFB' : '#0C0A0E';

  const dotColor: Record<DayStatus, string | null> = {
    present: GREEN, absent: RED, leave: AMBER, weekly_off: '#D1D5DB', today: BLUE, empty: null,
  };

  function prevMonth() {
    haptic('selection');
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    haptic('selection');
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Attendance</Text>
        <Pressable hitSlop={12}><Feather name="calendar" size={20} color={textPrimary} /></Pressable>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Month nav */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Pressable hitSlop={12} onPress={prevMonth}><Feather name="chevron-left" size={22} color={textPrimary} /></Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>{MONTHS[month]} {year}</Text>
              <Feather name="chevron-down" size={16} color={textSecondary} />
            </Pressable>
            <Pressable hitSlop={12} onPress={nextMonth}><Feather name="chevron-right" size={22} color={textPrimary} /></Pressable>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
            {DAYS.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: textSecondary }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {grid.map((status, i) => {
              const dayNum = i - grid.indexOf(grid.find((_, idx) => {
                // Find day 1's index
                let off = 0;
                const firstDay = new Date(year, month, 1).getDay();
                off = firstDay === 0 ? 6 : firstDay - 1;
                return idx === off;
              })!) + 1;

              if (status === 'empty') {
                return <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1 }} />;
              }

              const dot = dotColor[status];
              const isToday = dayNum === now.getDate() && month === now.getMonth() && year === now.getFullYear();

              return (
                <View key={i} style={{ width: `${100/7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16,
                    backgroundColor: isToday ? BLUE : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: isToday ? '800' : '500',
                      color: isToday ? '#FFFFFF' : textPrimary }}>
                      {dayNum > 0 && dayNum <= 31 ? dayNum : ''}
                    </Text>
                  </View>
                  {dot && !isToday && (
                    <View style={{ width: 6, height: 6, borderRadius: 3,
                      backgroundColor: dot, marginTop: 2 }} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md,
            paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: border }}>
            {[
              { color: GREEN, label: 'Present' },
              { color: RED, label: 'Absent' },
              { color: AMBER, label: 'Leave' },
              { color: '#D1D5DB', label: 'Weekly Off', border: true },
            ].map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color,
                  borderWidth: item.border ? 1 : 0, borderColor: '#9CA3AF' }} />
                <Text style={{ fontSize: 11, color: textSecondary }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Summary stats */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            {[
              { value: present, label: 'Present', color: GREEN },
              { value: absent, label: 'Absent', color: RED },
              { value: leave, label: 'Leave', color: AMBER },
              { value: weeklyOff, label: 'Weekly Off', color: '#9CA3AF' },
            ].map((stat, i) => (
              <View key={stat.label} style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.md,
                borderRightWidth: i < 3 ? 1 : 0, borderRightColor: border }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: stat.color }}>{stat.value}</Text>
                <Text style={{ fontSize: 10, color: textSecondary, textAlign: 'center', marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* View history */}
        <Pressable style={({ pressed }) => ({
          backgroundColor: surface, borderRadius: 12, borderWidth: 1.5, borderColor: BLUE,
          paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.75 : 1,
        })}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>View Attendance History</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
