/**
 * NotifPreferencesScreen — employer notification preference toggles.
 *
 * Four event categories:
 *   New Applicant · Interview Reminder · Worker Absent · Payroll Due
 *
 * Each persisted to secureStore ('notifPrefs') as a JSON map so they
 * survive app restarts. Expo push-notification scheduling is wired in
 * outline only (commented); the toggles are the UX deliverable here.
 *
 * Task 50.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { getSecure, setSecure } from '@/lib/secureStore';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB'; // = theme.brand.primary; module-scope constant, theme unreachable here
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const CORAL  = BLUE;

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
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  desc: string;
  color: string;
}> = [
  {
    key:   'newApplicant',
    icon:  'user-plus',
    label: 'New Applicant',
    desc:  'Get notified when someone applies to your job posting.',
    color: BLUE,
  },
  {
    key:   'interviewReminder',
    icon:  'calendar',
    label: 'Interview Reminder',
    desc:  'Reminder 1 hour before a scheduled interview.',
    color: CORAL,
  },
  {
    key:   'workerAbsent',
    icon:  'alert-triangle',
    label: 'Worker Absent',
    desc:  'Alert when a hired worker hasn\'t checked in for their shift.',
    color: AMBER,
  },
  {
    key:   'payrollDue',
    icon:  'dollar-sign',
    label: 'Payroll Due',
    desc:  'Monthly reminder to run payroll before the pay date.',
    color: GREEN,
  },
];

export function NotifPreferencesScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { theme, scheme } = useTheme();
  const isLight    = scheme !== 'dark';

  const surface       = theme.bg.surface;
  const border        = theme.border.default;
  const textPrimary   = theme.text.primary;
  const textSecondary = theme.text.secondary;
  const bg            = theme.bg.canvas;

  const [prefs, setPrefs]   = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSecure('notifPrefs')
      .then((raw) => {
        if (!raw) { setLoaded(true); return; }
        const map = JSON.parse(raw) as Record<string, unknown>;
        const saved = map[PREFS_KEY] as NotifPrefs | undefined;
        if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function toggle(key: PrefKey) {
    haptic('selection');
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const raw = await getSecure('notifPrefs');
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      map[PREFS_KEY] = next;
      await setSecure('notifPrefs', JSON.stringify(map));
    } catch {
      // best effort
    }
  }

  const allOn  = Object.values(prefs).every(Boolean);
  const allOff = Object.values(prefs).every((v) => !v);

  async function toggleAll() {
    haptic('selection');
    const next = { newApplicant: !allOn, interviewReminder: !allOn, workerAbsent: !allOn, payrollDue: !allOn };
    setPrefs(next);
    try {
      const raw = await getSecure('notifPrefs');
      const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      map[PREFS_KEY] = next;
      await setSecure('notifPrefs', JSON.stringify(map));
    } catch {
      // best effort
    }
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

      <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>

        {/* Info banner */}
        <View style={{
          backgroundColor: theme.brand.primarySubtle, borderRadius: radii.lg, borderWidth: 0.5, borderColor: theme.brand.primaryBorder,
          padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
        }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: BLUE + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="bell" size={15} color={BLUE} />
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: theme.brand.primary, lineHeight: 19 }}>
            Choose which events trigger a push notification. Changes take effect immediately.
          </Text>
        </View>

        {/* Preference items */}
        <View style={{
          backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, overflow: 'hidden',
          shadowColor: theme.text.primary, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
        }}>
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
                backgroundColor: prefs[item.key] ? item.color + '18' : (theme.bg.muted),
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Feather name={item.icon} size={19} color={prefs[item.key] ? item.color : textSecondary} />
              </View>

              {/* Text */}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: textPrimary }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: textSecondary, lineHeight: 17 }}>{item.desc}</Text>
              </View>

              {/* Toggle */}
              <Switch
                value={loaded ? prefs[item.key] : false}
                onValueChange={() => void toggle(item.key)}
                trackColor={{ false: border, true: blue[500] }}
                thumbColor={theme.text.onBrand}
                ios_backgroundColor={border}
              />
            </Pressable>
          ))}
        </View>

        {/* Status summary */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm }}>
          <Feather
            name={allOff ? 'bell-off' : 'bell'}
            size={13}
            color={textSecondary}
          />
          <Text style={{ fontSize: 13, color: textSecondary }}>
            {allOff
              ? 'All notifications muted'
              : allOn
                ? 'All notifications enabled'
                : `${Object.values(prefs).filter(Boolean).length} of ${PREF_ITEMS.length} notifications enabled`}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}
