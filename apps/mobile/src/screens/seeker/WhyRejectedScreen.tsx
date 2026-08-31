/**
 * WhyRejectedScreen — "Why was I rejected?"
 *
 * Opened from the inline skill-gap card on My Applications. Reframes a
 * rejection as a next step: a short plain-language paragraph explaining
 * the gap, the missing skills, a recommended course, and up to 4 other
 * jobs hiring right now that are a similar fit — so the moment ends on
 * "here's what's next", not a dead end.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { applicationsApi } from '@/api/applications.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WhyRejected'>;

const PERIOD_SHORT: Record<string, string> = {
  hour: '/hr',
  day: '/day',
  week: '/wk',
  month: '/mo',
  fixed: '',
};

function formatPay(pay: PublicJob['pay']): string {
  const base = `₹${Math.round(pay.amount / 100).toLocaleString('en-IN')}`;
  return `${base} ${PERIOD_SHORT[pay.period] ?? ''}`.trim();
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function humanize(slug: string): string {
  return slug.replace(/_/g, ' ').trim();
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { applicationId } = route.params;

  const query = useQuery({
    queryKey: ['applications', applicationId, 'skill-gap'],
    queryFn: () => applicationsApi.skillGap(applicationId),
    staleTime: 5 * 60_000,
  });
  const result = query.data;

  return (
    <Screen edges={[]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Text
          onPress={() => navigation.goBack()}
          style={{ fontSize: 22, color: theme.text.primary }}
          accessibilityRole="button"
          accessibilityLabel={t('why_rejected.back')}
        >
          ←
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('why_rejected.title')}
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.brand.accent} />
        </View>
      ) : query.isError || !result ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 14, color: theme.text.secondary, textAlign: 'center' }}>
            {friendlyErrorMessage(query.error, t('why_rejected.error'))}
          </Text>
          <Button
            label={t('why_rejected.retry')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.lg,
          }}
        >
          {/* The explanation paragraph */}
          {result.explanation ? (
            <View
              style={{
                backgroundColor: theme.brand.accentSubtle,
                borderRadius: 14,
                padding: spacing.lg,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.brand.accent }}>
                {t('why_rejected.explanation_label')}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 21, color: theme.text.primary }}>
                {result.explanation}
              </Text>
            </View>
          ) : null}

          {/* Missing skills */}
          {result.missingSkills.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
                {t('why_rejected.missing_label')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {result.missingSkills.map((skill) => (
                  <View
                    key={skill}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: theme.status.warningSubtle,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: theme.status.warning }}>
                      {humanize(skill)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Recommended course */}
          {result.recommendedCourse ? (
            <View
              style={{
                backgroundColor: theme.bg.surface,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                padding: spacing.lg,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text.tertiary }}>
                {t('why_rejected.course_label')}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
                {result.recommendedCourse.title}
              </Text>
              <Text style={{ fontSize: 13, color: theme.text.secondary }}>
                {result.recommendedCourse.tagline}
              </Text>
              <View style={{ marginTop: spacing.xs }}>
                <Button
                  label={t('why_rejected.course_cta')}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('CourseDetail', {
                      courseId: result.recommendedCourse!.id,
                    });
                  }}
                />
              </View>
            </View>
          ) : null}

          {/* Similar jobs hiring now */}
          {result.similarJobs.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
                {t('why_rejected.similar_label')}
              </Text>
              <View style={{ gap: spacing.sm }}>
                {result.similarJobs.map((job) => (
                  <Pressable
                    key={job.id}
                    accessibilityRole="button"
                    onPress={() => {
                      haptic('selection');
                      navigation.navigate('JobDetail', { jobId: job.id });
                    }}
                    style={({ pressed }) => ({
                      backgroundColor: theme.bg.surface,
                      borderRadius: 14,
                      borderWidth: 0.5,
                      borderColor: theme.border.subtle,
                      padding: spacing.lg,
                      gap: 4,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
                      numberOfLines={1}
                    >
                      {job.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.brand.accent }}>
                        {formatPay(job.pay)}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
                        {job.location.area ?? job.location.city} ·{' '}
                        {formatDistance(job.distanceMeters)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Button label={t('why_rejected.done')} variant="ghost" onPress={() => navigation.goBack()} />
        </ScrollView>
      )}
    </Screen>
  );
}

export function WhyRejectedScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
