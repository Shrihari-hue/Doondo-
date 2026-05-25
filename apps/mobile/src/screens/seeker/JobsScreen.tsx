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

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWomenModeStore } from '@/stores/womenMode.store';

import { spacing, radii, coral, champagne } from '@doondo/tokens';
import { Screen, Text, Pill, Card, LoadingSpinner, SkeletonCard, Avatar, EmptyState, Button, ErrorPanel } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi, type MassApplyResult } from '@/api/applications.api';
import { getCurrentCoords, type Coords } from '@/lib/location';
import { useJobSearchLocationStore } from '@/stores/jobSearchLocation.store';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { useTranslate } from '@/i18n/useTranslate';
import { JobsMapView } from './jobs-map/JobsMapView';
import { MapErrorBoundary } from './jobs-map/MapErrorBoundary';
import type { PublicJob, JobType } from '@/api/types';
import type { AppStackParamList, SeekerTabParamList } from '@/navigation/types';

const MAX_MASS_APPLY = 20;

type Nav = NativeStackNavigationProp<AppStackParamList>;
/** Shared local alias for helper signatures across this file. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Fallback used when location is denied so the screen always shows
// something. Same coords the seed script defaults to (Indiranagar, Bengaluru).
const FALLBACK_COORDS = { lat: 12.9716, lng: 77.5946 };

// `labelKey` resolves at render time via t(). 'all' uses the dedicated
// jobs.filters.all key; the others reuse the shared common.job_type.*
// namespace already established in PR 1.
const FILTER_TYPES: Array<{ key: JobType | 'all'; labelKey: string }> = [
  { key: 'all', labelKey: 'jobs.filters.all' },
  { key: 'full_time', labelKey: 'common.job_type.full_time' },
  { key: 'part_time', labelKey: 'common.job_type.part_time' },
  { key: 'gig', labelKey: 'common.job_type.gig' },
  { key: 'shift', labelKey: 'common.job_type.shift' },
];

export function JobsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslate();

  // Accept an initial search keyword from category tile / voice search.
  // We read this lazily once on mount and clear it from the navigation
  // state so revisiting the tab doesn't keep refilling the box.
  const route = useRoute<RouteProp<SeekerTabParamList, 'Jobs'>>();
  const initialQuery = route.params?.initialQuery ?? '';

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsSource, setCoordsSource] = useState<Coords['source'] | 'fallback'>('fallback');

  // Search location — the worker can re-centre the feed on a chosen
  // place instead of their own GPS position. `place` is null = use GPS.
  const searchPlace = useJobSearchLocationStore((s) => s.place);
  const setSearchPlace = useJobSearchLocationStore((s) => s.setPlace);
  const hydrateSearchPlace = useJobSearchLocationStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateSearchPlace();
  }, [hydrateSearchPlace]);
  // The coordinates the feed actually searches around.
  const effectiveCoords = searchPlace
    ? { lat: searchPlace.lat, lng: searchPlace.lng }
    : coords;
  const [type, setType] = useState<JobType | 'all'>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  /** Search radius in km (UI unit). Converted to meters when calling the API. */
  const [radiusKm, setRadiusKm] = useState(5);
  const [search, setSearch] = useState(initialQuery);
  /**
   * Optional "safe for women" narrowing chip. Off by default — when on,
   * only posts the employer flagged safeForWomen come back from the API.
   */
  const [safeForWomenOnly, setSafeForWomenOnly] = useState(false);

  // Women's Mode (the "Doondo for Women" preference) defaults this
  // filter on. Applied once, after the stored preference hydrates — the
  // worker can still toggle the chip freely afterwards.
  const womenModeEnabled = useWomenModeStore((s) => s.enabled);
  const womenModeApplied = useRef(false);
  useEffect(() => {
    if (womenModeEnabled && !womenModeApplied.current) {
      womenModeApplied.current = true;
      setSafeForWomenOnly(true);
    }
  }, [womenModeEnabled]);

  // If the tab is opened with a new query param, sync it once.
  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);
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
    queryKey: [
      'jobs',
      'nearby',
      effectiveCoords?.lat,
      effectiveCoords?.lng,
      type,
      debouncedSearch,
      radiusKm,
      safeForWomenOnly,
    ],
    queryFn: () =>
      jobsApi.nearby({
        lat: effectiveCoords!.lat,
        lng: effectiveCoords!.lng,
        radius: radiusKm * 1000, // km → meters
        ...(type !== 'all' ? { type } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(safeForWomenOnly ? { safeForWomenOnly: true } : {}),
        limit: 50,
      }),
    enabled: effectiveCoords != null,
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
      Alert.alert(t('jobs.apply_alert.title'), summarizeMassApply(result, t), [{ text: t('common.ok') }]);
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('jobs.apply_alert.couldnt_apply_title'),
        err instanceof Error ? err.message : t('jobs.apply_alert.please_try_again'),
      );
    },
  });

  const jobs = query.data?.jobs ?? [];

  return (
    <Screen edges={['top']}>
      {selectionMode && (
        <SelectionBar
          t={t}
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
              t={t}
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
              searchPlaceLabel={searchPlace?.label ?? null}
              onOpenLocationPicker={() => {
                haptic('light');
                navigation.navigate('LocationPicker');
              }}
              onClearLocation={() => {
                haptic('selection');
                void setSearchPlace(null);
              }}
              jobCount={jobs.length}
              view={view}
              onChangeView={(v) => {
                haptic('selection');
                setView(v);
              }}
              safeForWomenOnly={safeForWomenOnly}
              onToggleSafeForWomen={() => {
                haptic('selection');
                setSafeForWomenOnly((v) => !v);
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
              <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
            ) : searchPlace ? (
              // A place was chosen but has no jobs in range — offer a
              // job alert so the worker hears about the first one.
              <View
                style={{
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: spacing['2xl'],
                  paddingHorizontal: spacing.xl,
                }}
              >
                <Text style={{ fontSize: 40 }}>📍</Text>
                <Text
                  variant="bodyLarge"
                  weight="medium"
                  style={{ textAlign: 'center' }}
                >
                  {t('jobs.no_jobs_in_place.title', { place: searchPlace.label })}
                </Text>
                <Text
                  variant="footnote"
                  tone="secondary"
                  style={{ textAlign: 'center' }}
                >
                  {t('jobs.no_jobs_in_place.message')}
                </Text>
                <Button
                  label={t('jobs.no_jobs_in_place.notify')}
                  fullWidth={false}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('JobAlertForm', {
                      suggestion: {
                        name: searchPlace.label,
                        city: searchPlace.label,
                      },
                    });
                  }}
                />
              </View>
            ) : (
              <EmptyState
                glyph="◔"
                eyebrow={t('jobs.empty.eyebrow')}
                title={t('jobs.empty.title')}
                message={t('jobs.empty.message')}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <JobCard
              t={t}
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
              t={t}
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
              searchPlaceLabel={searchPlace?.label ?? null}
              onOpenLocationPicker={() => {
                haptic('light');
                navigation.navigate('LocationPicker');
              }}
              onClearLocation={() => {
                haptic('selection');
                void setSearchPlace(null);
              }}
              jobCount={jobs.length}
              view={view}
              onChangeView={(v) => {
                haptic('selection');
                setView(v);
              }}
              safeForWomenOnly={safeForWomenOnly}
              onToggleSafeForWomen={() => {
                haptic('selection');
                setSafeForWomenOnly((v) => !v);
              }}
            />
          </View>
          {effectiveCoords ? (
            <MapErrorBoundary onError={() => setView('list')}>
              <JobsMapView coords={effectiveCoords} jobs={jobs} radiusKm={radiusKm} />
            </MapErrorBoundary>
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
  t: TFn;
  userName: string | null;
  type: JobType | 'all';
  onChangeType: (t: JobType | 'all') => void;
  search: string;
  onChangeSearch: (q: string) => void;
  radiusKm: number;
  onChangeRadius: (km: number) => void;
  coordsSource: Coords['source'] | 'fallback';
  /** Label of the chosen search place, or null = the worker's own location. */
  searchPlaceLabel: string | null;
  /** Open the location picker to change where the feed searches. */
  onOpenLocationPicker: () => void;
  /** Clear the chosen place — snap the feed back to the worker's location. */
  onClearLocation: () => void;
  jobCount: number;
  view: 'list' | 'map';
  onChangeView: (v: 'list' | 'map') => void;
  safeForWomenOnly: boolean;
  onToggleSafeForWomen: () => void;
}

function timeOfDayCaption(t: TFn): string {
  const h = new Date().getHours();
  if (h < 5) return t('jobs.greeting.still_up');
  if (h < 12) return t('jobs.greeting.good_morning');
  if (h < 17) return t('jobs.greeting.good_afternoon');
  // 17:00 onward stays "Good evening" — someone opening a job app at 11pm
  // is starting a task, not being sent to bed, so "Good night" read wrong.
  return t('jobs.greeting.good_evening');
}

function Header({
  t,
  userName,
  type,
  onChangeType,
  search,
  onChangeSearch,
  radiusKm,
  onChangeRadius,
  coordsSource,
  searchPlaceLabel,
  onOpenLocationPicker,
  onClearLocation,
  jobCount,
  view,
  onChangeView,
  safeForWomenOnly,
  onToggleSafeForWomen,
}: HeaderProps) {
  const { theme } = useTheme();

  const subtitle = searchPlaceLabel
    ? t('jobs.subtitle.within_km_of_place', {
        km: radiusKm,
        place: searchPlaceLabel,
      })
    : coordsSource === 'gps'
      ? t('jobs.subtitle.within_km_of_you', { km: radiusKm })
      : coordsSource === 'manual'
        ? t('jobs.subtitle.within_km_of_your_area', { km: radiusKm })
        : t('jobs.subtitle.demo_location');

  const countSuffix =
    jobCount > 0
      ? ' · ' +
        t(jobCount === 1 ? 'jobs.job_count_one' : 'jobs.job_count_other', {
          count: jobCount,
        })
      : '';

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
            {timeOfDayCaption(t)}
          </Text>
          <Text variant="display" weight="medium" display>
            {firstName
              ? t('jobs.greeting.hello_named', { name: firstName })
              : t('jobs.greeting.hello_there')}
            <Text variant="display" weight="medium" display style={{ fontSize: 28 }}>
              👋
            </Text>
          </Text>
          <Text variant="bodyLarge" tone="secondary">
            {t('jobs.subtitle.find_gig')}
          </Text>
          {/* Location line — a removable chip while searching another
             place, otherwise a tappable "Within X km of you · Change". */}
          {searchPlaceLabel ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 4,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: radii.pill,
                  backgroundColor: theme.brand.heroSubtle,
                  borderWidth: 0.5,
                  borderColor: theme.brand.hero,
                }}
              >
                <Pressable
                  onPress={onOpenLocationPicker}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingLeft: 10,
                    paddingRight: 6,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>📍</Text>
                  <Text
                    variant="footnote"
                    weight="medium"
                    numberOfLines={1}
                    style={{ color: theme.brand.hero, maxWidth: 180 }}
                  >
                    {searchPlaceLabel}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onClearLocation}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('jobs.clear_location')}
                  style={{ paddingRight: 9, paddingLeft: 2, paddingVertical: 5 }}
                >
                  <Text style={{ fontSize: 13, color: theme.brand.hero }}>✕</Text>
                </Pressable>
              </View>
              <Text variant="footnote" tone="tertiary">
                {t('jobs.km_chip', { km: radiusKm })}
                {countSuffix}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={onOpenLocationPicker}
              hitSlop={6}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 2,
              }}
            >
              <Text variant="footnote" tone="tertiary">
                {subtitle}
                {countSuffix}
              </Text>
              <Text
                variant="footnote"
                weight="medium"
                style={{ color: theme.brand.hero, marginLeft: 6 }}
              >
                {t('jobs.change_location')}
              </Text>
            </Pressable>
          )}
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
                  {v === 'list' ? t('jobs.view.list') : t('jobs.view.map')}
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
          placeholder={t('jobs.search.placeholder')}
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
          {t('jobs.sections.distance')}
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
                  {t('jobs.km_chip', { km })}
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
                {t(f.labelKey)}
              </Text>
            </Pressable>
          );
        })}

        {/* Safe-for-women toggle — separate visual treatment (green) so it
            reads as a safety affordance rather than another type filter. */}
        <Pressable
          onPress={onToggleSafeForWomen}
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: safeForWomenOnly ? '#10B981' : theme.border.default,
            backgroundColor: safeForWomenOnly ? '#D1FAE5' : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Text
            variant="footnote"
            style={{ color: safeForWomenOnly ? '#065F46' : theme.text.secondary }}
          >
            🛡
          </Text>
          <Text
            variant="footnote"
            weight={safeForWomenOnly ? 'medium' : 'regular'}
            style={{ color: safeForWomenOnly ? '#065F46' : theme.text.secondary }}
          >
            {t('jobs.filters.women_safe_only')}
          </Text>
        </Pressable>
      </View>

      {/* Recommended for you — section header for the job cards. Only shown
          in list view: in map view the cards are replaced by the map, so
          this header would otherwise sit on top of the map labelling
          nothing. */}
      {view === 'list' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.xs,
          }}
        >
          <Text variant="bodyLarge" weight="medium">
            {t('jobs.sections.recommended_for_you')}
          </Text>
          <Text variant="footnote" tone="hero" weight="medium">
            {t('jobs.sections.see_all_arrow')}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Job card ────────────────────────────────────────────────────────────────

