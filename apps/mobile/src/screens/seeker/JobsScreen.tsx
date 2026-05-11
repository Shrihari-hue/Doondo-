/**
 * JobsScreen — the seeker's home tab.
 *
 * Phase 2 v1: location-aware list view. Map view lands as the next task.
 *
 * Flow on first open:
 *   1. Try cached coords (set during this session by getCurrentCoords).
 *   2. Otherwise ask permission → fetch GPS once.
 *   3. If denied or unavailable, render the empty-state with a "Pick your
 *      area" prompt (full picker UI is Phase 2 polish; for now we fall
 *      back to a hardcoded sensible default — the seed center — so the
 *      app never feels broken on first run).
 *
 * The list pulls /jobs/nearby through React Query; pull-to-refresh
 * reloads. Saving is optimistic on the cache.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView as HScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii, coral, champagne } from '@doondo/tokens';
import { Screen, Text, Pill, Card, LoadingSpinner, SkeletonCard, Avatar, EmptyState, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi, type MassApplyResult } from '@/api/applications.api';
import { getCurrentCoords, type Coords } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { JobsMapView } from './jobs-map/JobsMapView';
import type { PublicJob, JobType } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

const MAX_MASS_APPLY = 20;

type Nav = NativeStackNavigationProp<AppStackParamList>;

// Fallback used when location is denied so the screen always shows
// something. Same coords the seed script defaults to (Indiranagar, Bengaluru).
const FALLBACK_COORDS = { lat: 12.9716, lng: 77.5946 };

const FILTER_TYPES: Array<{ key: JobType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'full_time', label: 'Full-time' },
  { key: 'part_time', label: 'Part-time' },
  { key: 'gig', label: 'Gig' },
  { key: 'shift', label: 'Shift' },
];

export function JobsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsSource, setCoordsSource] = useState<Coords['source'] | 'fallback'>('fallback');
  const [type, setType] = useState<JobType | 'all'>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  /** Search radius in km (UI unit). Converted to meters when calling the API. */
  const [radiusKm, setRadiusKm] = useState(5);
  const [search, setSearch] = useState('');
  // Debounced search — avoid hammering the API on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Resolve coords on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await getCurrentCoords();
      if (cancelled) return;
      if (c) {
        setCoords({ lat: c.lat, lng: c.lng });
        setCoordsSource(c.source);
      } else {
        setCoords(FALLBACK_COORDS);
        setCoordsSource('fallback');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const query = useQuery({
    queryKey: ['jobs', 'nearby', coords?.lat, coords?.lng, type, debouncedSearch, radiusKm],
    queryFn: () =>
      jobsApi.nearby({
        lat: coords!.lat,
        lng: coords!.lng,
        radius: radiusKm * 1000, // km → meters
        ...(type !== 'all' ? { type } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        limit: 50,
      }),
    enabled: coords != null,
    staleTime: 60_000,
  });

  // Saved-jobs lookup so cards know whether to show a filled or empty heart.
  const savedQuery = useQuery({
    queryKey: ['jobs', 'saved'],
    queryFn: () => jobsApi.listSaved(),
    enabled: user?.role === 'seeker',
  });
  const savedIds = useMemo(
    () => new Set((savedQuery.data?.jobs ?? []).map((j) => j.id)),
    [savedQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: (input: { jobId: string; saved: boolean }) =>
      input.saved ? jobsApi.unsave(input.jobId) : jobsApi.save(input.jobId),
    onMutate: () => haptic('selection'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'saved'] });
    },
  });

  // ─── Multi-select / mass-apply ─────────────────────────────────────────────
  // Long-press a card to enter selection mode; tap others to add. The bottom
  // bar appears with "Apply to N". Cap at 20 (server hard limit too).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function enterSelectionWith(jobId: string) {
    haptic('medium');
    setSelectionMode(true);
    setSelectedIds(new Set([jobId]));
  }

  function toggleSelection(jobId: string) {
    haptic('selection');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else if (next.size < MAX_MASS_APPLY) {
        next.add(jobId);
      }
      // Auto-exit if user deselected the last one.
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  const massApplyMutation = useMutation({
    mutationFn: (jobIds: string[]) => applicationsApi.massApply(jobIds),
    onSuccess: (result) => {
      haptic('success');
      exitSelection();
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
      Alert.alert('Applied', summarizeMassApply(result), [{ text: 'OK' }]);
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        "Couldn't apply",
        err instanceof Error ? err.message : 'Please try again.',
      );
    },
  });

  const jobs = query.data?.jobs ?? [];

  return (
    <Screen edges={['top']}>
      {selectionMode && (
        <SelectionBar
          count={selectedIds.size}
          submitting={massApplyMutation.isPending}
          onCancel={exitSelection}
          onApply={() => massApplyMutation.mutate([...selectedIds])}
        />
      )}
      {view === 'list' ? (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing['2xl'],
            paddingBottom: spacing['4xl'],
            gap: spacing.md,
          }}
          ListHeaderComponent={
            <Header
              userName={user?.name ?? null}
              type={type}
              onChangeType={setType}
              search={search}
              onChangeSearch={setSearch}
              radiusKm={radiusKm}
              onChangeRadius={(r) => {
                haptic('selection');
                setRadiusKm(r);
              }}
              coordsSource={coordsSource}
              jobCount={jobs.length}
              view={view}
              onChangeView={(v) => {
                haptic('selection');
                setView(v);
              }}
            />
          }
          ListEmptyComponent={
            query.isLoading ? (
              <View style={{ gap: spacing.md }}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : query.isError ? (
              <EmptyState
                glyph="✕"
                tone="warning"
                eyebrow="OFFLINE"
                title="Couldn't load jobs"
                message="Check your connection and pull down to retry."
              />
            ) : (
              <EmptyState
                glyph="◔"
                eyebrow="QUIET HERE"
                title="No jobs in this radius yet"
                message="Try widening the area or check back in a bit — new posts land throughout the day."
              />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              saved={savedIds.has(item.id)}
              selected={selectedIds.has(item.id)}
              selectionMode={selectionMode}
              onToggleSave={() =>
                saveMutation.mutate({ jobId: item.id, saved: savedIds.has(item.id) })
              }
              onPress={() => {
                if (selectionMode) {
                  toggleSelection(item.id);
                } else {
                  navigation.navigate('JobDetail', { jobId: item.id });
                }
              }}
              onLongPress={() => {
                if (selectionMode) {
                  toggleSelection(item.id);
                } else {
                  enterSelectionWith(item.id);
                }
              }}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={theme.text.tertiary}
            />
          }
        />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing['2xl'] }}>
            <Header
              userName={user?.name ?? null}
              type={type}
              onChangeType={setType}
              search={search}
              onChangeSearch={setSearch}
              radiusKm={radiusKm}
              onChangeRadius={(r) => {
                haptic('selection');
                setRadiusKm(r);
              }}
              coordsSource={coordsSource}
              jobCount={jobs.length}
              view={view}
              onChangeView={(v) => {
                haptic('selection');
                setView(v);
              }}
            />
          </View>
          {coords ? (
            <JobsMapView coords={coords} jobs={jobs} radiusKm={radiusKm} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <LoadingSpinner />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

// ─── Header (search/filter row + count) ──────────────────────────────────────

const RADIUS_OPTIONS_KM = [5, 10, 15, 20, 25, 30, 40, 50, 100] as const;

interface HeaderProps {
  userName: string | null;
  type: JobType | 'all';
  onChangeType: (t: JobType | 'all') => void;
  search: string;
  onChangeSearch: (q: string) => void;
  radiusKm: number;
  onChangeRadius: (km: number) => void;
  coordsSource: Coords['source'] | 'fallback';
  jobCount: number;
  view: 'list' | 'map';
  onChangeView: (v: 'list' | 'map') => void;
}

function timeOfDayCaption(): string {
  const h = new Date().getHours();
  if (h < 5) return 'STILL UP';
  if (h < 12) return 'GOOD MORNING';
  if (h < 17) return 'GOOD AFTERNOON';
  if (h < 21) return 'GOOD EVENING';
  return 'GOOD NIGHT';
}

function Header({
  userName,
  type,
  onChangeType,
  search,
  onChangeSearch,
  radiusKm,
  onChangeRadius,
  coordsSource,
  jobCount,
  view,
  onChangeView,
}: HeaderProps) {
  const { theme } = useTheme();

  const subtitle =
    coordsSource === 'gps'
      ? `Within ${radiusKm} km of you`
      : coordsSource === 'manual'
        ? `Within ${radiusKm} km of your area`
        : 'Demo location — turn on GPS to see your area';

  // First name only (less likely to wrap, friendlier)
  const firstName = userName?.split(/\s+/)[0]?.trim() || null;

  return (
    <View style={{ gap: spacing.lg, marginBottom: spacing.md, position: 'relative' }}>
      {/* Soft coral radial glow behind the greeting — subtle warmth, ~4% */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -40,
          left: -40,
          width: 240,
          height: 240,
          borderRadius: 120,
          backgroundColor: coral[500],
          opacity: 0.06,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -10,
          left: -10,
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: coral[400],
          opacity: 0.05,
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {timeOfDayCaption()}
          </Text>
          <Text variant="display" weight="medium" display>
            {firstName ? `Hello, ${firstName} ` : 'Hello there '}
            <Text variant="display" weight="medium" display style={{ fontSize: 28 }}>
              👋
            </Text>
          </Text>
          <Text variant="bodyLarge" tone="secondary">
            Find your next gig nearby.
          </Text>
          <Text variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>
            {subtitle}
            {jobCount > 0 ? ` · ${jobCount} job${jobCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>

        {/* List / Map segmented toggle */}
        <View
          style={{
            flexDirection: 'row',
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            padding: 2,
            backgroundColor: theme.bg.surface,
          }}
        >
          {(['list', 'map'] as const).map((v) => {
            const active = view === v;
            return (
              <Pressable
                key={v}
                onPress={() => onChangeView(v)}
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: radii.pill,
                  backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                }}
              >
                <Text
                  variant="footnote"
                  weight={active ? 'medium' : 'regular'}
                  style={{ color: active ? theme.brand.hero : theme.text.tertiary }}
                >
                  {v === 'list' ? 'List' : 'Map'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Search input — softer radius, generous touch target */}
      <View
        style={{
          backgroundColor: theme.bg.surface,
          borderRadius: 22,
          borderWidth: 0.5,
          borderColor: theme.border.default,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 52,
        }}
      >
        <Text style={{ fontSize: 18, color: theme.text.tertiary }}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          placeholder="Search by skill, title, company"
          placeholderTextColor={theme.text.tertiary}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            color: theme.text.primary,
            fontSize: 15,
          }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => onChangeSearch('')} hitSlop={8}>
            <Text style={{ fontSize: 18, color: theme.text.tertiary }}>×</Text>
          </Pressable>
        )}
      </View>

      {/* Radius chips — horizontally scrollable so all options fit on small phones */}
      <View style={{ gap: spacing.xs }}>
        <Text variant="footnote" tone="tertiary" style={{ letterSpacing: 0.6 }}>
          DISTANCE
        </Text>
        <HScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.xl }}
        >
          {RADIUS_OPTIONS_KM.map((km) => {
            const active = radiusKm === km;
            return (
              <Pressable
                key={km}
                onPress={() => onChangeRadius(km)}
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
                  {km} km
                </Text>
              </Pressable>
            );
          })}
        </HScrollView>
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {FILTER_TYPES.map((f) => {
          const active = type === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => onChangeType(f.key)}
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

      {/* Recommended for you — section header above the cards */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.xs,
        }}
      >
        <Text variant="bodyLarge" weight="medium">
          Recommended for you
        </Text>
        <Text variant="footnote" tone="hero" weight="medium">
          See all →
        </Text>
      </View>
    </View>
  );
}

// ─── Job card ────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: PublicJob;
  saved: boolean;
  /** True when this card is part of the multi-select set. */
  selected?: boolean;
  /** True when JobsScreen is in selection mode (changes tap behaviour). */
  selectionMode?: boolean;
  onToggleSave: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * Premium job card. Layout (left → right):
 *   [avatar]  [title / company]              [time-ago]   [bookmark]
 *             [pills row: pay, type, area, distance]
 *
 * In selection mode (multi-select for mass-apply), the card outline turns
 * coral and a checkmark appears in the top-right corner instead of the
 * heart. Tapping toggles selection; long-press also toggles.
 */
function JobCard({
  job,
  saved,
  selected = false,
  selectionMode = false,
  onToggleSave,
  onPress,
  onLongPress,
}: JobCardProps) {
  const { theme } = useTheme();

  const distance = job.distanceMeters != null
    ? job.distanceMeters < 1000
      ? `${job.distanceMeters} m`
      : `${(job.distanceMeters / 1000).toFixed(1)} km`
    : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      android_ripple={{ color: theme.bg.muted }}
      style={{
        // When selected, give the card an extra coral ring outside the Card
        // border — visible without changing the Card component's contract.
        borderRadius: radii.lg,
        ...(selected
          ? { borderWidth: 2, borderColor: theme.brand.hero }
          : { borderWidth: 0, borderColor: 'transparent' }),
      }}
    >
      <Card premium={job.employer?.isVerified}>
        <View style={{ gap: spacing.sm }}>
          {/* Top row: avatar + title block + (time-ago + bookmark) */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.md,
            }}
          >
            <Avatar
              name={job.employer?.name ?? 'Doondo Employer'}
              photoUrl={job.employer?.photoUrl ?? null}
              size={44}
              premium={job.employer?.isVerified}
            />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
                {job.title}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {job.employer?.name ?? 'Doondo Employer'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
              <Text variant="caption" tone="tertiary">
                {timeAgo(job.createdAt)}
              </Text>
              {selectionMode ? (
                // Checkmark badge instead of heart when selecting jobs to apply.
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 1.5,
                    borderColor: selected ? theme.brand.hero : theme.border.strong,
                    backgroundColor: selected ? theme.brand.hero : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? (
                    <Text
                      style={{
                        fontSize: 13,
                        color: '#FFFFFF',
                        lineHeight: 16,
                      }}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  onPress={onToggleSave}
                  hitSlop={10}
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      color: saved ? coral[500] : theme.text.tertiary,
                    }}
                  >
                    {saved ? '♥' : '♡'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Pills row: urgent (warning) → pay (gold) → type → area → distance → verified */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs,
            }}
          >
            {job.urgent && <Pill label="Urgent" tone="warning" leading="●" />}
            <Pill label={formatPay(job.pay)} tone="warning" />
            <Pill label={formatType(job.type)} tone="neutral" />
            {job.location.area && (
              <Pill label={`◉ ${job.location.area}`} tone="neutral" />
            )}
            {distance && <Pill label={distance} tone="neutral" />}
            {job.employer?.isVerified && (
              <Pill label="Verified" tone="premium" leading="★" />
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatPay(pay: PublicJob['pay']): string {
  // amount is in smallest unit (paise for INR, cents for USD).
  const minor = pay.currency === 'INR' ? 100 : 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
  const lo = (pay.amount / minor).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : null;
  const periodMap: Record<PublicJob['pay']['period'], string> = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: ' fixed',
  };
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}

function formatType(t: JobType): string {
  return (
    {
      full_time: 'Full-time',
      part_time: 'Part-time',
      gig: 'Gig',
      shift: 'Shift',
      contract: 'Contract',
    } as const
  )[t];
}

// ─── Mass-apply UI helpers ───────────────────────────────────────────────────

interface SelectionBarProps {
  count: number;
  submitting: boolean;
  onCancel: () => void;
  onApply: () => void;
}

/**
 * Sticky top bar shown while the user is multi-selecting jobs. Stays at the
 * top so the FlatList still scrolls under it without nudging the safe-area
 * insets we already paid for in the parent <Screen>.
 */
function SelectionBar({ count, submitting, onCancel, onApply }: SelectionBarProps) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingHorizontal: spacing.xl,
        paddingVertical: spacing.md,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.border.default,
        backgroundColor: theme.bg.elevated,
      }}
    >
      <Pressable onPress={onCancel} hitSlop={8} disabled={submitting}>
        <Text variant="footnote" weight="medium" tone="secondary">
          Cancel
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="bodyLarge" weight="medium">
          {count} selected
        </Text>
        <Text variant="caption" tone="tertiary">
          Long-press to add or remove
        </Text>
      </View>
      <Pressable
        onPress={onApply}
        disabled={submitting || count === 0}
        style={({ pressed }) => ({
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.md,
          backgroundColor: pressed ? theme.brand.heroPressed : theme.brand.hero,
          opacity: count === 0 ? 0.5 : 1,
        })}
      >
        <Text variant="footnote" weight="medium" style={{ color: '#FFFFFF' }}>
          {submitting ? 'Applying…' : `Apply to ${count}`}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Build the human-readable summary the result Alert shows after mass-apply.
 * Speaks to "what happened to your batch" without leaking server lingo.
 */
function summarizeMassApply(result: MassApplyResult): string {
  const lines: string[] = [];
  if (result.applied > 0) {
    lines.push(
      `${result.applied} application${result.applied === 1 ? '' : 's'} sent.`,
    );
  }
  if (result.alreadyApplied > 0) {
    lines.push(
      `${result.alreadyApplied} you'd already applied to.`,
    );
  }
  const closed = result.results.filter((r) => r.status === 'job_not_open').length;
  if (closed > 0) {
    lines.push(`${closed} closed before we could send.`);
  }
  const missing = result.results.filter((r) => r.status === 'job_not_found').length;
  if (missing > 0) {
    lines.push(`${missing} no longer available.`);
  }
  const failed = result.results.filter((r) => r.status === 'failed').length;
  if (failed > 0) {
    lines.push(`${failed} couldn't be sent — please try again.`);
  }
  return lines.length ? lines.join('\n') : 'No applications sent.';
}
