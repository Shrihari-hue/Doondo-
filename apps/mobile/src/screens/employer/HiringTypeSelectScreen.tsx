/**
 * HiringTypeSelectScreen — the fork in front of the two employer hiring
 * flows. Doondo has two genuinely different products behind one "+":
 *
 *   ⚡ Short Job     → the existing Quick Work wizard (QuickWorkCreate),
 *                     which runs the POSTED → MATCHING → OFFERED → ... →
 *                     RATED lifecycle and ends at a matched worker.
 *   📅 Long-Term Job → the existing Post a Job form (PostJob), which ends
 *                     at an applicant pipeline.
 *
 * This screen does nothing but choose. It owns no form state, posts
 * nothing, and neither flow is modified by its existence — it is purely a
 * router placed in front of two screens that already work.
 *
 * It `replace()`s itself rather than pushing, deliberately: both
 * destinations already call `navigation.goBack()` when they finish
 * (PostJobScreen on publish, QuickWorkCreateScreen's back-out at step 1),
 * and pushing would leave this chooser underneath them so "done" would
 * land the employer back on the fork instead of dismissing. Replacing
 * keeps both flows' existing exit behaviour byte-for-byte identical to
 * what it was when they were reached directly.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function HiringTypeSelectScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  function choose(kind: 'short' | 'long') {
    haptic('selection');
    if (kind === 'short') navigation.replace('QuickWorkCreate');
    else navigation.replace('PostJob');
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.lg,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={22} color={theme.text.primary} />
        </Pressable>
        <Text variant="bodyLarge" weight="semibold" style={{ flex: 1 }}>
          What are you hiring for?
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['3xl'],
          gap: spacing.lg,
        }}
      >
        <Text variant="footnote" tone="secondary">
          Pick the one that matches what you need. You can always post the other kind later.
        </Text>

        <HiringOption
          icon="zap"
          accent={theme.brand.primary}
          accentSubtle={theme.brand.primarySubtle}
          title="Short Job"
          subtitle="Get a task done now or schedule it"
          examples={['Fix my AC today', 'Repair my plumbing tomorrow', 'Paint my house this weekend']}
          footnote="We find a nearby worker for you — no applications to review."
          onPress={() => choose('short')}
        />

        <HiringOption
          icon="calendar"
          accent={theme.accent.voice}
          accentSubtle={theme.status.warningSubtle}
          title="Long-Term Job"
          subtitle="Hire someone for an ongoing job, shift or project"
          examples={['Electrician for my company', 'Driver for 6 months', 'Cook for a restaurant']}
          footnote="Workers apply, you shortlist and hire from the applicants."
          onPress={() => choose('long')}
        />
      </ScrollView>
    </Screen>
  );
}

interface OptionProps {
  icon: React.ComponentProps<typeof Feather>['name'];
  accent: string;
  accentSubtle: string;
  title: string;
  subtitle: string;
  examples: string[];
  footnote: string;
  onPress: () => void;
}

function HiringOption({
  icon,
  accent,
  accentSubtle,
  title,
  subtitle,
  examples,
  footnote,
  onPress,
}: OptionProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radii.pill,
              backgroundColor: accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={icon} size={22} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="semibold">
              {title}
            </Text>
            <Text variant="footnote" tone="secondary">
              {subtitle}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={theme.text.tertiary} />
        </View>

        <View style={{ height: 0.5, backgroundColor: theme.border.subtle }} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {examples.map((ex) => (
            <View
              key={ex}
              style={{
                backgroundColor: theme.bg.muted,
                borderRadius: radii.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs + 2,
              }}
            >
              <Text variant="caption" tone="secondary">
                “{ex}”
              </Text>
            </View>
          ))}
        </View>

        <Text variant="caption" tone="tertiary">
          {footnote}
        </Text>
      </Card>
    </Pressable>
  );
}
