/**
 * ApplicantsScreen — cross-job applicant list, redesigned to match reference.
 *
 * Layout:
 *   - Back arrow + "Applicants" header
 *   - Filter tabs with live counts: All · New · Shortlisted · Hired
 *   - Applicant cards (avatar, name, job, exp, location, time, status, actions)
 */

import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { ApplicationStatus } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { ApplicantCard } from './ApplicantCard';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB';
const BLUE_LIGHT = '#EFF6FF';

export function ApplicantsScreen() {
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');

  // Fetch all applicants once, then filter client-side so tab counts are accurate
  const query = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 30_000,
  });

  const allApplicants = query.data?.applications ?? [];

  // Tab counts
  const counts = useMemo(() => ({
    all: allApplicants.length,
    pending: allApplicants.filter((a) => a.status === 'pending').length,
    shortlisted: allApplicants.filter((a) => a.status === 'shortlisted').length,
    hired: allApplicants.filter((a) => a.status === 'hired').length,
  }), [allApplicants]);

  // Filtered list for current tab
  const applicants = useMemo(
    () =>
      filter === 'all'
        ? allApplicants
        : allApplicants.filter((a) => a.status === filter),
    [allApplicants, filter],
  );

  const bg = isLight ? '#FFFFFF' : '#0C0A0E';
  const border = isLight ? '#E5E7EB' : '#1F1F1F';
  const textPrimary = isLight ? '#1F2937' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const TABS: Array<{ key: ApplicationStatus | 'all'; label: string; count: number }> = [
    { key: 'all',         label: 'All',         count: counts.all },
    { key: 'pending',     label: 'New',         count: counts.pending },
    { key: 'shortlisted', label: 'Shortlisted', count: counts.shortlisted },
    { key: 'hired',       label: 'Hired',       count: counts.hired },
  ];

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: bg }}>

        {/* ── Header ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: insets.top + spacing.sm,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.md,
            borderBottomWidth: 0.5,
            borderBottomColor: border,
            backgroundColor: bg,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
            <Feather name="arrow-left" size={22} color={textPrimary} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 17,
              fontWeight: '700',
              color: textPrimary,
              marginRight: 34,
            }}
          >
            Applicants
          </Text>
        </View>

        {/* ── Filter tabs ── */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.sm,
            borderBottomWidth: 0.5,
            borderBottomColor: border,
            backgroundColor: bg,
            gap: spacing.xs,
          }}
        >
          {TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { haptic('selection'); setFilter(tab.key); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.pill,
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? BLUE : border,
                  backgroundColor: active ? BLUE_LIGHT : bg,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? '700' : '500',
                    color: active ? BLUE : textSecondary,
                  }}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View
                    style={{
                      backgroundColor: active ? BLUE : (isLight ? '#F3F4F6' : '#2A2A2A'),
                      borderRadius: 10,
                      minWidth: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: active ? '#FFFFFF' : textSecondary,
                      }}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* ── List ── */}
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: 100,
            gap: spacing.md,
          }}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={BLUE}
            />
          }
        >
          {query.isLoading ? (
            <>
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
              <SkeletonCard lines={2} />
            </>
          ) : query.isError ? (
            <EmptyState
              glyph="✕"
              tone="warning"
              eyebrow="Offline"
              title="Could not load applicants"
              message="Check your connection and pull to refresh."
              tall
            />
          ) : applicants.length === 0 ? (
            <EmptyState
              glyph="◔"
              tone="hero"
              eyebrow={filter === 'all' ? 'No applicants yet' : `No ${filter} applicants`}
              title={filter === 'all' ? 'Waiting for applicants' : 'Nothing here'}
              message={
                filter === 'all'
                  ? 'Post a job and applicants will appear here.'
                  : 'Try a different filter.'
              }
              tall
            />
          ) : (
            applicants.map((a) => (
              <ApplicantCard key={a.id} applicant={a} showJobTitle />
            ))
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
