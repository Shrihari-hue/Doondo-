/**
 * WorkTypeSelectScreen — "How do you want to work?"
 *
 * The second onboarding step. Multi-select, not single-select: a worker
 * can take on-demand jobs, regular employment, or both, and forcing an
 * either/or here would quietly hide half the marketplace from them.
 *
 * Short Term ships pre-selected (the product default). The only rule
 * enforced is that at least one stays on — see `setSelection` in
 * workType.store.ts, which no-ops an attempt to clear the last one.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { setSecure } from '@/lib/secureStore';
import { useWorkTypeStore } from '@/stores/workType.store';
import { SEEKER_GUTTER } from './layout';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function WorkTypeSelectScreen() {
  const navigation = useNavigation<Nav>();
  const storedShort = useWorkTypeStore((s) => s.shortTerm);
  const storedLong = useWorkTypeStore((s) => s.longTerm);
  const setSelection = useWorkTypeStore((s) => s.setSelection);

  // Local draft so tapping a card is instant and nothing is persisted
  // until Continue — backing out leaves the stored preference untouched.
  const [shortTerm, setShortTerm] = useState(storedShort);
  const [longTerm, setLongTerm] = useState(storedLong);

  useEffect(() => {
    setShortTerm(storedShort);
    setLongTerm(storedLong);
  }, [storedShort, storedLong]);

  function toggle(which: 'short' | 'long') {
    haptic('selection');
    if (which === 'short') {
      // Refuse to clear the last remaining selection rather than letting
      // the worker land on an empty Home and wonder what broke.
      if (shortTerm && !longTerm) return;
      setShortTerm(!shortTerm);
    } else {
      if (longTerm && !shortTerm) return;
      setLongTerm(!longTerm);
    }
  }

  async function onContinue() {
    await setSelection({ shortTerm, longTerm });
    await setSecure('seekerPrefsOnboarded', '1').catch(() => undefined);
    haptic('success');
    navigation.replace('SeekerTabs');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: SEEKER_GUTTER, gap: spacing.xs, paddingBottom: spacing.xl }}>
        <Text variant="titleLarge" weight="semibold">
          How do you want to work?
        </Text>
        <Text variant="body" tone="secondary">
          Select one or both. You can change this anytime from Home.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: SEEKER_GUTTER, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <WorkTypeCard
          icon="zap"
          title="Short Term"
          badge="Default"
          subtitle="One-time or immediate jobs. Work when you want."
          detail="Accept a nearby job in one tap, finish it, get paid."
          selected={shortTerm}
          onPress={() => toggle('short')}
        />
        <WorkTypeCard
          icon="calendar"
          title="Long Term"
          subtitle="Regular jobs with a fixed duration and salary."
          detail="Apply, get interviewed, and join as regular staff."
          selected={longTerm}
          onPress={() => toggle('long')}
        />
      </ScrollView>

      <View style={{ paddingHorizontal: SEEKER_GUTTER, paddingTop: spacing.lg }}>
        <Button label="Continue" onPress={() => void onContinue()} />
      </View>
    </Screen>
  );
}

interface CardProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  badge?: string;
  subtitle: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}

function WorkTypeCard({ icon, title, badge, subtitle, detail, selected, onPress }: CardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          borderRadius: radii.xl,
          borderWidth: selected ? 1.5 : 0.5,
          borderColor: selected ? theme.brand.primary : theme.border.default,
          backgroundColor: selected ? theme.brand.primarySubtle : theme.bg.surface,
          padding: spacing.lg,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.pill,
              backgroundColor: selected ? theme.bg.surface : theme.brand.primarySubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={icon} size={20} color={theme.brand.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="semibold">
                {title}
              </Text>
              {badge ? (
                <View
                  style={{
                    backgroundColor: theme.bg.muted,
                    borderRadius: radii.pill,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 2,
                  }}
                >
                  <Text variant="caption" tone="secondary">
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="footnote" tone="secondary">
              {subtitle}
            </Text>
          </View>
          <Feather
            name={selected ? 'check-circle' : 'circle'}
            size={22}
            color={selected ? theme.brand.primary : theme.text.tertiary}
          />
        </View>

        <Text variant="caption" tone="tertiary">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}
