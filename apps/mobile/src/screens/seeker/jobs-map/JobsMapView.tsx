/**
 * JobsMapView — map alternative to the Jobs list.
 *
 * Behaviour:
 *   1. Fits the camera to the user's coords with a sensible zoom.
 *   2. Renders one Marker per job. Custom pin: a small champagne-ringed
 *      coral disc; jade ring for verified employers.
 *   3. Tapping a pin opens a peeking bottom card with title / pay / type
 *      / employer + a "View details" CTA. Tapping the card pushes the
 *      JobDetail modal — same destination as the list view.
 *   4. Tapping outside dismisses the card.
 *
 * react-native-maps uses Google Maps on Android and Apple Maps on iOS
 * by default. Both honor the geometry; only Google reads our custom
 * style — iOS shows its standard map, which still feels native and
 * appropriate.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { coral, jade, champagne, spacing, radii } from '@doondo/tokens';
import { Text, Pill, Card, Button } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { DOONDO_DARK_MAP_STYLE } from './mapStyle';
import type { PublicJob, JobType } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

interface Props {
  coords: { lat: number; lng: number };
  jobs: PublicJob[];
  /** km — used to size the initial region when there are no results yet. */
  radiusKm?: number;
}

export function JobsMapView({ coords, jobs, radiusKm = 5 }: Props) {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const mapRef = useRef<MapView>(null);

  const [selected, setSelected] = useState<PublicJob | null>(null);
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(40)).current;

  // Whenever the jobs change, fit the camera to include every pin + the
  // user's current position. This was the bug behind "I have 1 job but
  // I don't see it on the map" — the initial region was a fixed tight
  // box around the user, so any pin outside it was invisible.
  useEffect(() => {
    if (!mapRef.current) return;
    if (jobs.length === 0) {
      // No pins — reset to a region sized by the active search radius.
      const delta = Math.min(0.6, Math.max(0.04, radiusKm / 60));
      mapRef.current.animateToRegion(
        {
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: delta,
          longitudeDelta: delta,
        },
        300,
      );
      return;
    }
    const points = [
      { latitude: coords.lat, longitude: coords.lng },
      ...jobs.map((j) => ({
        latitude: j.location.coordinates[1],
        longitude: j.location.coordinates[0],
      })),
    ];
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
      animated: true,
    });
  }, [jobs, coords.lat, coords.lng, radiusKm]);

  // Animate the bottom card in/out when selected changes.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: selected ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslate, {
        toValue: selected ? 0 : 40,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [selected, cardOpacity, cardTranslate]);

  // Size the initial region to roughly match the search radius — 1°
  // ≈ 111km, so radiusKm/55 gives ~2× radius of map height. Clamped so
  // tiny radii don't zoom in absurdly and 100km doesn't span continents.
  const initialDelta = Math.min(0.6, Math.max(0.04, radiusKm / 55));
  const initialRegion: Region = {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: initialDelta,
    longitudeDelta: initialDelta,
  };

  function onMarkerPress(job: PublicJob) {
    haptic('selection');
    setSelected(job);
    // Center the map on the marker (a touch lower so the bottom card
    // doesn't cover the pin).
    mapRef.current?.animateToRegion(
      {
        latitude: job.location.coordinates[1] - 0.005,
        longitude: job.location.coordinates[0],
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      300,
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        // Apply our warm-black map style only in dark mode; in light mode
        // Google's default looks cleaner than fighting it with overrides.
        customMapStyle={
          // theme name lives on the closure via useTheme() above
          theme.bg.canvas === '#0C0A0E' ? DOONDO_DARK_MAP_STYLE : []
        }
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {/* Soft search-radius ring — anchors "this is your zone". */}
        <Circle
          center={{ latitude: coords.lat, longitude: coords.lng }}
          radius={radiusKm * 1000}
          strokeWidth={1}
          strokeColor="rgba(184, 153, 104, 0.45)"
          fillColor="rgba(200, 83, 58, 0.06)"
        />

        {jobs.map((j) => {
          const isActive = selected?.id === j.id;
          return (
            <TrackingMarker
              key={j.id}
              latitude={j.location.coordinates[1]}
              longitude={j.location.coordinates[0]}
              onPress={() => onMarkerPress(j)}
              isActive={isActive}
            >
              <SalaryPin
                pay={j.pay}
                type={j.type}
                verified={j.employer?.isVerified}
                active={isActive}
              />
            </TrackingMarker>
          );
        })}
      </MapView>

      {/* Floating bottom card */}
      {selected && (
        <Animated.View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: spacing.xl,
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslate }],
          }}
        >
          <Card premium={selected.employer?.isVerified}>
            <View style={{ gap: spacing.md }}>
              {/* Company / employer header — leads the card. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    variant="caption"
                    tone="tertiary"
                    style={{ letterSpacing: 1.0 }}
                  >
                    {selected.employer?.isVerified ? 'VERIFIED EMPLOYER' : 'EMPLOYER'}
                  </Text>
                  <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                    {selected.employer?.name ?? 'Doondo Employer'}
                  </Text>
                </View>
                {selected.employer?.isVerified ? (
                  <Pill label="Verified" tone="premium" leading="★" />
                ) : selected.distanceMeters != null ? (
                  <Pill label={formatDistance(selected.distanceMeters)} tone="neutral" />
                ) : null}
              </View>

              {/* Job title */}
              <View style={{ gap: 2 }}>
                <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
                  {selected.title}
                </Text>
                <Text variant="footnote" tone="secondary" numberOfLines={2}>
                  {selected.location.address ||
                    [selected.location.area, selected.location.city]
                      .filter(Boolean)
                      .join(', ')}
                </Text>
              </View>

              {/* Pills row — pay, type, hours, distance, applicants */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                <Pill label={formatPay(selected.pay)} tone="warning" />
                <Pill label={formatType(selected.type)} tone="neutral" />
                {selected.schedule?.hoursPerDay != null && (
                  <Pill
                    label={`${selected.schedule.hoursPerDay} hr/day`}
                    tone="neutral"
                  />
                )}
                {/* Show distance pill here too if we already used the slot
                    above for the verified badge. */}
                {selected.employer?.isVerified && selected.distanceMeters != null && (
                  <Pill label={formatDistance(selected.distanceMeters)} tone="neutral" />
                )}
                {selected.applicantsCount > 0 && (
                  <Pill
                    label={`${selected.applicantsCount} applicant${
                      selected.applicantsCount === 1 ? '' : 's'
                    }`}
                    tone="info"
                  />
                )}
              </View>

              {/* Top skills — first 4 only to keep the card glanceable */}
              {selected.skills.length > 0 && (
                <View style={{ gap: spacing.xs }}>
                  <Text
                    variant="caption"
                    tone="tertiary"
                    style={{ letterSpacing: 1.0 }}
                  >
                    SKILLS
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                    {selected.skills.slice(0, 4).map((s) => (
                      <Pill key={s} label={s} tone="neutral" />
                    ))}
                    {selected.skills.length > 4 && (
                      <Pill
                        label={`+${selected.skills.length - 4} more`}
                        tone="neutral"
                      />
                    )}
                  </View>
                </View>
              )}

              <Button
                label="View full details"
                onPress={() => {
                  navigation.navigate('JobDetail', { jobId: selected.id });
                }}
              />
            </View>
          </Card>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Tracking marker wrapper ─────────────────────────────────────────────────

/**
 * Wraps Marker with a "track changes for the first paint, then settle"
 * pattern. react-native-maps' Android implementation can render an empty
 * marker if the custom child View hasn't measured by the time the native
 * marker is added to the map — this fixes that without forcing all
 * markers to track changes forever (which would tank framerate).
 */
function TrackingMarker({
  latitude,
  longitude,
  onPress,
  isActive,
  children,
}: {
  latitude: number;
  longitude: number;
  onPress: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  // The native Android marker captures the custom child as a bitmap. If it
  // captures *before* the price label has finished measuring, the chip is
  // frozen too narrow and the text is clipped ("₹1.5" instead of
  // "₹1.5k/day"). So we keep tracksViewChanges on until the content has
  // actually laid out, then freeze a couple of frames later — with a
  // generous timeout as a safety net. Re-armed whenever the pin's active
  // (scaled) state flips so the larger bitmap is re-captured cleanly.
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 1500);
    return () => clearTimeout(t);
  }, [isActive]);

  const handleContentLayout = () => {
    // Content has measured — let one more paint settle, then stop tracking
    // so the frozen bitmap is the fully-sized one.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setTracking(false)),
    );
  };

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={onPress}
      tracksViewChanges={tracking}
      anchor={{ x: 0.5, y: 1 }}
      // Slight upward offset so the tail's tip sits exactly on the geo point.
      centerOffset={{ x: 0, y: -8 }}
    >
      <View onLayout={handleContentLayout}>{children}</View>
    </Marker>
  );
}

