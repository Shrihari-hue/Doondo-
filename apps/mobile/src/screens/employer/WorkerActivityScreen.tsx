/**
 * WorkerActivityScreen — chronological activity timeline.
 * Matches reference: Today/Yesterday sections, timeline dots,
 * event types: Check In, Task Completed, Photo Uploaded, Check Out.
 */

import { Pressable, ScrollView, View, Image } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerActivity'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';

type EventType = 'check_in' | 'task_completed' | 'photo_uploaded' | 'check_out';

interface ActivityEvent {
  time: string; type: EventType; title: string; subtitle?: string;
  photos?: string[]; complete?: boolean;
}

const TODAY_EVENTS: ActivityEvent[] = [
  { time: '9:02 AM',  type: 'check_in',        title: 'Checked In',         subtitle: 'Koramangala Site', complete: true },
  { time: '12:47 PM', type: 'task_completed',   title: 'Task Completed',     subtitle: 'Fixed electrical wiring in Office', complete: true },
  { time: '1:10 PM',  type: 'photo_uploaded',   title: 'Photo Uploaded',     photos: ['a','b','c'] },
  { time: '6:02 PM',  type: 'check_out',        title: 'Checked Out',        subtitle: 'Total Working Hours: 8h 59m', complete: false },
];

const YESTERDAY_EVENTS: ActivityEvent[] = [
  { time: '9:01 AM',  type: 'check_in',        title: 'Checked In',         subtitle: 'Koramangala Site', complete: true },
  { time: '11:30 AM', type: 'task_completed',   title: 'Task Completed',     subtitle: 'Installed MCB in main board', complete: true },
  { time: '5:58 PM',  type: 'check_out',        title: 'Checked Out',        subtitle: 'Total Working Hours: 8h 57m', complete: true },
];

const EVENT_COLOR: Record<EventType, string> = {
  check_in:       GREEN,
  task_completed: BLUE,
  photo_uploaded: '#8B5CF6',
  check_out:      '#9CA3AF',
};

const EVENT_ICON: Record<EventType, React.ComponentProps<typeof Feather>['name']> = {
  check_in:       'log-in',
  task_completed: 'check-circle',
  photo_uploaded: 'camera',
  check_out:      'log-out',
};

export function WorkerActivityScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';

  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg = isLight ? '#F9FAFB' : '#0C0A0E';

  function Section({ title, events }: { title: string; events: ActivityEvent[] }) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>{title}</Text>
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md }}>
          {events.map((ev, i) => {
            const color = EVENT_COLOR[ev.type];
            return (
              <View key={i} style={{ flexDirection: 'row', gap: spacing.md,
                paddingBottom: i < events.length - 1 ? spacing.md : 0 }}>
                {/* Timeline line + dot */}
                <View style={{ alignItems: 'center', width: 20 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10,
                    backgroundColor: ev.complete === false ? 'transparent' : color,
                    borderWidth: ev.complete === false ? 2 : 0, borderColor: '#D1D5DB',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {ev.complete !== false && <Feather name="check" size={11} color="#FFFFFF" />}
                  </View>
                  {i < events.length - 1 && (
                    <View style={{ width: 2, flex: 1, backgroundColor: border, marginTop: 4 }} />
                  )}
                </View>
                {/* Content */}
                <View style={{ flex: 1, paddingBottom: i < events.length - 1 ? spacing.sm : 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{ev.title}</Text>
                    <Text style={{ fontSize: 12, color: textSecondary }}>{ev.time}</Text>
                  </View>
                  {ev.subtitle && (
                    <Text style={{ fontSize: 13, color: textSecondary }}>{ev.subtitle}</Text>
                  )}
                  {ev.photos && (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                      {ev.photos.map((_, pi) => (
                        <View key={pi} style={{ width: 72, height: 72, borderRadius: 8,
                          backgroundColor: isLight ? '#E5E7EB' : '#2A2A2A' }} />
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

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
        <Section title="Today" events={TODAY_EVENTS} />
        <Section title="Yesterday" events={YESTERDAY_EVENTS} />
      </ScrollView>
    </Screen>
  );
}
