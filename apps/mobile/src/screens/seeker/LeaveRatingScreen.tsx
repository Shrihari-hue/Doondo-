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
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type RouteParams = RouteProp<AppStackParamList, 'LeaveRating'>;

function LeaveRatingScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { applicationId, revieweeName, jobTitle } = route.params;

  const [score, setScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateRating();

  function submit() {
    if (score < 1 || score > 5) {
      setError('Tap a star from 1 to 5');
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
          setError(err instanceof Error ? err.message : 'Could not save your rating');
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
            ← Cancel
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            LEAVE A RATING
          </Text>
          <Text variant="display" weight="medium" display>
            How was {revieweeName}?
          </Text>
          <Text variant="footnote" tone="secondary">
            For: {jobTitle}
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
                ? 'Tap a star'
                : score === 5
                  ? 'Excellent'
                  : score === 4
                    ? 'Very good'
                    : score === 3
                      ? 'Okay'
                      : score === 2
                        ? 'Below average'
                        : 'Poor'}
            </Text>
          </View>
        </Card>

        {/* Optional comment */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            ADD A NOTE (OPTIONAL)
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
              placeholder="What stood out? Anything others should know?"
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
              {comment.length} / 500
            </Text>
          </View>
        </View>

        <Button
          label={mutation.isPending ? 'Submitting…' : 'Submit rating'}
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
