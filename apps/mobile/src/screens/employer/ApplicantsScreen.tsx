/**
 * ApplicantsScreen — cross-job applicants tab.
 *
 * Aggregates applicants across all of the employer's jobs. Status chips
 * filter the list. Each card shows which job the applicant applied to.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { ApplicationStatus } from '@/api/types';
import { ApplicantCard } from './ApplicantCard';

const STATUS_FILTERS: Array<{ key: ApplicationStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'New' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'hired', label: 'Hired' },
];

export function ApplicantsScreen() {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');

  const query = useQuery({
    queryKey: ['applicants', 'employer', filter],
    queryFn: () =>
      applicationsApi.listForEmployer(filter !== 'all' ? { status: filter } : {}),
  });

  const applicants = query.data?.applications ?? [];

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
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
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            APPLICANTS
          </Text>
          <Text variant="display" weight="medium" display>
            People who want this.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  haptic('selection');
                  setFilter(f.key);
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.pill,
                  borderWidth: 0.5,
                  borderColor: active ? theme.brand.hero : theme.border.default,
                  backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                }}
              >
                <Text
                  variant="footnote"
                  weight={active ? 'medium' : 'regular'}
                  style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
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
            eyebrow="OFFLINE"
            title="Couldn't load applicants"
            message="Pull down to retry, or check your connection."
            tall
          />
        ) : applicants.length === 0 ? (
          <EmptyState
            glyph="◔"
            tone="hero"
            eyebrow={filter === 'all' ? 'WAITING ROOM' : 'EMPTY FILTER'}
            title={
              filter === 'all'
                ? 'No applicants yet'
                : `No applicants in “${filter}”`
            }
            message={
              filter === 'all'
                ? 'Once someone applies to one of your jobs, they\'ll show up here.'
                : 'Try a different filter, or wait for new applications.'
            }
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {applicants.map((a) => (
              <ApplicantCard key={a.id} applicant={a} showJobTitle />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
