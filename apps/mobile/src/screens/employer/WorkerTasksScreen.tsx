/**
 * WorkerTasksScreen — task list with Pending/In Progress/Completed tabs.
 * Matches reference: task cards with icon, location, date, priority badge, status.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerTasks'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#F59E0B';
const ORANGE = '#EA580C';

type TaskStatus = 'pending' | 'in_progress' | 'completed';

interface Task {
  id: string; title: string; location: string;
  date: string; priority: 'High' | 'Medium' | 'Low';
  status: TaskStatus; icon: React.ComponentProps<typeof Feather>['name'];
}

const MOCK_TASKS: Task[] = [
  { id: '1', title: 'Fix electrical wiring in Office', location: 'Koramangala, Bengaluru',
    date: '20 May 2024', priority: 'High', status: 'in_progress', icon: 'zap' },
  { id: '2', title: 'Install new MCB in main board', location: 'HSR Layout, Bengaluru',
    date: '22 May 2024', priority: 'Medium', status: 'pending', icon: 'tool' },
  { id: '3', title: 'Check light fitting in Cabin 3', location: 'Koramangala, Bengaluru',
    date: '25 May 2024', priority: 'Low', status: 'pending', icon: 'sun' },
  { id: '4', title: 'Replace fan motor in Conference', location: 'Indiranagar, Bengaluru',
    date: '10 May 2024', priority: 'Medium', status: 'completed', icon: 'wind' },
  { id: '5', title: 'Wire new AC unit in Director cabin', location: 'MG Road, Bengaluru',
    date: '5 May 2024', priority: 'High', status: 'completed', icon: 'thermometer' },
];

const PRIORITY_STYLE: Record<string, { bg: string; fg: string }> = {
  High:   { bg: '#FEF2F2', fg: ORANGE },
  Medium: { bg: '#FFFBEB', fg: AMBER },
  Low:    { bg: '#F0FDF4', fg: GREEN },
};

const STATUS_STYLE: Record<TaskStatus, { bg: string; fg: string; label: string }> = {
  pending:     { bg: '#F3F4F6', fg: '#6B7280', label: 'Pending' },
  in_progress: { bg: '#EFF6FF', fg: BLUE,      label: 'In Progress' },
  completed:   { bg: '#F0FDF4', fg: GREEN,      label: 'Completed' },
};

export function WorkerTasksScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const [tab, setTab] = useState<TaskStatus>('pending');

  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg = isLight ? '#F9FAFB' : '#0C0A0E';

  const counts = {
    pending: MOCK_TASKS.filter((t) => t.status === 'pending').length,
    in_progress: MOCK_TASKS.filter((t) => t.status === 'in_progress').length,
    completed: MOCK_TASKS.filter((t) => t.status === 'completed').length,
  };

  const visible = MOCK_TASKS.filter((t) => t.status === tab);

  const TABS = [
    { key: 'pending' as const,     label: `Pending (${counts.pending})` },
    { key: 'in_progress' as const, label: `In Progress (${counts.in_progress})` },
    { key: 'completed' as const,   label: `Completed (${counts.completed})` },
  ];

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Tasks</Text>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} hitSlop={8}>
          <Feather name="plus" size={18} color={BLUE} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: BLUE }}>Assign Task</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => { haptic('selection'); setTab(t.key); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
                borderBottomWidth: 2, borderBottomColor: active ? BLUE : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500',
                color: active ? BLUE : textSecondary }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: 60 }}>
        {visible.map((task) => {
          const st = STATUS_STYLE[task.status];
          const pr = PRIORITY_STYLE[task.priority];
          return (
            <View key={task.id} style={{ backgroundColor: surface, borderRadius: 16,
              borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.sm,
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={task.icon} size={20} color={BLUE} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: textPrimary, marginRight: 8 }}>
                      {task.title}
                    </Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: st.bg }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: st.fg }}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="map-pin" size={11} color={textSecondary} />
                    <Text style={{ fontSize: 12, color: textSecondary }}>{task.location}</Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: border }}>
                <Feather name="calendar" size={13} color={textSecondary} />
                <Text style={{ fontSize: 12, color: textSecondary, flex: 1 }}>{task.date}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: pr.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: pr.fg }}>{task.priority}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {tab === 'completed' && (
          <Pressable style={({ pressed }) => ({
            borderRadius: 12, borderWidth: 1.5, borderColor: border,
            paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.75 : 1,
          })}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: BLUE }}>View Completed Tasks</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}
