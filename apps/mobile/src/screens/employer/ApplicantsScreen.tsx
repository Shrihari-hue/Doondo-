/**
 * ApplicantsScreen — cross-job applicants tab.
 *
 * Aggregates applicants across all of the employer's jobs. Status chips
 * filter the list. Each card shows which job the applicant applied to.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords } from '@/lib/location';
import { availabilityApi } from '@/api/availability.api';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { ApplicantCard } from './ApplicantCard';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const STATUS_FILTERS: Array<{ key: ApplicationStatus | 'all'; labelKey: string }> = [
  { key: 'all', labelKey: 'employer.applicants.filter_all' },
  { key: 'pending', labelKey: 'employer.applicants.filter_pending' },
  { key: 'viewed', labelKey: 'employer.applicants.filter_viewed' },
  { key: 'shortlisted', labelKey: 'employer.applicants.filter_shortlisted' },
  { key: 'hired', labelKey: 'employer.applicants.filter_hired' },
];

export function ApplicantsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');

  const query = useQuery({
    queryKey: ['applicants', 'employer', filter],
    queryFn: () =>
      applicationsApi.listForEmployer(filter !== 'all' ? { status: filter } : {}),
  });

  // Lightweight count for the "Available right now" banner. We don't
  // need coordinates here — the banner just teases the feature; the
  // full list runs its own location-aware query inside the dedicated
  // screen. Refetches every 30s to keep the count fresh.
  const availabilityCount = useQuery({
    queryKey: ['availabilities', 'count', 'employer'],
    queryFn: async () => {
      const coords = await getCurrentCoords().catch(() => null);
      if (!coords) return { count: 0 };
      const result = await availabilityApi.nearby({
        lat: coords.lat,
        lng: coords.lng,
        radius: 15_000,
        limit: 1,
      });
      // The list endpoint caps at `limit` rows. Treat anything >= 1 as
      // "some workers available"; the dedicated screen shows the full set.
      return { count: result.availabilities.length };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const hasAvailableWorkers = (availabilityCount.data?.count ?? 0) > 0;

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
            {t('employer.applicants.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('employer.applicants.title')}
          </Text>
        </View>

        {/* Available-right-now teaser — only renders when at least one
           worker is broadcasting nearby. Solid green/blue card with a
           pulse to draw attention without nagging when nobody's around. */}
        <Pressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('AvailableWorkers');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('employer.applicants.available_now_a11y')}
          style={({ pressed }) => ({
            padding: spacing.md,
            borderRadius: radii.lg,
            backgroundColor: hasAvailableWorkers ? '#D1FAE5' : '#EFF6FF',
            borderWidth: 0.5,
            borderColor: hasAvailableWorkers ? '#86EFAC' : '#BFDBFE',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: hasAvailableWorkers ? '#10B981' : '#2563EB',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16 }}>
              {hasAvailableWorkers ? '🟢' : '📡'}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: hasAvailableWorkers ? '#065F46' : '#1E40AF',
              }}
            >
              {hasAvailableWorkers
                ? t('employer.applicants.available_now_title')
                : t('employer.applicants.available_off_title')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: hasAvailableWorkers ? '#047857' : '#1E3A8A',
                opacity: 0.85,
              }}
              numberOfLines={1}
            >
              {hasAvailableWorkers
                ? t('employer.applicants.available_now_subtitle')
                : t('employer.applicants.available_off_subtitle')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: hasAvailableWorkers ? '#065F46' : '#1E40AF',
            }}
          >
            ›
          </Text>
        </Pressable>

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
                  {t(f.labelKey)}
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
            eyebrow={t('employer.applicants.offline_eyebrow')}
            title={t('employer.applicants.offline_title')}
            message={t('employer.applicants.offline_message')}
            tall
          />
        ) : applicants.length === 0 ? (
          <EmptyState
            glyph="◔"
            tone="hero"
            eyebrow={filter === 'all' ? t('employer.applicants.empty_waiting_eyebrow') : t('employer.applicants.empty_filter_eyebrow')}
            title={
              filter === 'all'
                ? t('employer.applicants.empty_no_applicants_title')
                : t('employer.applicants.empty_filter_title', { filter })
            }
            message={
              filter === 'all'
                ? t('employer.applicants.empty_no_applicants_message')
                : t('employer.applicants.empty_filter_message')
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
