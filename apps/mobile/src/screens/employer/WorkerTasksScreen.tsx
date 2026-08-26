/**
 * WorkerTasksScreen — task list with Pending/In Progress/Completed tabs.
 * Tasks are managed via local state + a simple add-task bottom sheet.
 * Seeded with example tasks so the screen is never empty on first open.
 */

import { useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, TextInput, View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, BlurOverlay, EmptyState, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerTasks'>;

const BLUE   = '#2563EB';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const ORANGE = '#F97316';

type TaskStatus   = 'pending' | 'in_progress' | 'completed';
type TaskPriority = 'High' | 'Medium' | 'Low';

interface Task {
  id: string;
  title: string;
  location: string;
  date: string;
  priority: TaskPriority;
  status: TaskStatus;
  icon: React.ComponentProps<typeof Feather>['name'];
}

const SEED_TASKS: Task[] = [
  { id: '1', title: 'Fix electrical wiring in Office', location: 'Koramangala, Bengaluru',
    date: 'Due: 20 Jun', priority: 'High',   status: 'in_progress', icon: 'zap' },
  { id: '2', title: 'Install new MCB in main board',  location: 'HSR Layout, Bengaluru',
    date: 'Due: 22 Jun', priority: 'Medium', status: 'pending',     icon: 'tool' },
  { id: '3', title: 'Check light fitting in Cabin 3', location: 'Koramangala, Bengaluru',
    date: 'Due: 25 Jun', priority: 'Low',    status: 'pending',     icon: 'sun' },
  { id: '4', title: 'Replace fan motor in Conference',location: 'Indiranagar, Bengaluru',
    date: 'Done: 10 Jun',priority: 'Medium', status: 'completed',   icon: 'wind' },
];

function getPriorityStyle(isLight: boolean): Record<TaskPriority, { bg: string; fg: string }> {
  return {
    High:   { bg: isLight ? '#FEF2F2' : '#3B0A0A', fg: ORANGE },
    Medium: { bg: isLight ? '#FFFBEB' : '#2A1A00', fg: AMBER },
    Low:    { bg: isLight ? '#F0FDF4' : '#052E16', fg: GREEN },
  };
}

function getStatusStyle(isLight: boolean): Record<TaskStatus, { bg: string; fg: string; label: string }> {
  return {
    pending:     { bg: isLight ? '#F3F4F6' : '#1F2937', fg: '#6B7280', label: 'Pending' },
    in_progress: { bg: isLight ? '#EFF6FF' : '#1E3A5F', fg: BLUE,      label: 'In Progress' },
    completed:   { bg: isLight ? '#F0FDF4' : '#052E16', fg: GREEN,      label: 'Completed' },
  };
}

export function WorkerTasksScreen() {
  const navigation  = useNavigation<Nav>();
  const route       = useRoute<Route>();
  const insets      = useSafeAreaInsets();
  const { scheme }  = useTheme();
  const isLight     = scheme !== 'dark';

  const [tasks, setTasks]       = useState<Task[]>(SEED_TASKS);
  const [tab, setTab]           = useState<TaskStatus>('pending');
  const [showAdd, setShowAdd]     = useState(false);
  const [newTitle, setNewTitle]   = useState('');
  const [newLoc, setNewLoc]       = useState('');
  const [newPri, setNewPri]       = useState<TaskPriority>('Medium');
  const [newDueDays, setNewDueDays] = useState<number>(0); // 0=Today, 1=Tomorrow, 3, 7

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';
  const inputBg       = isLight ? '#F9FAFB' : '#0C0A0E';

  const PRIORITY_STYLE = getPriorityStyle(isLight);
  const STATUS_STYLE   = getStatusStyle(isLight);

  const counts = {
    pending:     tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed:   tasks.filter((t) => t.status === 'completed').length,
  };

  const visible = tasks.filter((t) => t.status === tab);

  const TABS = [
    { key: 'pending'     as const, label: `Pending (${counts.pending})` },
    { key: 'in_progress' as const, label: `In Progress (${counts.in_progress})` },
    { key: 'completed'   as const, label: `Done (${counts.completed})` },
  ];

  const DUE_OPTIONS = [
    { label: 'Today', days: 0 },
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'In a week', days: 7 },
  ];

  function addTask() {
    if (!newTitle.trim()) { Alert.alert('Title required'); return; }
    const due = new Date();
    due.setDate(due.getDate() + newDueDays);
    const dateStr = `Due: ${due.getDate()} ${due.toLocaleString('en-IN', { month: 'short' })}`;
    setTasks((prev) => [...prev, {
      id: String(Date.now()), title: newTitle.trim(),
      location: newLoc.trim() || '—', date: dateStr,
      priority: newPri, status: 'pending', icon: 'clipboard',
    }]);
    setNewTitle(''); setNewLoc(''); setNewDueDays(0);
    setShowAdd(false);
    haptic('success');
  }

  function advanceTask(id: string) {
    haptic('selection');
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const next: TaskStatus = t.status === 'pending' ? 'in_progress'
        : t.status === 'in_progress' ? 'completed' : 'completed';
      return { ...t, status: next };
    }));
  }

  function deleteTask(id: string) {
    haptic('selection');
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
          Tasks — {route.params.workerName}
        </Text>
        <Pressable hitSlop={8} onPress={() => setShowAdd(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="plus" size={18} color={BLUE} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: BLUE }}>Add</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: surface,
        borderBottomWidth: 0.5, borderBottomColor: border }}>
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
        {visible.length === 0 && (
          <EmptyState
            illustration="calendar"
            tone="hero"
            title="No tasks here"
            message={tab === 'completed' ? 'Completed tasks will appear here.' : 'Assign a task to get started.'}
            cta={tab !== 'completed' ? { label: '+ Assign Task', onPress: () => setShowAdd(true) } : undefined}
          />
        )}

        {visible.map((task) => {
          const st = STATUS_STYLE[task.status];
          const pr = PRIORITY_STYLE[task.priority];
          return (
            <View key={task.id} style={{ backgroundColor: surface, borderRadius: radii.lg,
              borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.sm,
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
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
                {task.status !== 'completed' && (
                  <AnimatedPressable onPress={() => advanceTask(task.id)} hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                      backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F', marginLeft: 4 }}>
                    <Feather name={task.status === 'pending' ? 'play' : 'check'} size={11} color={BLUE} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE }}>
                      {task.status === 'pending' ? 'Start' : 'Done'}
                    </Text>
                  </AnimatedPressable>
                )}
                <AnimatedPressable onPress={() => deleteTask(task.id)} hitSlop={8} scaleValue={0.85}>
                  <Feather name="trash-2" size={14} color="#EF4444" />
                </AnimatedPressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <BlurOverlay>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setShowAdd(false)}>
          <View style={{ backgroundColor: surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary }}>Assign Task</Text>
              <Pressable hitSlop={12} onPress={() => setShowAdd(false)}>
                <Feather name="x" size={20} color={textSecondary} />
              </Pressable>
            </View>

            <TextInput
              value={newTitle} onChangeText={setNewTitle}
              placeholder="Task title *" placeholderTextColor={textSecondary}
              style={{ backgroundColor: inputBg, borderRadius: 10, borderWidth: 1, borderColor: border,
                padding: spacing.md, fontSize: 15, color: textPrimary }}
            />
            <TextInput
              value={newLoc} onChangeText={setNewLoc}
              placeholder="Location (optional)" placeholderTextColor={textSecondary}
              style={{ backgroundColor: inputBg, borderRadius: 10, borderWidth: 1, borderColor: border,
                padding: spacing.md, fontSize: 15, color: textPrimary }}
            />

            {/* Priority picker */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 8 }}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['High', 'Medium', 'Low'] as TaskPriority[]).map((p) => {
                  const active = newPri === p;
                  const sty = PRIORITY_STYLE[p];
                  return (
                    <AnimatedPressable key={p} onPress={() => setNewPri(p)} scaleValue={0.97}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
                        backgroundColor: active ? sty.bg : (isLight ? '#F3F4F6' : '#1E1E1E'),
                        borderWidth: active ? 1.5 : 1, borderColor: active ? sty.fg : border }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? sty.fg : textSecondary }}>{p}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>

            {/* Due date picker */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary, marginBottom: 8 }}>Due Date</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {DUE_OPTIONS.map(({ label, days }) => {
                  const active = newDueDays === days;
                  return (
                    <Pressable key={days}
                      onPress={() => { haptic('selection'); setNewDueDays(days); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        borderWidth: active ? 1.5 : 1,
                        borderColor: active ? BLUE : border,
                        backgroundColor: active ? (isLight ? '#EFF6FF' : '#1E3A5F') : 'transparent',
                      }}>
                      <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500',
                        color: active ? BLUE : textSecondary }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable onPress={addTask} style={({ pressed }) => ({
              backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 14,
              alignItems: 'center', opacity: pressed ? 0.85 : 1,
            })}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>Assign Task</Text>
            </Pressable>
          </View>
        </Pressable>
      </BlurOverlay>
      </Modal>
    </Screen>
  );
}
