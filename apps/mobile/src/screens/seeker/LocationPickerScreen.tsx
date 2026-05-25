/**
 * LocationPickerScreen — choose where the Jobs list searches.
 *
 * By default the Jobs list is centred on the worker's own location.
 * This picker lets them search jobs in a different place — a worker who
 * is willing to commute, or planning to relocate, can centre the feed
 * on another city or area.
 *
 * Quick picks: "Use my location", their saved home town, and recently
 * searched places (one tap to re-select). Suggestions come from two
 * sources — cities that actually have Doondo jobs (GET /jobs/locations)
 * and free geocoding of any place via the device.
 *
 * Picking a place persists it (see jobSearchLocation.store); "Use my
 * location" clears it and snaps the feed back to GPS.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { jobsApi } from '@/api/jobs.api';
import { geocodePlace } from '@/lib/geocode';
import {
  useJobSearchLocationStore,
  type JobSearchPlace,
} from '@/stores/jobSearchLocation.store';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { user } = useAuth();
  const setPlace = useJobSearchLocationStore((s) => s.setPlace);
  const recents = useJobSearchLocationStore((s) => s.recents);

  // The worker's saved home town — a quick pick when they have one.
  const homeCity = user?.location?.city ?? null;
  const homeCoords = user?.location?.coordinates ?? null;
  const homePlace: JobSearchPlace | null =
    homeCity && homeCoords
      ? { label: homeCity, lat: homeCoords[1], lng: homeCoords[0] }
      : null;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState(false);

  const locationsQuery = useQuery({
    queryKey: ['jobs', 'locations', debounced],
    queryFn: () => jobsApi.locations(debounced),
    staleTime: 5 * 60_000,
  });
  const suggestions = locationsQuery.data?.locations ?? [];

  async function choosePlace(place: JobSearchPlace) {
    haptic('selection');
    await setPlace(place);
    navigation.goBack();
  }

  async function useMyLocation() {
    haptic('selection');
    await setPlace(null);
    navigation.goBack();
  }

  async function searchAnywhere() {
    if (!debounced || geocoding) return;
    haptic('selection');
    setGeoError(false);
    setGeocoding(true);
    try {
      const found = await geocodePlace(debounced);
      if (found) {
        await choosePlace({ label: found.label, lat: found.lat, lng: found.lng });
      } else {
        setGeoError(true);
      }
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Text
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          style={{ fontSize: 22, color: theme.text.primary }}
        >
          ←
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('location_picker.title')}
        </Text>
      </View>

      {/* Search field */}
      <View style={{ padding: spacing.xl, paddingBottom: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: theme.bg.surface,
            borderRadius: 14,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            paddingHorizontal: spacing.lg,
            minHeight: 50,
          }}
        >
          <Text style={{ fontSize: 17, color: theme.text.tertiary }}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('location_picker.search_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void searchAnywhere()}
            style={{ flex: 1, paddingVertical: spacing.md, fontSize: 15, color: theme.text.primary }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={{ fontSize: 18, color: theme.text.tertiary }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing['5xl'],
          gap: spacing.xs,
        }}
      >
        {/* Use my location — always available, snaps back to GPS. */}
        <Row
          glyph="📍"
          title={t('location_picker.use_my_location')}
          subtitle={t('location_picker.use_my_location_hint')}
          accent
          onPress={() => void useMyLocation()}
        />

        {/* Home town — quick pick from the worker's saved location. */}
        {!debounced && homePlace ? (
          <Row
            glyph="🏠"
            title={homePlace.label}
            subtitle={t('location_picker.home_town')}
            onPress={() => void choosePlace(homePlace)}
          />
        ) : null}

        {/* Geocode-anywhere row — appears once the worker has typed. */}
        {debounced.length >= 2 ? (
          <Row
            glyph="🔍"
            title={t('location_picker.search_anywhere', { query: debounced })}
            subtitle={
              geoError
                ? t('location_picker.not_found')
                : t('location_picker.search_anywhere_hint')
            }
            trailing={geocoding ? <ActivityIndicator size="small" /> : undefined}
            onPress={() => void searchAnywhere()}
          />
        ) : null}

        {/* Recently searched places — one-tap re-selection. */}
        {!debounced && recents.length > 0 ? (
          <>
            <SectionHeading text={t('location_picker.recent')} />
            {recents.map((r) => (
              <Row
                key={`recent-${r.label}-${r.lat}`}
                glyph="🕘"
                title={r.label}
                onPress={() => void choosePlace(r)}
              />
            ))}
          </>
        ) : null}

        {/* Job-place suggestions — cities that actually have jobs. */}
        <SectionHeading
          text={
            debounced ? t('location_picker.results') : t('location_picker.popular')
          }
        />

        {locationsQuery.isLoading ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator size="small" />
          </View>
        ) : suggestions.length === 0 ? (
          <Text
            style={{
              fontSize: 13,
              color: theme.text.tertiary,
              paddingVertical: spacing.md,
            }}
          >
            {debounced
              ? t('location_picker.no_job_cities')
              : t('location_picker.no_cities_yet')}
          </Text>
        ) : (
          suggestions.map((s) => (
            <Row
              key={`${s.city}-${s.lat}-${s.lng}`}
              glyph="🏙️"
              title={s.city}
              subtitle={t('location_picker.jobs_count', { count: s.jobCount })}
              onPress={() =>
                void choosePlace({ label: s.city, lat: s.lat, lng: s.lng })
              }
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function SectionHeading({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        color: theme.text.tertiary,
        letterSpacing: 0.6,
        marginTop: spacing.md,
        marginBottom: 2,
      }}
    >
      {text}
    </Text>
  );
}

function Row({
  glyph,
  title,
  subtitle,
  accent,
  trailing,
  onPress,
}: {
  glyph: string;
  title: string;
  subtitle?: string;
  accent?: boolean;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        backgroundColor: pressed ? theme.bg.muted : theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
      })}
    >
      <Text style={{ fontSize: 20 }}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: '600',
            color: accent ? theme.brand.hero : theme.text.primary,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
      )}
    </Pressable>
  );
}

export function LocationPickerScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
