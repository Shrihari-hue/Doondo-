/**
 * JobApplicantsScreen — modal for applicants of one job.
 *
 * Opened from the PostsScreen card tap. Same ApplicantCard as the
 * cross-job tab; this scoping is just a filter.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View, Switch } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState, Card } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi } from '@/api/applications.api';
import { ApplicantCard } from './ApplicantCard';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobApplicants'>;
type Route = RouteProp<AppStackParamList, 'JobApplicants'>;

export function JobApplicantsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const t = useTranslate();

  const [blind, setBlind] = useState(false);

  const query = useQuery({
    queryKey: ['applicants', 'job', route.params.jobId],
    queryFn: () => applicationsApi.listForJob(route.params.jobId, { limit: 100 }),
  });

  const applicants = query.data?.applications ?? [];
  const hasPending = applicants.some((a) => a.status === 'pending');
  const headcount = applicants[0]?.job?.headcount ?? 1;
  const hiredCount = applicants.filter((a) => a.status === 'hired').length;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            {t('employer.back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('employer.applicants.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display numberOfLines={2}>
            {route.params.jobTitle ?? t('employer.applicants.per_job_title')}
          </Text>
          {applicants.length > 0 && (
            <Text variant="footnote" tone="secondary">
              {t('employer.applicants.per_job_total', { n: applicants.length })}
            </Text>
          )}
          {headcount > 1 && (
            <Text
              variant="footnote"
              weight="medium"
              tone={hiredCount >= headcount ? 'success' : 'hero'}
            >
              {t('employer.applicants.fill', { hired: hiredCount, headcount })}
            </Text>
          )}
        </View>

        {query.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('employer.applicants.offline_eyebrow')}
            title={t('employer.applicants.offline_title')}
            message={t('employer.applicants.offline_message')}
            tall
          />
        ) : applicants.length === 0 ? (
          <EmptyState
            glyph="◔"
            tone="hero"
            eyebrow={t('employer.applicants.empty_waiting_eyebrow')}
            title={t('employer.applicants.empty_no_applicants_title')}
            message={t('employer.applicants.empty_no_applicants_per_job')}
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {hasPending && (
              <Card>
                <Pressable
                  onPress={() => setBlind((v) => !v)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: blind }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body" weight="medium">
                      {t('employer.blind_review.toggle_title')}
                    </Text>
                    <Text variant="footnote" tone="secondary">
                      {t('employer.blind_review.toggle_hint')}
                    </Text>
                  </View>
                  <Switch
                    value={blind}
                    onValueChange={setBlind}
                    trackColor={{ true: theme.brand.hero, false: theme.border.strong }}
                  />
                </Pressable>
              </Card>
            )}
            {(() => {
              let maskedSeq = 0;
              return applicants.map((a) => {
                const idx = a.status === 'pending' ? ++maskedSeq : undefined;
                return (
                  <ApplicantCard
                    key={a.id}
                    applicant={a}
                    blind={blind}
                    blindIndex={idx}
                  />
                );
              });
            })()}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
