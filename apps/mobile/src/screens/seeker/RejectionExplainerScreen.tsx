/**
 * RejectionExplainerScreen — "Why wasn't I picked?"
 *
 * A short, kind explanation built only from facts we hold (missing skills,
 * how many applied, whether the job filled), then concrete next steps:
 * a course, profile fixes, and similar open jobs to apply to right now.
 */
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, LoadingSpinner, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { prettifySkill } from '@/lib/trades';
import { rejectionExplainerApi } from '@/api/rejectionExplainer.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'RejectionExplainer'>;

export function RejectionExplainerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();

  const query = useQuery({
    queryKey: ['rejection-explainer', route.params.applicationId],
    queryFn: () => rejectionExplainerApi.get(route.params.applicationId),
    staleTime: 60 * 60 * 1000,
  });
  const x = query.data;

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="semibold">{t('why_rejected.title')}</Text>
            {x ? <Text variant="footnote" tone="secondary" numberOfLines={1}>{x.jobTitle}</Text> : null}
          </View>
        </View>

        {query.isLoading ? (
          <LoadingSpinner />
        ) : query.isError || !x ? (
          <ErrorPanel error={query.error} title={t('why_rejected.error')} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <Card>
              <Text variant="body" style={{ lineHeight: 22 }}>{x.explanation}</Text>
            </Card>

            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {x.facts.applicantsCount > 0 && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: theme.bg.muted }}>
                  <Text variant="caption" tone="secondary">{t('why_rejected.applicants', { n: x.facts.applicantsCount })}</Text>
                </View>
              )}
              {x.facts.missingSkills.slice(0, 3).map((sk) => (
                <View key={sk} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: theme.status.warningSubtle }}>
                  <Text variant="caption" tone="warning">{t('why_rejected.missing', { skill: prettifySkill(sk) })}</Text>
                </View>
              ))}
            </View>

            <Text variant="footnote" tone="secondary" weight="semibold">{t('why_rejected.next_steps')}</Text>
            {x.nextSteps.map((step, i) => (
              <Pressable
                key={`${step.kind}-${i}`}
                onPress={() => {
                  haptic('selection');
                  if (step.kind === 'course' && step.courseId) navigation.navigate('CourseDetail', { courseId: step.courseId });
                  else if (step.kind === 'job' && step.jobId) navigation.navigate('JobDetail', { jobId: step.jobId });
                  else if (step.label.toLowerCase().includes('verify')) navigation.navigate('Verification');
                  else navigation.navigate('EditProfile', { section: 'basics' });
                }}
              >
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Text style={{ fontSize: 20 }}>{step.kind === 'course' ? '📘' : step.kind === 'job' ? '💼' : '✍️'}</Text>
                    <Text variant="body" weight="medium" style={{ flex: 1 }}>{step.label}</Text>
                    <Text style={{ color: theme.text.tertiary, fontSize: 20 }}>›</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
            {x.source === 'ai' && (
              <Text variant="caption" tone="tertiary">{t('why_rejected.ai_note')}</Text>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
