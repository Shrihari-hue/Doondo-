/**
 * LeaveRatingScreen — picker for rating someone after a hire.
 *
 * Receives an `applicationId` via route params. The backend infers
 * direction (employer ↔ seeker) from auth, so the mobile just submits
 * { applicationId, score, comment }.
 *
 * No fake data — the rating is created via the real /ratings endpoint.
 */

import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, FormError, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useCreateRating } from '@/hooks/useRatings';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type RouteParams = RouteProp<AppStackParamList, 'LeaveRating'>;

function LeaveRatingScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { applicationId, revieweeName, jobTitle } = route.params;
  const t = useTranslate();

  const [score, setScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateRating();

  function submit() {
    if (score < 1 || score > 5) {
      setError(t('leave_rating.error_tap_one_to_five'));
      return;
    }
    setError(null);
    haptic('selection');
    mutation.mutate(
      {
        applicationId,
        score,
        comment: comment.trim() || undefined,
      },
      {
        onSuccess: () => {
          haptic('success');
          navigation.goBack();
        },
        onError: (err) => {
          haptic('error');
          setError(err instanceof Error ? err.message : t('leave_rating.error_default'));
        },
      },
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="body" tone="secondary">
            {t('leave_rating.cancel_back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('leave_rating.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('leave_rating.title_named', { name: revieweeName })}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('leave_rating.for_job', { job: jobTitle })}
          </Text>
        </View>

        <FormError message={error} />

        {/* Star picker */}
        <Card>
          <View style={{ gap: spacing.md, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = n <= score;
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      haptic('selection');
                      setScore(n);
                    }}
                    hitSlop={6}
                  >
                    <Text
                      style={{
                        fontSize: 44,
                        lineHeight: 50,
                        color: active ? theme.accent.amber : theme.text.disabled,
                      }}
                    >
                      {active ? '★' : '☆'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="footnote" tone="secondary">
              {score === 0
                ? t('leave_rating.tap_a_star')
                : score === 5
                  ? t('leave_rating.score.excellent')
                  : score === 4
                    ? t('leave_rating.score.very_good')
                    : score === 3
                      ? t('leave_rating.score.okay')
                      : score === 2
                        ? t('leave_rating.score.below_avg')
                        : t('leave_rating.score.poor')}
            </Text>
          </View>
        </Card>

        {/* Optional comment */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('leave_rating.note_label')}
          </Text>
          <View
            style={{
              padding: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.surface,
            }}
          >
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder={t('leave_rating.note_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              multiline
              numberOfLines={4}
              style={{
                fontSize: 16,
                lineHeight: 22,
                color: theme.text.primary,
                minHeight: 80,
              }}
              maxLength={500}
            />
            <Text variant="caption" tone="tertiary" style={{ textAlign: 'right', marginTop: 4 }}>
              {t('leave_rating.char_count', { n: comment.length })}
            </Text>
          </View>
        </View>

        <Button
          label={mutation.isPending ? t('leave_rating.submitting') : t('leave_rating.submit')}
          onPress={submit}
          disabled={mutation.isPending || score === 0}
        />
      </ScrollView>
    </Screen>
  );
}

export function LeaveRatingScreen() {
  return (
    <SeekerThemeOverride>
      <LeaveRatingScreenInner />
    </SeekerThemeOverride>
  );
}
