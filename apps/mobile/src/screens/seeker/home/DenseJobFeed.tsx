/**
 * DenseJobFeed — the premium Home feed shared by Today + This Week.
 *
 * Despite the name, this is no longer "dense" — Phase 3 brought a
 * proper hero card, browse-by-trade card grid, and spacious premium
 * job cards matching the mockup. The two modes only differ in:
 *   1. Which API endpoint they hit (jobsApi.today / jobsApi.thisWeek)
 *   2. The empty-state copy
 *
 * Trade filter chips live inside the FlatList header — tapping a chip
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
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { TRADES, tradeShortLabel, tradeEmoji } from '@/lib/trades';
import { haptic } from '@/lib/haptics';
import { AvailabilityBeaconChip } from './AvailabilityBeacon';
import type { PublicJob, PublicUser } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import type { Coords } from '@/lib/location';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export type FeedMode = 'today' | 'this_week';

interface Props {
  coords: Coords | null;
  mode: FeedMode;
  user: PublicUser | null;
  /** Tapping the hero's Explore Jobs button bounces the seeker into the
   *  full Jobs tab — the parent owns navigation so this stays decoupled. */
  onExploreJobs: () => void;
}

export function DenseJobFeed({ coords, mode, user, onExploreJobs }: Props) {
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

  // ─── Header — Hero + AvailabilityBeacon + Browse by trade ────────────────
  const renderHeader = useMemo(
    () => (
      <View style={{ gap: spacing.lg, marginBottom: spacing.md }}>
        <HeroCard onExplore={onExploreJobs} />
        <AvailabilityBeaconChip coords={coords} user={user} />
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: theme.text.primary,
                letterSpacing: -0.3,
              }}
            >
              Browse by trade
            </Text>
            <Pressable
              onPress={() => {
                haptic('light');
                onExploreJobs();
              }}
              hitSlop={6}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>
                View all →
              </Text>
            </Pressable>
          </View>
          {tradeFilters.length > 0 ? (
            <Pressable onPress={clearFilters} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                Clear {tradeFilters.length} filter{tradeFilters.length > 1 ? 's' : ''}
              </Text>
            </Pressable>
          ) : null}
          {/* Card-style trade chips: emoji on top, short label underneath,
             fixed width. Horizontal scroll so the row reads as a gallery. */}
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
                    height: 92,
                    paddingVertical: spacing.sm + 2,
                    paddingHorizontal: 6,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    backgroundColor: active ? '#2563EB' : theme.bg.surface,
                    borderWidth: active ? 0 : 1,
                    borderColor: theme.border.default,
                    opacity: pressed ? 0.75 : 1,
                    shadowColor: active ? '#2563EB' : '#0F172A',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: active ? 0.25 : 0.06,
                    shadowRadius: active ? 8 : 6,
                    elevation: active ? 3 : 2,
                  })}
                >
                  <Text style={{ fontSize: 28, lineHeight: 32 }}>{item.emoji}</Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
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
      </View>
    ),
    [tradeFilters, theme, coords, user, onExploreJobs],
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
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={'#2563EB'}
        />
      }
      renderItem={({ item }) => (
        <PremiumJobCard job={item} onPress={openJob} mode={mode} />
      )}
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

// ─── Hero card — deep navy gradient w/ megaphone ────────────────────────────

function HeroCard({ onExplore }: { onExplore: () => void }) {
  return (
    <View
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#172554',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
        elevation: 8,
        backgroundColor: '#1E1B4B',
      }}
    >
      <LinearGradient
        colors={['#1E1B4B', '#172554', '#0F1A45']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.xl,
          minHeight: 200,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 2,
              color: 'rgba(255,255,255,0.65)',
            }}
          >
            OPPORTUNITIES DAILY
          </Text>
          <Text
            style={{
              fontSize: 24,
              lineHeight: 30,
              fontWeight: '700',
              color: '#FFFFFF',
              letterSpacing: -0.5,
              maxWidth: 220,
            }}
          >
            Find the right jobs near you
          </Text>
          {/* The white pill background lives on a wrapper View so it can't
             drop out during state transitions and leave dark-navy text
             invisible on the navy hero. Pressable handles only feedback. */}
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: spacing.xs,
              borderRadius: radii.pill,
              backgroundColor: '#FFFFFF',
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.22,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            <Pressable
              onPress={() => {
                haptic('selection');
                onExplore();
              }}
              accessibilityRole="button"
              accessibilityLabel="Explore jobs"
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.pill,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: '#0F1A45',
                  letterSpacing: 0.1,
                }}
              >
                Explore Jobs
              </Text>
              <Text style={{ fontSize: 14, color: '#0F1A45', fontWeight: '800' }}>
                →
              </Text>
            </Pressable>
          </View>
        </View>
        {/* Megaphone illustration — large emoji at low opacity gives the
           silhouette the mockup shows without bundling an SVG asset. */}
        <View
          style={{
            position: 'absolute',
            right: -20,
            top: 10,
            bottom: 10,
            width: 180,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.85,
          }}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 140, lineHeight: 160 }}>📣</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── Premium job card ───────────────────────────────────────────────────────