// ─── Salary label pin ────────────────────────────────────────────────────────

interface SalaryPinProps {
  pay: PublicJob['pay'];
  type: PublicJob['type'];
  verified?: boolean;
  active: boolean;
}

/**
 * Airbnb-style pricing pin: a chip floating above its anchor point,
 * showing the pay (the most magnetic info on the map). Tail underneath
 * points to the actual location.
 *
 * Earlier version had two columns (pay + type abbreviation) separated
 * by a divider — that layout got truncated on Android because the native
 * Marker captured a bitmap before the flex row finished sizing. This
 * version is a single-column label so the chip's width is its content's
 * width with no internal flex, eliminating the truncation.
 */
function SalaryPin({ pay, verified, active }: SalaryPinProps) {
  const fill = verified ? jade[500] : coral[500];
  const ring = champagne[300];
  const label = formatPayCompact(pay);

  return (
    <View
      style={{
        alignItems: 'center',
        paddingBottom: 2,
        // Padding around the whole marker bitmap so the shadow / glow
        // doesn't get clipped by Android's marker capture rect.
        paddingHorizontal: 4,
        paddingTop: 4,
        transform: [{ scale: active ? 1.08 : 1 }],
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: radii.pill,
          backgroundColor: fill,
          borderWidth: active || verified ? 1 : 0.5,
          borderColor: ring,
          shadowColor: fill,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.55,
          shadowRadius: 8,
          elevation: 6,
          // minWidth keeps short labels (e.g. ₹50/hr) from looking cramped
          // and gives Android a stable size to capture.
          minWidth: 56,
          alignItems: 'center',
        }}
      >
        <Text
          // Single-line label, never wraps, never shrinks.
          numberOfLines={1}
          allowFontScaling={false}
          style={{
            color: '#FFFDF7',
            fontSize: 13,
            fontWeight: '600',
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      </View>

      {/* Tail / anchor — small triangle pointing down to the geo point */}
      <View
        style={{
          marginTop: -1,
          width: 0,
          height: 0,
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderTopWidth: 7,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: fill,
        }}
      />
    </View>
  );
}

function formatPayCompact(pay: PublicJob['pay']): string {
  // amounts are stored in the smallest unit (paise for INR). Convert to
  // major unit then compact so the label never shows ambiguous numbers
  // like "15" for ₹15,000.
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : '';
  const compact = (n: number) => {
    const v = Math.round(n / minor);
    if (v >= 100_000) {
      const lakhs = v / 100_000;
      return `${lakhs % 1 === 0 ? lakhs : lakhs.toFixed(1)}L`;
    }
    if (v >= 1000) {
      const k = v / 1000;
      return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
    }
    return v.toString();
  };
  const periodMap = {
    hour: '/hr',
    day: '/day',
    week: '/wk',
    month: '/mo',
    fixed: '',
  } as const;
  const lo = compact(pay.amount);
  const hi = pay.amountMax ? compact(pay.amountMax) : null;
  return hi
    ? `${symbol}${lo}–${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}

function formatTypeCompact(t: PublicJob['type']): string {
  return (
    {
      full_time: 'F/T',
      part_time: 'P/T',
      gig: 'Gig',
      shift: 'Shift',
      contract: 'Contract',
    } as const
  )[t];
}

// ─── Format helpers (local copies — fine for Phase 2 v1) ─────────────────────

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatPay(pay: PublicJob['pay']): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
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