interface JobCardProps {
  t: TFn;
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
  t,
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
      ? t('common.units.meters_short', { n: job.distanceMeters })
      : t('common.units.kilometers_short', { n: (job.distanceMeters / 1000).toFixed(1) })
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
              name={job.employer?.name ?? t('jobs.card.default_employer')}
              photoUrl={job.employer?.photoUrl ?? null}
              size={44}
              premium={job.employer?.isVerified}
            />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
                {job.title}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {job.employer?.name ?? t('jobs.card.default_employer')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
              <Text variant="caption" tone="tertiary">
                {timeAgo(job.createdAt, t)}
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
            {job.urgent && <Pill label={t('jobs.card.urgent')} tone="warning" leading="●" />}
            {job.safeForWomen && (
              <Pill label={t('jobs.card.women_safe')} tone="success" leading="🛡" />
            )}
            <Pill label={formatPay(job.pay, t)} tone="warning" />
            <Pill label={formatType(job.type, t)} tone="neutral" />
            {job.location.area && (
              <Pill label={`◉ ${job.location.area}`} tone="neutral" />
            )}
            {distance && <Pill label={distance} tone="neutral" />}
            {job.employer?.isVerified && (
              <Pill label={t('jobs.card.verified')} tone="premium" leading="★" />
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function timeAgo(iso: string, t: TFn): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t('jobs.card.time.just_now');
  if (m < 60) return t('jobs.card.time.minutes_ago', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('jobs.card.time.hours_ago', { h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('jobs.card.time.days_ago', { d });
  // For longer ago we render the actual date via the OS — keep undefined
  // locale arg so the runtime picks based on the device's chosen locale.
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  // amount is in smallest unit (paise for INR, cents for USD).
  const minor = pay.currency === 'INR' ? 100 : 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
  // 'en-IN' for lakh/crore grouping that Indian users expect regardless of
  // active UI language — see PR 1's formatPay docs.
  const lo = (pay.amount / minor).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;
  const periodKey =
    pay.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : pay.period === 'day'
        ? 'common.pay_period.suffix_day'
        : pay.period === 'week'
          ? 'common.pay_period.suffix_week'
          : pay.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return hi
    ? `${symbol}${lo}–${hi}${t(periodKey)}`
    : `${symbol}${lo}${t(periodKey)}`;
}

function formatType(type: JobType, t: TFn): string {
  return t(`common.job_type.${type}`);
}

// ─── Mass-apply UI helpers ───────────────────────────────────────────────────

interface SelectionBarProps {
  t: TFn;
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
function SelectionBar({ t, count, submitting, onCancel, onApply }: SelectionBarProps) {
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
          {t('jobs.selection.cancel')}
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="bodyLarge" weight="medium">
          {t('jobs.selection.count_selected', { count })}
        </Text>
        <Text variant="caption" tone="tertiary">
          {t('jobs.selection.long_press_hint')}
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
          {submitting ? t('jobs.selection.applying') : t('jobs.selection.apply_to_count', { count })}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Build the human-readable summary the result Alert shows after mass-apply.
 * Speaks to "what happened to your batch" without leaking server lingo.
 * Each line uses i18next's _one/_other plural form so the count is rendered
 * correctly across all 5 locales.
 */
function summarizeMassApply(result: MassApplyResult, t: TFn): string {
  const lines: string[] = [];
  const line = (count: number, base: string) => {
    const key = count === 1 ? `jobs.mass_apply.${base}_one` : `jobs.mass_apply.${base}_other`;
    return t(key, { count });
  };
  if (result.applied > 0) {
    lines.push(line(result.applied, 'applied'));
  }
  if (result.alreadyApplied > 0) {
    lines.push(line(result.alreadyApplied, 'already'));
  }
  const closed = result.results.filter((r) => r.status === 'job_not_open').length;
  if (closed > 0) {
    lines.push(line(closed, 'closed'));
  }
  const missing = result.results.filter((r) => r.status === 'job_not_found').length;
  if (missing > 0) {
    lines.push(line(missing, 'missing'));
  }
  const failed = result.results.filter((r) => r.status === 'failed').length;
  if (failed > 0) {
    lines.push(line(failed, 'failed'));
  }
  return lines.length ? lines.join('\n') : t('jobs.mass_apply.none_sent');
}