function PremiumJobCard({
  job,
  onPress,
  mode,
}: {
  job: PublicJob;
  onPress: (j: PublicJob) => void;
  mode: FeedMode;
}) {
  const { theme } = useTheme();

  const location = [job.location.area, job.location.city]
    .filter(Boolean)
    .join(', ');
  const distance =
    job.distanceMeters != null ? formatDistance(job.distanceMeters) : null;

  // The role icon — try to match the job to a trade catalogue emoji, fall
  // back to a generic briefcase if nothing matches. Skills array often
  // mirrors the trade slug so this connects cleanly for blue-collar roles.
  const icon = pickJobIcon(job);

  return (
    <Pressable
      onPress={() => onPress(job)}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${formatPay(job.pay)}`}
      style={({ pressed }) => ({
        backgroundColor: theme.bg.surface,
        borderRadius: 18,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.lg,
        gap: spacing.md,
        opacity: pressed ? 0.92 : 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3,
      })}
    >
      {/* Top row: navy icon tile + title block + urgent pill */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.md,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: '#172554',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 26, lineHeight: 30 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 20,
              lineHeight: 24,
              fontWeight: '700',
              color: theme.text.primary,
              letterSpacing: -0.3,
            }}
            numberOfLines={1}
          >
            {job.title}
          </Text>
          {location || distance ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {location ? (
                <Text
                  style={{ fontSize: 12, color: theme.text.tertiary }}
                  numberOfLines={1}
                >
                  📍 {location}
                  {distance ? '  ·  ' : ''}
                </Text>
              ) : null}
              {distance ? (
                <Text
                  style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}
                >
                  {distance} away
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {job.urgent ? (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radii.pill,
              backgroundColor: '#FEE2E2',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 10, color: '#B91C1C' }}>⚡</Text>
            <Text
              style={{ fontSize: 11, fontWeight: '800', color: '#B91C1C', letterSpacing: 0.4 }}
            >
              URGENT
            </Text>
          </View>
        ) : null}
      </View>

      {/* Inline stats card — pay / hours / start */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.bg.muted,
          borderRadius: 14,
          padding: spacing.sm + 2,
          gap: spacing.xs,
        }}
      >
        <StatBox
          icon="₹"
          iconBg="#EEF2FF"
          iconColor="#172554"
          big={formatPayPrimary(job.pay)}
          small={formatPaySuffix(job.pay)}
        />
        <StatDivider />
        {/* Schedule stat — show hours/day on top and the type below. When
           hours aren't set, show the type as the headline and 'Schedule'
           as the descriptor so we never render the same word twice
           (was 'Gig / Gig' on gig postings with no schedule). */}
        {(() => {
          const hrs = job.schedule?.hoursPerDay;
          const type = formatType(job.type);
          return hrs != null ? (
            <StatBox icon="🕐" big={`${hrs} hrs / day`} small={type} />
          ) : (
            <StatBox icon="🕐" big={type} small="Schedule" />
          );
        })()}
        <StatDivider />
        <StatBox
          icon="📅"
          big={job.urgent ? 'Start Today' : 'Flexible'}
          small={job.urgent ? 'Immediate' : 'Schedule'}
        />
      </View>

      {/* Requirement pills — first 3 skills from the job. Skipping more
         than 3 prevents the card from blowing out vertically. */}
      {job.skills.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.xs,
          }}
        >
          {job.skills.slice(0, 3).map((s) => (
            <View
              key={s}
              style={{
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: '#EFF6FF',
                borderWidth: 0.5,
                borderColor: '#BFDBFE',
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: '#1E40AF' }}
                numberOfLines={1}
              >
                {prettifyRequirement(s)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* CTA — full-width navy pill with phone icon */}
      <Pressable
        onPress={() => onPress(job)}
        accessibilityRole="button"
        accessibilityLabel={
          mode === 'today' ? 'Tap to call or apply' : 'View job'
        }
        style={({ pressed }) => ({
          borderRadius: radii.pill,
          overflow: 'hidden',
          opacity: pressed ? 0.9 : 1,
          shadowColor: '#172554',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 14,
          elevation: 5,
          backgroundColor: '#172554',
        })}
      >
        <LinearGradient
          colors={['#1E1B4B', '#172554', '#0F1A45']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingVertical: 14,
            paddingHorizontal: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 16, color: '#FFFFFF' }}>📞</Text>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '800',
              color: '#FFFFFF',
              letterSpacing: 0.3,
            }}
          >
            {mode === 'today' ? 'Tap to call / apply' : 'View details'}
          </Text>
        </LinearGradient>
      </Pressable>
    </Pressable>
  );
}

function StatBox({
  icon,
  iconBg,
  iconColor,
  big,
  small,
}: {
  icon: string;
  iconBg?: string;
  iconColor?: string;
  big: string;
  small: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: iconBg ?? '#EEF2FF',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: '800',
            color: iconColor ?? '#172554',
          }}
        >
          {icon}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '800',
          color: theme.text.primary,
          letterSpacing: -0.2,
          textAlign: 'center',
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {big}
      </Text>
      <Text
        style={{ fontSize: 10, color: theme.text.tertiary, textAlign: 'center' }}
        numberOfLines={1}
      >
        {small}
      </Text>
    </View>
  );
}

function StatDivider() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 0.5,
        backgroundColor: theme.border.default,
        marginVertical: 4,
      }}
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickJobIcon(job: PublicJob): string {
  // Try the job's first skill — most blue-collar postings tag a trade
  // slug as the lead skill ("driver_light", "mason", etc).
  for (const skill of job.skills ?? []) {
    const e = tradeEmoji(skill);
    if (e) return e;
  }
  // Fall back to matching the title text against trade aliases.
  const title = job.title.toLowerCase();
  for (const t of TRADES) {
    if (title.includes(t.slug.replace(/_/g, ' '))) return t.emoji;
    if (t.aliases.some((a) => title.includes(a))) return t.emoji;
  }
  return '💼';
}

function formatPay(pay: PublicJob['pay']): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range =
    max && max > min
      ? `${min.toLocaleString()}–${max.toLocaleString()}`
      : min.toLocaleString();
  const suffix: Record<PublicJob['pay']['period'], string> = {
    hour: ' / hr',
    day: ' / day',
    week: ' / wk',
    month: ' / mo',
    fixed: ' fixed',
  };
  return `₹${range}${suffix[pay.period]}`;
}

function formatPayPrimary(pay: PublicJob['pay']): string {
  const min = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const range =
    max && max > min
      ? `₹${min.toLocaleString()}–${max.toLocaleString()}`
      : `₹${min.toLocaleString()}`;
  return range;
}

function formatPaySuffix(pay: PublicJob['pay']): string {
  switch (pay.period) {
    case 'hour':
      return 'Per hour';
    case 'day':
      return 'Per day';
    case 'week':
      return 'Per week';
    case 'month':
      return 'Per month';
    case 'fixed':
      return 'One-time';
  }
}

function formatType(t: PublicJob['type']): string {
  return (
    {
      full_time: 'Full Time',
      part_time: 'Part Time',
      gig: 'Gig',
      shift: 'Shift',
      contract: 'Contract',
    } as const
  )[t];
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function prettifyRequirement(skill: string): string {
  const trimmed = skill.trim();
  if (!trimmed) return '';
  // Map common slugs to the mockup-style "Label: Value" form when we can.
  const lower = trimmed.toLowerCase();
  if (lower === 'driving' || lower === 'license' || lower === 'driving_license') {
    return 'Driving License: Required';
  }
  if (lower.includes('experience')) return capitalize(trimmed);
  // Default: capitalize first letter, append " Required" if it looks like
  // a noun the user would otherwise have to figure out.
  if (lower.includes('required') || lower.includes('needed')) {
    return capitalize(trimmed);
  }
  return `${capitalize(trimmed)}: Required`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
