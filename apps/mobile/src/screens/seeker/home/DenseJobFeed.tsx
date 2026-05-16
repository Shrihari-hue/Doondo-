/**
 * DenseJobFeed — the shared body used by Today + This Week modes on Home.
 *
 * The visual logic is the same: dense rows with a big ₹ number, distance,
 * and a job-type chip — designed for someone scanning 20 gigs at 6am at
 * the chowk. The two modes only differ in:
 *   1. Which API endpoint they hit (jobsApi.today / jobsApi.thisWeek)
 *   2. The empty-state copy
 *
 * Trade filter chips live above the list — multi-select; tapping a chip
 * adds it to a local filter set and re-queries with the joined query.
 * This is intentionally local to the feed (not a global preference) so
 * the seeker can quickly slice "Today" without losing their career feed.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { TRADES, tradeShortLabel } from '@/lib/trades';
import { haptic } from '@/lib/haptics';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import type { Coords } from '@/lib/location';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export type FeedMode = 'today' | 'this_week';

interface Props {
  coords: Coords | null;
  mode: FeedMode;
}

export function DenseJobFeed({ coords, mode }: Props) {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const [tradeFilters, setTradeFilters] = useState<string[]>([]);

  // Join selected trade chips into a single space-separated query — the
  // server's free-text search matches title/description/skills, so this
  // works even though we don't have a server-side trade filter yet.
  const q = tradeFilters.length > 0 ? tradeFilters.join(' ') : undefined;

  const query = useQuery({
    queryKey: ['jobs', mode, coords?.lat, coords?.lng, q],
    queryFn: () => {
      const params = {
        lat: coords!.lat,
        lng: coords!.lng,
        radius: mode === 'today' ? 7_500 : 15_000,
        limit: 30,
        q,
      };
      return mode === 'today' ? jobsApi.today(params) : jobsApi.thisWeek(params);
    },
    enabled: coords !== null,
    staleTime: 30_000,
  });

  const jobs = query.data?.jobs ?? [];

  const toggleTrade = (slug: string) => {
    haptic('selection');
    setTradeFilters((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  const clearFilters = () => {
    haptic('light');
    setTradeFilters([]);
  };

  const openJob = (job: PublicJob) => {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId: job.id, fromMode: mode });
  };

  const emptyTitle =
    mode === 'today'
      ? 'No same-day jobs nearby'
      : 'No short contracts posted this week';
  const emptyHint =
    mode === 'today'
      ? 'Pull to refresh, or switch to Career for longer-term roles.'
      : 'Try a wider trade filter or check back tomorrow.';

  // Render the trade chip strip + the list as a single FlatList header.
  const renderHeader = useMemo(
    () => (
      <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1.6,
              color: theme.text.tertiary,
            }}
          >
            FILTER BY TRADE
          </Text>
          {tradeFilters.length > 0 ? (
            <Pressable onPress={clearFilters} hitSlop={6}>
              <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>
        {/* Card-style chips: emoji on top, short label underneath, fixed
           width. Each chip is its own self-contained card so the row reads
           as a tidy gallery rather than a wall of run-together text. */}
        <FlatList
          data={TRADES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(t) => t.slug}
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
          renderItem={({ item }) => {
            const active = tradeFilters.includes(item.slug);
            return (
              <Pressable
                onPress={() => toggleTrade(item.slug)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.label}${active ? ', selected' : ''}`}
                style={({ pressed }) => ({
                  width: 84,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: 6,
                  borderRadius: radii.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  backgroundColor: active ? '#2563EB' : theme.bg.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: theme.border.default,
                  opacity: pressed ? 0.7 : 1,
                  shadowColor: active ? '#2563EB' : '#0F172A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: active ? 0.22 : 0.04,
                  shadowRadius: active ? 6 : 4,
                  elevation: active ? 2 : 1,
                })}
              >
                <Text style={{ fontSize: 22, lineHeight: 26 }}>
                  {item.emoji}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    textAlign: 'center',
                    color: active ? '#FFFFFF' : theme.text.primary,
                  }}
                >
                  {tradeShortLabel(item)}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    ),
    [tradeFilters, theme.text.tertiary, theme.bg.surface, theme.border.default, theme.text.primary],
  );

  if (!coords) {
    return (
      <View style={{ paddingVertical: spacing['2xl'], alignItems: 'center' }}>
        <ActivityIndicator color={'#2563EB'} />
        <Text
          style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 8 }}
        >
          Locating…
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={jobs}
      keyExtractor={(j) => j.id}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={{
        paddingBottom: spacing['5xl'],
      }}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={'#2563EB'}
        />
      }
      renderItem={({ item }) => <DenseJobRow job={item} onPress={openJob} mode={mode} />}
      ListEmptyComponent={
        query.isLoading ? (
          <View style={{ paddingVertical: spacing['2xl'], alignItems: 'center' }}>
            <ActivityIndicator color={'#2563EB'} />
          </View>
        ) : (
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radii.lg,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              gap: 4,
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
            >
              {emptyTitle}
            </Text>
            <Text style={{ fontSize: 13, color: theme.text.secondary }}>
              {emptyHint}
            </Text>
          </View>
        )
      }
    />
  );
}

// ─── Dense row ───────────────────────────────────────────────────────────────

function DenseJobRow({
  job,
  onPress,
  mode,
}: {
  job: PublicJob;
  onPress: (j: PublicJob) => void;
  mode: FeedMode;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(job)}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${formatPay(job.pay)}`}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
        gap: spacing.sm,
      })}
    >
      {/* Top row: ROLE + city + distance, with urgent pill if applicable */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {job.title}
          </Text>
          <Text
            style={{ fontSize: 12, color: theme.text.tertiary }}
            numberOfLines={1}
          >
            {[job.location.area, job.location.city].filter(Boolean).join(', ')}
            {job.distanceMeters != null
              ? ` · ${formatDistance(job.distanceMeters)}`
              : ''}
          </Text>
        </View>
        {job.urgent ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: '#FEE2E2',
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: '700', color: '#B91C1C' }}
            >
              ⚡ URGENT
            </Text>
          </View>
        ) : null}
      </View>

      {/* Pay row — the headline number, oversized intentionally */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            lineHeight: 30,
            fontWeight: '800',
            color: '#0F172A',
            letterSpacing: -0.5,
          }}
        >
          {formatPay(job.pay)}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: '#2563EB',
          }}
        >
          {mode === 'today' ? 'Tap to call / apply →' : 'Tap to view →'}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPay(pay: PublicJob['pay']): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range = max && max > min ? `${min.toLocaleString()}–${max.toLocaleString()}` : min.toLocaleString();
  const suffix: Record<PublicJob['pay']['period'], string> = {
    hour: ' / hr',
    day: ' / day',
    week: ' / wk',
    month: ' / mo',
    fixed: ' fixed',
  };
  return `₹${range}${suffix[pay.period]}`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
