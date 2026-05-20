/**
 * LeaveRatingScreen — picker for rating someone after a hire.
 *
 * Receives an `applicationId` via route params. The backend infers
 * direction (employer ↔ seeker) from auth, so the mobile just submits
 * { applicationId, score, comment }.
 *
 * No fake data — the rating is created via the real /ratings endpoint.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Button, FormError, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useCreateRating } from '@/hooks/useRatings';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { tagsForRole, type TagDescriptor } from '@/lib/reviewTagCatalog';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type RouteParams = RouteProp<AppStackParamList, 'LeaveRating'>;

function LeaveRatingScreenInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const { applicationId, revieweeName, jobTitle } = route.params;
  const t = useTranslate();
  const { user } = useAuth();

  const [score, setScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  // Default to TRUE when a seeker reviews an employer — the most common
  // case, and anonymity is the whole point of the trust pipeline. When an
  // employer is reviewing a seeker (where attribution helps the worker
  // build a reputation), we default to attributed.
  const reviewerRole = user?.role ?? 'seeker';
  const revieweeRole: 'employer' | 'seeker' =
    reviewerRole === 'seeker' ? 'employer' : 'seeker';
  const [anonymous, setAnonymous] = useState<boolean>(revieweeRole === 'employer');
  const [error, setError] = useState<string | null>(null);

  const catalog: ReadonlyArray<TagDescriptor> = useMemo(
    () => tagsForRole(revieweeRole),
    [revieweeRole],
  );

  const mutation = useCreateRating();

  const MAX_TAGS = 4;
  function toggleTag(slug: string) {
    haptic('selection');
    setTags((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug);
      if (cur.length >= MAX_TAGS) return cur;
      return [...cur, slug];
    });
  }

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
        tags: tags.length > 0 ? tags : undefined,
        anonymous: anonymous || undefined,
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

        {/* Structured tags — multi-select, capped at MAX_TAGS so the
            review stays focused on what mattered most. Positive and
            negative tags share the rail but render with different
            tones so the reviewer sees what each pick means. */}
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              WHAT STOOD OUT?
            </Text>
            <Text variant="caption" tone="tertiary">
              {tags.length}/{MAX_TAGS}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {catalog.map((tag) => {
              const active = tags.includes(tag.slug);
              const positive = tag.polarity === 'positive';
              const activeBg = positive
                ? theme.status.successSubtle
                : theme.status.warningSubtle;
              const activeBorder = positive
                ? theme.status.successBorder
                : theme.status.warningBorder;
              const activeColor = positive
                ? theme.status.success
                : theme.status.warning;
              const atLimit = !active && tags.length >= MAX_TAGS;
              return (
                <Pressable
                  key={tag.slug}
                  onPress={() => !atLimit && toggleTag(tag.slug)}
                  disabled={atLimit}
                  style={({ pressed }) => ({
                    paddingVertical: spacing.xs,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.pill,
                    borderWidth: 0.5,
                    borderColor: active ? activeBorder : theme.border.default,
                    backgroundColor: active ? activeBg : theme.bg.surface,
                    opacity: pressed || atLimit ? 0.5 : 1,
                  })}
                >
                  <Text
                    variant="footnote"
                    weight={active ? 'medium' : 'regular'}
                    style={{ color: active ? activeColor : theme.text.secondary }}
                  >
                    {t(`review_tags.${tag.slug}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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

        {/* Anonymous toggle — opt-in / opt-out depending on direction.
            Seeker→employer defaults to anonymous (protect the worker
            from retaliation). Employer→seeker defaults to attributed
            (a named good review helps the worker get hired again). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            backgroundColor: theme.bg.surface,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium">
              Post anonymously
            </Text>
            <Text variant="footnote" tone="secondary">
              {anonymous
                ? `Your name and photo won't appear. The review still counts toward ${revieweeName}'s public score.`
                : `Your name and photo will appear next to this review.`}
            </Text>
          </View>
          <Switch
            value={anonymous}
            onValueChange={(v) => {
              haptic('selection');
              setAnonymous(v);
            }}
            trackColor={{
              false: theme.border.default,
              true: theme.brand.hero,
            }}
            thumbColor="#FFFDF7"
          />
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
