/**
 * ArJobVisionScreen — "point your phone down the street and see the jobs
 * that way". Camera passthrough (expo-camera) with job cards placed by
 * compass bearing: a job directly ahead sits in the middle; ones to your
 * left/right slide to the edges; nearer jobs sit lower and larger.
 *
 * Works without camera permission too — it falls back to a dark compass
 * view with the same cards. Uses Location.watchHeadingAsync for direction.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
const HALF_FOV = 30; // degrees either side of straight ahead
const RADIUS_M = 3000;

function bearing(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) - Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function ArJobVisionScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { width, height } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [locError, setLocError] = useState(false);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocError(true); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      sub = await Location.watchHeadingAsync((h) => setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading));
    })().catch(() => setLocError(true));
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);

  const jobsQ = useQuery({
    queryKey: ['ar-jobs', me?.lat.toFixed(3), me?.lng.toFixed(3)],
    queryFn: () => jobsApi.nearby({ lat: me!.lat, lng: me!.lng, radius: RADIUS_M, limit: 40 }),
    enabled: Boolean(me),
    staleTime: 60_000,
  });

  const placed = useMemo(() => {
    if (!me || heading == null) return [];
    return (jobsQ.data?.jobs ?? [])
      .map((j: PublicJob) => {
        const c = j.location?.coordinates;
        if (!c) return null;
        const target = { lat: c[1], lng: c[0] };
        let rel = bearing(me, target) - heading;
        rel = ((rel + 540) % 360) - 180;
        if (Math.abs(rel) > HALF_FOV) return null;
        const d = distanceM(me, target);
        return { job: j, rel, d };
      })
      .filter((x): x is { job: PublicJob; rel: number; d: number } => x !== null)
      .sort((a, b) => b.d - a.d) // far first, so near cards draw on top
      .slice(-8);
  }, [jobsQ.data, me, heading]);

  const cardW = 190;
  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: '#0B1220' }}>
        {perm?.granted ? <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" /> : null}

        {placed.map(({ job, rel, d }) => {
          const x = width / 2 + (rel / HALF_FOV) * (width / 2) - cardW / 2;
          const nearness = 1 - Math.min(1, d / RADIUS_M);
          const y = height * (0.22 + 0.45 * nearness);
          const scale = 0.8 + 0.35 * nearness;
          return (
            <Pressable key={job.id} onPress={() => { haptic('selection'); navigation.navigate('JobDetail', { jobId: job.id }); }}
              style={{ position: 'absolute', left: Math.max(4, Math.min(width - cardW - 4, x)), top: y, width: cardW, transform: [{ scale }],
                backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: radii.lg, padding: spacing.sm }}>
              <Text variant="footnote" weight="semibold" numberOfLines={1} style={{ color: '#111827' }}>{job.title}</Text>
              <Text variant="caption" style={{ color: '#374151' }}>
                {job.pay?.amount ? `₹${Math.round(job.pay.amount / 100).toLocaleString('en-IN')}/${job.pay.period} · ` : ''}
                {d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`}
              </Text>
            </Pressable>
          );
        })}

        <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 20 }}>←</Text>
          </Pressable>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text variant="footnote" style={{ color: '#FFFFFF' }} numberOfLines={2}>
              {locError
                ? t('ar.location_needed')
                : heading == null || !me
                  ? t('ar.finding')
                  : t('ar.hint', { n: placed.length, total: jobsQ.data?.jobs.length ?? 0 })}
            </Text>
          </View>
        </View>
        {heading != null && (
          <View style={{ position: 'absolute', bottom: insets.bottom + spacing.xl, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text variant="caption" style={{ color: '#FFFFFF' }}>🧭 {Math.round(heading)}°{!perm?.granted ? ` · ${t('ar.no_camera')}` : ''}</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
