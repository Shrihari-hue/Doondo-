/**
 * WorkersMapView — map alternative to the available-workers list.
 *
 * The employer-side mirror of the seeker's JobsMapView. Renders one pin
 * per worker who is broadcasting availability nearby (the `/availabilities
 * /nearby` beacon feed). Tapping a pin opens a peeking bottom card with
 * the worker's name, distance, trades and rating, plus two actions:
 *   - Send hiring request → invite the worker to one of your jobs
 *   - Call → the gated one-tap phone reveal
 *
 * react-native-maps uses Google Maps on Android and Apple Maps on iOS.
 * The Android custom-marker bitmap race is handled by TrackingMarker,
 * copied from JobsMapView.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';

import { coral, jade, champagne, spacing, radii } from '@doondo/tokens';
import { Text, Card, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { prettifySkill, tradeEmoji } from '@/lib/trades';
import { DOONDO_DARK_MAP_STYLE } from '@/screens/seeker/jobs-map/mapStyle';
import type { NearbyAvailability } from '@/api/availability.api';

interface Props {
  coords: { lat: number; lng: number };
  workers: NearbyAvailability[];
  /** km — sizes the initial region + the search-radius ring. */
  radiusKm?: number;
  /** Open the send-hiring-request flow for this worker. */
  onHire: (worker: NearbyAvailability) => void;
  /** Trigger the gated one-tap call. */
  onCall: (worker: NearbyAvailability) => void;
  /** True while a call reveal is in flight. */
  calling?: boolean;
}

export function WorkersMapView({
  coords,
  workers,
  radiusKm = 15,
  onHire,
  onCall,
  calling = false,
}: Props) {
  const { theme, scheme } = useTheme();
  const mapRef = useRef<MapView>(null);

  const [selected, setSelected] = useState<NearbyAvailability | null>(null);
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(40)).current;

  // Keep the selected worker reference fresh as the list refetches.
  useEffect(() => {
    if (!selected) return;
    const match = workers.find((w) => w.id === selected.id);
    if (!match) setSelected(null);
    else if (match !== selected) setSelected(match);
  }, [workers, selected]);

  // Fit the camera to every pin + the employer's own position.
  useEffect(() => {
    if (!mapRef.current) return;
    if (workers.length === 0) {
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
      ...workers.map((w) => ({
        latitude: w.location.coordinates[1],
        longitude: w.location.coordinates[0],
      })),
    ];
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 80, right: 60, bottom: 280, left: 60 },
      animated: true,
    });
  }, [workers, coords.lat, coords.lng, radiusKm]);

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

  const initialDelta = Math.min(0.6, Math.max(0.04, radiusKm / 55));
  const initialRegion: Region = {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: initialDelta,
    longitudeDelta: initialDelta,
  };

  function onMarkerPress(worker: NearbyAvailability) {
    haptic('selection');
    setSelected(worker);
    mapRef.current?.animateToRegion(
      {
        latitude: worker.location.coordinates[1] - 0.005,
        longitude: worker.location.coordinates[0],
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
        customMapStyle={scheme === 'dark' ? DOONDO_DARK_MAP_STYLE : []}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPress={() => setSelected(null)}
      >
        {/* Search-radius ring. */}
        <Circle
          center={{ latitude: coords.lat, longitude: coords.lng }}
          radius={radiusKm * 1000}
          strokeWidth={1}
          strokeColor="rgba(184, 153, 104, 0.45)"
          fillColor="rgba(200, 83, 58, 0.06)"
        />

        {workers.map((w) => {
          const isActive = selected?.id === w.id;
          return (
            <TrackingMarker
              key={w.id}
              latitude={w.location.coordinates[1]}
              longitude={w.location.coordinates[0]}
              onPress={() => onMarkerPress(w)}
              isActive={isActive}
            >
              <WorkerPin worker={w} active={isActive} />
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
          <Card premium={selected.seeker.isVerified}>
            <View style={{ gap: spacing.md }}>
              {/* Worker header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <Avatar
                  name={selected.seeker.name}
                  photoUrl={selected.seeker.photoUrl}
                  size={48}
                  premium={selected.seeker.isVerified}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                    {selected.seeker.name}
                    {selected.seeker.isVerified ? '  ✓' : ''}
                  </Text>
                  <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                    {formatDistance(selected.distanceMeters)}
                    {selected.location.area ? ` · ${selected.location.area}` : ''}
                  </Text>
                  {selected.seeker.rating ? (
                    <Stars
                      score={selected.seeker.rating.avg}
                      count={selected.seeker.rating.count}
                      compact
                    />
                  ) : null}
                </View>
              </View>

              {/* Trades */}
              {selected.tradesAvailable.length > 0 && (
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
                >
                  {selected.tradesAvailable.slice(0, 4).map((slug) => {
                    const emoji = tradeEmoji(slug);
                    return (
                      <View
                        key={slug}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 3,
                          borderRadius: radii.pill,
                          backgroundColor: theme.bg.canvas,
                          borderWidth: 0.5,
                          borderColor: theme.border.subtle,
                        }}
                      >
                        {emoji ? <Text style={{ fontSize: 12 }}>{emoji}</Text> : null}
                        <Text variant="caption" weight="medium">
                          {prettifySkill(slug)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Note */}
              {selected.note ? (
                <Text variant="footnote" tone="secondary" style={{ fontStyle: 'italic' }}>
                  “{selected.note}”
                </Text>
              ) : null}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable
                  onPress={() => {
                    haptic('selection');
                    onHire(selected);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Send a hiring request to ${selected.seeker.name}`}
                  style={({ pressed }) => ({
                    flex: 1,
                    backgroundColor: theme.brand.primary,
                    paddingVertical: 12,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: theme.text.onBrand, fontSize: 14, fontWeight: '700' }}>
                    Send hiring request
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    haptic('selection');
                    onCall(selected);
                  }}
                  disabled={calling}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${selected.seeker.name}`}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: spacing.lg,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.border.default,
                    opacity: calling ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: theme.text.primary,
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    {calling ? '…' : 'Call'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Tracking marker wrapper (Android bitmap race fix) ───────────────────────

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
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 1500);
    return () => clearTimeout(timer);
  }, [isActive]);

  const handleContentLayout = () => {
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
      centerOffset={{ x: 0, y: -8 }}
    >
      <View onLayout={handleContentLayout}>{children}</View>
    </Marker>
  );
}

// ─── Worker pin ──────────────────────────────────────────────────────────────

function WorkerPin({
  worker,
  active,
}: {
  worker: NearbyAvailability;
  active: boolean;
}) {
  const verified = worker.seeker.isVerified;
  const fill = verified ? jade[500] : coral[500];
  const ring = champagne[300];
  const firstTrade = worker.tradesAvailable[0];
  const emoji = firstTrade ? tradeEmoji(firstTrade) : null;

  return (
    <View
      style={{
        alignItems: 'center',
        paddingBottom: 2,
        paddingHorizontal: 4,
        paddingTop: 4,
        transform: [{ scale: active ? 1.12 : 1 }],
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: fill,
          borderWidth: active || verified ? 1.5 : 0.75,
          borderColor: ring,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: fill,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.55,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Text allowFontScaling={false} style={{ fontSize: 16 }}>
          {emoji ?? '👷'}
        </Text>
      </View>
      {/* Tail */}
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

function formatDistance(m: number): string {
  return m < 1000 ? `${m} m away` : `${(m / 1000).toFixed(1)} km away`;
}
