/**
 * DoondoPulse — the worker's momentum card on the Home dashboard.
 *
 * The Home feed answers "what work is out there?". Pulse answers the
 * other half — "where do I stand, and what's my next move?". One glance
 * tells a returning worker whether they're building momentum.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  YOUR PULSE                               │
 *   │   72        🔥 5         3                │  three stat tiles
 *   │  Doondo    Day streak   In play           │
 *   │ ──────────────────────────────────────────│
 *   │  Verify your account — 3x …     Let's go →│  next-step nudge
 *   └──────────────────────────────────────────┘
 *
 * The nudge row is the only interactive part — it routes to whatever
 * the server decided is the worker's single most useful next step.
 *
 * Self-hiding: before the first load resolves, or if the request
 * fails, the card renders nothing. The Home screen stays clean rather
 * than showing a broken or empty shell.
 */

import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { usePulse } from '@/hooks/usePulse';
import type { PulseNudgeAction } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function DoondoPulse() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const query = usePulse();

  const pulse = query.data;
  // Self-hide before the first load resolves or on error — never show
  // a broken shell on the Home screen.
  if (!pulse) return null;

  function routeNudge(action: PulseNudgeAction) {
    haptic('selection');
    switch (action) {
      case 'verify':
        navigation.navigate('Verification');
        return;
      case 'build_profile':
        navigation.navigate('ResumeBuilder');
        return;
      case 'add_skills':
      case 'set_availability':
        // Skills + availability are both managed on the Profile tab.
        navigation.navigate('SeekerTabs', { screen: 'Profile' } as never);
        return;
      case 'explore_jobs':
      default:
        navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never);
        return;
    }
  }

  // Fire emoji only when there's a live streak — a "🔥 0" reads sadder
  // than a plain 0.
  const streakValue =
    pulse.applyStreak > 0 ? `🔥 ${pulse.applyStreak}` : String(pulse.applyStreak);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="caption"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.2 }}
      >
        {t('pulse.title')}
      </Text>

      <View
        style={{
          borderRadius: radii.lg,
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          overflow: 'hidden',
        }}
      >
        {/* Stat tiles */}
        <View style={{ flexDirection: 'row', padding: spacing.md }}>
          <StatTile value={String(pulse.score)} label={t('pulse.score_label')} />
          <TileDivider />
          <StatTile value={streakValue} label={t('pulse.streak_label')} />
          <TileDivider />
          <StatTile
            value={String(pulse.activeApplications)}
            label={t('pulse.applications_label')}
          />
        </View>

        {/* Next-step nudge — the one interactive row */}
        <Pressable
          onPress={() => routeNudge(pulse.nudge.action)}
          accessibilityRole="button"
          accessibilityLabel={t(pulse.nudge.key)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderTopWidth: 0.5,
            borderTopColor: theme.border.default,
            backgroundColor: pressed ? theme.bg.muted : theme.brand.heroSubtle,
          })}
        >
          <Text
            variant="footnote"
            style={{ flex: 1, color: theme.text.primary }}
          >
            {t(pulse.nudge.key)}
          </Text>
          <Text
            variant="footnote"
            weight="medium"
            style={{ color: theme.brand.hero }}
          >
            {t('pulse.nudge_cta')} →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One stat: a big number above a small caption. */
function StatTile({ value, label }: { value: string; label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text
        style={{
          fontSize: 24,
          lineHeight: 28,
          fontWeight: '700',
          color: theme.text.primary,
        }}
      >
        {value}
      </Text>
      <Text
        variant="caption"
        tone="tertiary"
        numberOfLines={1}
        style={{ textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Hairline vertical rule between stat tiles. */
function TileDivider() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 0.5,
        alignSelf: 'stretch',
        marginVertical: 2,
        backgroundColor: theme.border.default,
      }}
    />
  );
}
