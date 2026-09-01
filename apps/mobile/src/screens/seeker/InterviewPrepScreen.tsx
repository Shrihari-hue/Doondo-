/**
 * InterviewPrepScreen — short, dignifying prep for an upcoming interview
 * or trial day.
 *
 * Defaults to the guide matching the seeker's primary skill, but a
 * horizontal trade picker at the top lets them browse any guide. The
 * three sections (questions / what to bring / negotiation) are rendered
 * as numbered cards so the worker can glance once and remember.
 *
 * Linked from JobDetail (sticky "Prep tips" pill near the apply CTA)
 * and from Profile (menu row "Interview prep"). Pure static content
 * — no backend call required.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { allPrepGuides, findPrepGuide, type PrepGuide } from '@/lib/interviewPrep';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAccessibility } from '@/lib/accessibility';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function Inner() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const access = useAccessibility();
  const t = useTranslate();

  const guides = useMemo(() => allPrepGuides(), []);
  const initial = useMemo(
    () => findPrepGuide(user?.skills ?? []),
    [user?.skills],
  );
  const [active, setActive] = useState<PrepGuide>(initial);

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing['5xl'],
          gap: spacing.lg,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22 * access.textScale,
                fontWeight: '700',
                color: theme.text.primary,
              }}
            >
              {t('interview_prep.title')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
              {t('interview_prep.subtitle')}
            </Text>
          </View>
        </View>

        {/* Trade picker */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            gap: spacing.xs,
          }}
        >
          {guides.map((g) => {
            const on = g.trade === active.trade;
            return (
              <Pressable
                key={g.trade}
                onPress={() => {
                  haptic('selection');
                  setActive(g);
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: on ? theme.brand.primary : theme.border.default,
                  backgroundColor: on ? theme.brand.primarySubtle : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 14 }}>{g.emoji}</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: on ? '600' : '400',
                    color: on ? theme.brand.primary : theme.text.secondary,
                  }}
                >
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sections */}
        <Section
          title={t('interview_prep.section_questions')}
          icon="❓"
          items={active.questions}
          onSpeak={(text) => access.speak(text)}
        />
        <Section
          title={t('interview_prep.section_bring')}
          icon="🎒"
          items={active.bring}
          onSpeak={(text) => access.speak(text)}
        />
        <Section
          title={t('interview_prep.section_negotiation')}
          icon="💬"
          items={active.negotiation}
          onSpeak={(text) => access.speak(text)}
        />

        <View
          style={{
            marginHorizontal: spacing.xl,
            padding: spacing.md,
            borderRadius: 12,
            borderWidth: 0.5,
            borderColor: theme.border.subtle,
            backgroundColor: theme.bg.surface,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.text.tertiary, lineHeight: 18 }}>
            {t('interview_prep.footer_tip')}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  icon,
  items,
  onSpeak,
}: {
  title: string;
  icon: string;
  items: string[];
  onSpeak: (t: string) => void;
}) {
  const { theme } = useTheme();
  const access = useAccessibility();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xl }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.6,
          color: theme.text.tertiary,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: 16,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          overflow: 'hidden',
        }}
      >
        {items.map((item, i) => (
          <Pressable
            key={i}
            onPress={() => {
              haptic('selection');
              onSpeak(item);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderBottomWidth: i < items.length - 1 ? 0.5 : 0,
              borderBottomColor: theme.border.subtle,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: theme.brand.primarySubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.brand.primary }}>
                {i + 1}
              </Text>
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 14 * access.textScale,
                lineHeight: 20 * access.textScale,
                color: theme.text.primary,
              }}
            >
              {item}
            </Text>
            <Text style={{ fontSize: 14 }}>{icon}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function InterviewPrepScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
