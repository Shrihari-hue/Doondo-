/**
 * CareerPathScreen — the trade ladder.
 *
 * A blue-collar worker often can't see past the job in front of them.
 * This screen draws the climb: for a trade, the rungs from entry-level
 * to manager, each with the role, typical monthly pay, and the skills
 * that unlock it. The worker's current rung is inferred from their own
 * skills and marked "You're here"; the next rung is called out, with a
 * path into the Courses catalogue.
 *
 * Pure content — the ladders are static (`careerPathCatalog`), so there
 * is no backend call. The only dynamic part is matching the worker's
 * skills against each rung, done client-side.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { prettifySkill } from '@/lib/trades';
import {
  CAREER_PATHS,
  bestPathForSkills,
  currentStepIndex,
  type CareerPath,
  type CareerStep,
} from '@/lib/careerPathCatalog';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function CareerPathInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();
  const skills = user?.skills ?? [];

  // Open on the trade that best matches the worker's skills.
  const [pathId, setPathId] = useState<CareerPath['id']>(
    () => bestPathForSkills(skills).id,
  );
  const path = CAREER_PATHS.find((p) => p.id === pathId) ?? CAREER_PATHS[0]!;
  const currentIdx = currentStepIndex(path, skills);

  return (
    <Screen edges={[]}>
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('career_path.back')}
          >
            <Feather name="arrow-left" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', flex: 1 }}>
            {t('career_path.title')}
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.85)' }}>
          {t('career_path.tagline')}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
      >
        {/* Trade selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.sm }}
        >
          {CAREER_PATHS.map((p) => {
            const active = p.id === pathId;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  haptic('selection');
                  setPathId(p.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: active ? theme.brand.hero : theme.border.default,
                  backgroundColor: active ? theme.brand.heroSubtle : theme.bg.surface,
                }}
              >
                <Text style={{ fontSize: 15 }}>{p.emoji}</Text>
                <Text
                  variant="footnote"
                  weight={active ? 'medium' : 'regular'}
                  style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                >
                  {t(p.nameKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* The ladder — entry-level first, top to bottom */}
        <View style={{ gap: spacing.md }}>
          {path.steps.map((step, i) => (
            <StepCard
              key={step.titleKey}
              step={step}
              index={i}
              currentIdx={currentIdx}
              t={t}
            />
          ))}
        </View>

        <Button
          label={t('career_path.explore_courses')}
          variant="secondary"
          onPress={() => {
            haptic('selection');
            navigation.navigate('Courses');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

/** One rung of the ladder. */
function StepCard({
  step,
  index,
  currentIdx,
  t,
}: {
  step: CareerStep;
  index: number;
  currentIdx: number;
  t: TFn;
}) {
  const { theme } = useTheme();
  const reached = index <= currentIdx;
  const isCurrent = index === currentIdx;
  const isNext = index === currentIdx + 1;
  const isFuture = index > currentIdx;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        borderRadius: radii.lg,
        borderWidth: isCurrent ? 1 : 0.5,
        borderColor: isCurrent ? theme.brand.hero : theme.border.default,
        backgroundColor: isCurrent ? theme.brand.heroSubtle : theme.bg.surface,
        padding: spacing.md,
      }}
    >
      {/* Rung number */}
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: reached ? theme.brand.hero : theme.bg.muted,
          borderWidth: reached ? 0 : 0.5,
          borderColor: theme.border.default,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: reached ? '#FFFDF7' : theme.text.tertiary,
          }}
        >
          {index + 1}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
            {t(step.titleKey)}
          </Text>
          {isCurrent ? (
            <StepBadge label={t('career_path.you_are_here')} tone="current" />
          ) : isNext ? (
            <StepBadge label={t('career_path.next_up')} tone="next" />
          ) : null}
        </View>

        <Text variant="footnote" tone="secondary">
          {t(step.descKey)}
        </Text>

        <Text variant="footnote" weight="medium" style={{ color: theme.accent.amber }}>
          {formatPayRange(step.payMin, step.payMax)} {t('career_path.per_month')}
        </Text>

        {/* Skills that unlock a future rung */}
        {isFuture && step.skills.length > 0 ? (
          <View style={{ gap: 4, marginTop: 2 }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 0.6 }}>
              {t('career_path.unlocks')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {step.skills.map((s) => (
                <View
                  key={s}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 3,
                    borderRadius: radii.pill,
                    borderWidth: 0.5,
                    borderColor: theme.border.default,
                    backgroundColor: theme.bg.canvas,
                  }}
                >
                  <Text variant="caption" tone="secondary">
                    {prettifySkill(s)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "You're here" / "Next step" pill. */
function StepBadge({ label, tone }: { label: string; tone: 'current' | 'next' }) {
  const { theme } = useTheme();
  const isCurrent = tone === 'current';
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radii.pill,
        backgroundColor: isCurrent ? theme.brand.hero : theme.status.successSubtle,
      }}
    >
      <Text
        variant="caption"
        weight="medium"
        style={{ color: isCurrent ? '#FFFDF7' : theme.status.success }}
      >
        {label}
      </Text>
    </View>
  );
}

/** "₹12,000–18,000" with Indian digit grouping. */
function formatPayRange(min: number, max: number): string {
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  return `${fmt(min)}–${fmt(max)}`;
}

export function CareerPathScreen() {
  return (
    <SeekerThemeOverride>
      <CareerPathInner />
    </SeekerThemeOverride>
  );
}
