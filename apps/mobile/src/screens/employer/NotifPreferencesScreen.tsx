/**
 * NotifPreferencesScreen — employer notification preference toggles.
 *
 * Four event categories:
 *   New Applicant · Interview Reminder · Worker Absent · Payroll Due
 *
 * Saved on the server (/me/notification-prefs) — the backend push gate
 * checks them before every send. Older builds kept these on the device
 * under the 'notifPrefs' secure-store key; we migrate that once.
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationPrefsApi, DEFAULT_PREFS as SERVER_DEFAULTS, type NotificationPrefs } from '@/api/notificationPrefs.api';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { getSecure, setSecure } from '@/lib/secureStore';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE  = '#2563EB';

// Storage key inside 'notifPrefs' — we piggyback the same secureStore key
// used by WorkerPerformanceScreen for different sub-keys in the same JSON map.
const PREFS_KEY = '__notif_employer__';

interface NotifPrefs {
  newApplicant:      boolean;
  interviewReminder: boolean;
  workerAbsent:      boolean;
  payrollDue:        boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  newApplicant:      true,
  interviewReminder: true,
  workerAbsent:      true,
  payrollDue:        true,
};

type PrefKey = keyof NotifPrefs;

const PREF_ITEMS: Array<{
  key: PrefKey;
  icon: string;
  label: string;
  desc: string;
  color: string;
}> = [
  {
    key:   'newApplicant',
    icon:  '👤',
    label: 'New Applicant',
    desc:  'Get notified when someone applies to your job posting.',
    color: BLUE,
  },
  {
    key:   'interviewReminder',
    icon:  '📅',
    label: 'Interview Reminder',
    desc:  'Reminder 1 hour before a scheduled interview.',
    color: '#7C3AED',
  },
  {
    key:   'workerAbsent',
    icon:  '⚠️',
    label: 'Worker Absent',
    desc:  'Alert when a hired worker hasn\'t checked in for their shift.',
    color: '#F59E0B',
  },
  {
    key:   'payrollDue',
    icon:  '₹',
    label: 'Payroll Due',
    desc:  'Monthly reminder to run payroll before the pay date.',
    color: '#16A34A',
  },
];

export function NotifPreferencesScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight    = scheme !== 'dark';

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['notification-prefs'], queryFn: () => notificationPrefsApi.get() });
  const server: NotificationPrefs = query.data?.prefs ?? SERVER_DEFAULTS;
  const prefs: NotifPrefs = {
    newApplicant: server.newApplicant,
    interviewReminder: server.interviewReminder,
    workerAbsent: server.workerAbsent,
    payrollDue: server.payrollDue,
  };
  const saveMut = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => notificationPrefsApi.save(patch),
    onMutate: (patch) => {
      queryClient.setQueryData(['notification-prefs'], (old: { prefs: NotificationPrefs } | undefined) => ({
        prefs: { ...(old?.prefs ?? SERVER_DEFAULTS), ...patch },
      }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notification-prefs'] }),
  });

  // One-time migration of toggles saved on-device by older builds.
  useEffect(() => {
    getSecure('notifPrefs')
      .then(async (raw) => {
        if (!raw) return;
        const map = JSON.parse(raw) as Record<string, unknown>;
        const saved = map[PREFS_KEY] as Partial<NotifPrefs> | undefined;
        if (!saved) return;
        await notificationPrefsApi.save({ ...DEFAULT_PREFS, ...saved });
        delete map[PREFS_KEY];
        await setSecure('notifPrefs', JSON.stringify(map));
        void queryClient.invalidateQueries({ queryKey: ['notification-prefs'] });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: PrefKey) {
    haptic('selection');
    saveMut.mutate({ [key]: !prefs[key] });
  }

  const allOn  = Object.values(prefs).every(Boolean);
  const allOff = Object.values(prefs).every((v) => !v);

  function toggleAll() {
    haptic('selection');
    saveMut.mutate({ newApplicant: !allOn, interviewReminder: !allOn, workerAbsent: !allOn, payrollDue: !allOn });
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
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Notification Preferences</Text>
        <Pressable hitSlop={12} onPress={() => void toggleAll()}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>{allOn ? 'Mute all' : 'Enable all'}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: insets.bottom + 32 }}>

        {/* Info banner */}
        <View style={{
          backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F', borderRadius: radii.lg, borderWidth: 0.5, borderColor: isLight ? '#BFDBFE' : '#1E3A5F',
          padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
        }}>
          <Text style={{ fontSize: 18 }}>🔔</Text>
          <Text style={{ flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 19 }}>
            Choose which events trigger a push notification. Changes take effect immediately.
          </Text>
        </View>

        {/* Preference items */}
        <View style={{ backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          {PREF_ITEMS.map((item, i) => (
            <Pressable
              key={item.key}
              onPress={() => void toggle(item.key)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                padding: spacing.md,
                borderBottomWidth: i < PREF_ITEMS.length - 1 ? 1 : 0,
                borderBottomColor: border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {/* Icon */}
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: prefs[item.key] ? item.color + '18' : (isLight ? '#F3F4F6' : '#111111'),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 20 }}>{item.icon}</Text>
              </View>

              {/* Text */}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: textSecondary, lineHeight: 17 }}>{item.desc}</Text>
              </View>

              {/* Toggle */}
              <Switch
                value={query.isSuccess ? prefs[item.key] : false}
                onValueChange={() => void toggle(item.key)}
                trackColor={{ false: '#D1D5DB', true: item.color + '80' }}
                thumbColor={prefs[item.key] ? item.color : '#9CA3AF'}
                ios_backgroundColor="#D1D5DB"
              />
            </Pressable>
          ))}
        </View>

        {/* Status summary */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
          <Text style={{ fontSize: 13, color: textSecondary }}>
            {allOff
              ? '🔕 All notifications muted'
              : allOn
                ? '🔔 All notifications enabled'
                : `🔔 ${Object.values(prefs).filter(Boolean).length} of ${PREF_ITEMS.length} notifications enabled`}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}
