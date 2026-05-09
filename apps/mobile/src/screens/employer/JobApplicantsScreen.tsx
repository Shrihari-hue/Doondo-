/**
 * JobApplicantsScreen — modal for applicants of one job.
 *
 * Opened from the PostsScreen card tap. Same ApplicantCard as the
 * cross-job tab; this scoping is just a filter.
 */

import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { ApplicantCard } from './ApplicantCard';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobApplicants'>;
type Route = RouteProp<AppStackParamList, 'JobApplicants'>;

export function JobApplicantsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();

  const query = useQuery({
    queryKey: ['applicants', 'job', route.params.jobId],
    queryFn: () => applicationsApi.listForJob(route.params.jobId, { limit: 100 }),
  });

  const applicants = query.data?.applications ?? [];

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
            ← Back
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            APPLICANTS
          </Text>
          <Text variant="display" weight="medium" display numberOfLines={2}>
            {route.params.jobTitle ?? 'Applicants'}
          </Text>
          {applicants.length > 0 && (
            <Text variant="footnote" tone="secondary">
              {applicants.length} total
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
            eyebrow="OFFLINE"
            title="Couldn't load applicants"
            message="Pull down to retry, or check your connection."
            tall
          />
        ) : applicants.length === 0 ? (
          <EmptyState
            glyph="◔"
            tone="hero"
            eyebrow="WAITING ROOM"
            title="No applicants yet"
            message="When someone applies, you'll see them here. Verified candidates show a champagne ring around their avatar."
            tall
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {applicants.map((a) => (
              <ApplicantCard key={a.id} applicant={a} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
