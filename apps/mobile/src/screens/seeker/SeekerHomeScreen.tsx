/**
 * SeekerHomeScreen — the worker's tab-1 dashboard, blue palette.
 *
 * Sections, top to bottom:
 *   1. Header — Doondo wordmark + notification bell with live badge
 *   2. Location pill — current city + nearby-jobs count (real, from API)
 *   3. Voice search card — big "Find jobs through voice" CTA → VoiceSearch
 *   4. Job categories — 5 tile shortcuts (Lucide-free, emoji + colored bg)
 *   5. Nearby jobs — real /jobs/nearby data, capped to 6 here; full list
 *      lives in the Jobs tab.
 *
 * Every data point is real. No mock numbers, no hardcoded job cards.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii, categoryTints } from '@doondo/tokens';
import { Screen, Text, Card, Pill, NotificationsBell } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { jobsApi } from '@/api/jobs.api';
import { getCurrentCoords, type Coords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

// Bengaluru fallback so the screen never feels broken on permission denial.
const FALLBACK_COORDS = { lat: 12.9716, lng: 77.5946 };

interface Category {
  key: string;
  label: string;
  emoji: string;
  /** Keyword fed into the Jobs tab's text-search box. */
  query: string;
  tint: { bg: string; fg: string };
}

const CATEGORIES: Category[] = [
  { key: 'delivery', label: 'Delivery', emoji: '🛵', query: 'delivery', tint: categoryTints.delivery },
  { key: 'driver', label: 'Driver', emoji: '🚗', query: 'driver', tint: categoryTints.driver },
  { key: 'electrician', label: 'Electrician', emoji: '⚡', query: 'electrician', tint: categoryTints.electrician },
  { key: 'helper', label: 'Helper', emoji: '🤝', query: 'helper', tint: categoryTints.helper },
  { key: 'mason', label: 'Mason', emoji: '🧱', query: 'mason', tint: categoryTints.mason },
];

export function SeekerHomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();

  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await getCurrentCoords().catch(() => null);
      if (cancelled) return;
      setCoords(c ?? FALLBACK_COORDS);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real nearby-jobs query for the home preview.
  const jobsQuery = useQuery({
    queryKey: ['jobs', 'nearby', coords?.lat, coords?.lng],
    queryFn: () =>
      jobsApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: 10_000,
        limit: 6,
      }),
    enabled: coords !== null,
    staleTime: 60_000,
  });

  const jobs: PublicJob[] = jobsQuery.data?.jobs ?? [];
  const nearbyCount = jobs.length;

  const cityLabel = useMemo(() => {
    return (
      user?.location?.city ??
      user?.location?.area ??
      (coords ? 'Your area' : 'Locating…')
    );
  }, [user?.location, coords]);

  function openVoice() {
    haptic('selection');
    navigation.navigate('VoiceSearch');
  }

  function openCategory(c: Category) {
    haptic('selection');
    navigation.navigate('SeekerTabs', {
      screen: 'Jobs',
      params: { initialQuery: c.query },
    } as never);
  }

  function openJob(j: PublicJob) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId: j.id });
  }

  function openNotifications() {
    navigation.navigate('Notifications');
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing['5xl'],
          gap: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={jobsQuery.isRefetching}
            onRefresh={() => void jobsQuery.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="title" weight="medium" style={{ color: theme.brand.hero }}>
            Doondo
          </Text>
          <NotificationsBell onPress={openNotifications} />
        </View>

        {/* Location pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ fontSize: 16 }}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" weight="medium">
              {cityLabel}
            </Text>
            <Text variant="footnote" tone="secondary">
              {jobsQuery.isLoading
                ? 'Finding nearby jobs…'
                : `${nearbyCount} nearby ${nearbyCount === 1 ? 'job' : 'jobs'}`}
            </Text>
          </View>
        </View>

        {/* Voice search hero card */}
        <Pressable onPress={openVoice}>
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radii.xl,
              backgroundColor: theme.brand.hero,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              shadowColor: theme.brand.hero,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 14,
              elevation: 6,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                variant="bodyLarge"
                weight="medium"
                style={{ color: '#FFFFFF' }}
              >
                Find jobs through voice
              </Text>
              <Text
                variant="footnote"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                Tell us what work you want
              </Text>
            </View>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(255,255,255,0.20)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28, color: '#FFFFFF' }}>🎤</Text>
            </View>
          </View>
        </Pressable>

        {/* Categories */}
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              JOB CATEGORIES
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never)}
            >
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                View all
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => openCategory(c)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radii.lg,
                    backgroundColor: c.tint.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
                </View>
                <Text variant="caption" weight="medium" numberOfLines={1}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Nearby jobs */}
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              NEARBY JOBS
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never)}
            >
              <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                See more
              </Text>
            </Pressable>
          </View>

          {jobsQuery.isLoading && (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.brand.hero} />
            </View>
          )}

          {!jobsQuery.isLoading && jobs.length === 0 && (
            <Card>
              <Text variant="body" tone="secondary">
                No jobs near you right now. Pull to refresh.
              </Text>
            </Card>
          )}

          {jobs.map((j) => (
            <Pressable key={j.id} onPress={() => openJob(j)}>
              <Card>
                <View style={{ gap: spacing.sm }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                        {j.title}
                      </Text>
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {j.employer?.name ?? 'Doondo Employer'}
                        {j.employer?.isVerified ? ' · ✓ Verified' : ''}
                      </Text>
                      <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                        {j.location.city}
                        {j.distanceMeters != null
                          ? ` · ${formatDistance(j.distanceMeters)}`
                          : ''}
                      </Text>
                    </View>
                    <Pill label={formatType(j.type)} tone="neutral" />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      variant="bodyLarge"
                      weight="medium"
                      style={{ color: theme.accent.amber }}
                    >
                      {formatPay(j.pay)}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: 6,
                        borderRadius: radii.pill,
                        backgroundColor: theme.brand.hero,
                      }}
                    >
                      <Text
                        variant="footnote"
                        weight="medium"
                        style={{ color: '#FFFFFF' }}
                      >
                        Apply Now
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatType(t: PublicJob['type']): string {
  return ({
    full_time: 'Full-time',
    part_time: 'Part-time',
    gig: 'Gig',
    shift: 'Shift',
    contract: 'Contract',
  } as const)[t];
}

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  const lo = (pay.amount / minor).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null;
  const periodMap = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  } as const;
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}
