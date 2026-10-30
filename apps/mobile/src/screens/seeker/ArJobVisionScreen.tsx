/**
 * ArJobVisionScreen — "Point" step of Look Inside.
 *
 * Live camera with one glass bubble per nearby business ("Third Wave
 * Coffee · 3 openings · 30 m"), anchored in the business's real direction
 * and tilt-aware (see ./ar/arEngine). Tap a business → its Look Inside
 * portfolio opens. Category chips filter by kind of work; the radar shows
 * everything around you, including what's behind.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { radii } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { jobsApi } from '@/api/jobs.api';
import { portfolioApi } from '@/api/portfolio.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { classifyJob, fmtDistance, type JobCategory, type McIcon } from '@/lib/jobCategory';
import { Brand, CircleButton, Thumb } from './workplace/shared';
import {
  bearingRad,
  distanceM,
  focalFor,
  groundPoint,
  project,
  virtualGround,
  wrapPi,
  useArPose,
  type ScreenPt,
} from './ar/arEngine';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const RANGE_M = 3000;
const MAX_BUBBLES = 7;
const CHIPS: ReadonlyArray<JobCategory | 'all'> = ['all', 'food', 'retail', 'healthcare', 'transport', 'services'];
const GLOWS = ['#FFB23F', '#FFC56B', '#33E0A1', '#A98BFF', '#4D8DFF', '#FF6BA8'] as const;

interface Business {
  key: string;
  employerId: string | null;
  name: string;
  photoUrl: string | null;
  icon: McIcon;
  categories: Set<JobCategory>;
  jobs: PublicJob[];
  openings: number;
  dist: number;
  bearing: number;
  glow: string;
}

export function ArJobVisionScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { width: W, height: H } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const { me, pose, locError } = useArPose();
  const [chip, setChip] = useState<JobCategory | 'all'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);

  const jobsQ = useQuery({
    queryKey: ['ar-jobs', me?.lat.toFixed(3), me?.lng.toFixed(3)],
    queryFn: () => jobsApi.nearby({ lat: me!.lat, lng: me!.lng, radius: RANGE_M, limit: 50 }), // server max is 50
    enabled: Boolean(me),
    staleTime: 60_000,
  });

  // Group jobs into businesses (one bubble per employer, at its nearest job).
  const allBusinesses: Business[] = useMemo(() => {
    if (!me) return [];
    const map = new Map<string, Business>();
    for (const job of jobsQ.data?.jobs ?? []) {
      if (!job.location?.coordinates) continue;
      const [lng, lat] = job.location.coordinates;
      const target = { lat, lng };
      const dist = distanceM(me, target);
      if (dist > RANGE_M) continue;
      const key = job.employer?.id ?? `job-${job.id}`;
      const cls = classifyJob(job);
      const b = map.get(key);
      if (!b) {
        map.set(key, {
          key,
          employerId: job.employer?.id ?? null,
          name: job.employer?.companyName || job.employer?.name || job.title,
          photoUrl: job.employer?.photoUrl ?? null,
          icon: cls.icon,
          categories: new Set([cls.category]),
          jobs: [job],
          openings: Math.max(1, job.headcount || 1),
          dist,
          bearing: bearingRad(me, target),
          glow: GLOWS[0],
        });
      } else {
        b.jobs.push(job);
        b.categories.add(cls.category);
        b.openings += Math.max(1, job.headcount || 1);
        if (dist < b.dist) Object.assign(b, { dist, bearing: bearingRad(me, target) });
      }
    }
    return [...map.values()].sort((a, b) => a.dist - b.dist).map((b, i) => ({ ...b, glow: GLOWS[i % GLOWS.length]! }));
  }, [jobsQ.data, me]);

  const businesses = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allBusinesses.filter(
      (b) =>
        (chip === 'all' || b.categories.has(chip)) &&
        (!s || b.name.toLowerCase().includes(s) || b.jobs.some((j) => j.title.toLowerCase().includes(s))),
    );
  }, [allBusinesses, chip, search]);

  // Which businesses have a Look Inside tour (cover photo + camera badge).
  const employerIds = useMemo(() => allBusinesses.map((b) => b.employerId).filter(Boolean) as string[], [allBusinesses]);
  const summariesQ = useQuery({
    queryKey: ['portfolio-summaries', employerIds.join(',')],
    queryFn: () => portfolioApi.summaries(employerIds),
    enabled: employerIds.length > 0,
    staleTime: 5 * 60_000,
  });
  const tours = useMemo(() => new Map((summariesQ.data?.summaries ?? []).map((s) => [s.employerId, s])), [summariesQ.data]);

  // ── Layout ──
  const focal = focalFor(H);
  const chipsBottom = insets.bottom + 18;
  const controlsTop = H - chipsBottom - 44 - 14 - 150;
  const topLimit = insets.top + 80 + (searchOpen ? 52 : 0);

  const placed = useMemo(() => {
    if (!pose) return [];
    const rects: Array<{ l: number; r: number; t: number; b: number }> = [];
    const out: Array<{ b: Business; ring: ScreenPt; box: { x: number; y: number; w: number; h: number }; near: boolean }> = [];
    businesses.forEach((b, i) => {
      if (out.length >= MAX_BUBBLES) return;
      const ring = project(groundPoint(b.bearing, virtualGround(b.dist)), pose, W, H, focal);
      if (!ring || ring.x < -100 || ring.x > W + 100) return;
      const near = i === 0;
      const s = Math.max(0.74, Math.min(1, 1.06 - 0.22 * Math.sqrt(b.dist / 1000)));
      const w = (near ? 218 : 190) * s;
      const h = (near ? 70 : 58) * s;
      let stem = (near ? 190 : 130) * s * s;
      const at = (len: number) => ({
        x: Math.max(w / 2 + 10, Math.min(W - w / 2 - 10, ring.x + Math.sin(pose.roll) * (len + h / 2))),
        y: ring.y - Math.cos(pose.roll) * (len + h / 2),
      });
      let c = at(stem);
      for (let k = 0; k < 8; k++) {
        const hit = rects.find((r) => c.x - w / 2 < r.r && c.x + w / 2 > r.l && c.y - h / 2 < r.b && c.y + h / 2 > r.t);
        if (!hit) break;
        stem += c.y + h / 2 - hit.t + 8;
        c = at(stem);
      }
      if (c.y - h / 2 < topLimit || c.y > controlsTop) return;
      rects.push({ l: c.x - w / 2, r: c.x + w / 2, t: c.y - h / 2, b: c.y + h / 2 });
      out.push({ b, ring, box: { x: c.x, y: c.y, w, h }, near });
    });
    return out;
  }, [businesses, pose, W, H, focal, topLimit, controlsTop]);

  const turnHint = useMemo(() => {
    if (!pose || placed.length > 0 || businesses.length === 0) return null;
    const nearest = businesses[0]!;
    const rel = wrapPi(nearest.bearing - pose.yaw);
    return t(rel < 0 ? 'ar.turn_left' : 'ar.turn_right', { title: nearest.name, dist: fmtDistance(nearest.dist) });
  }, [pose, placed.length, businesses, t]);

  const status = locError
    ? t('ar.location_needed')
    : !me || !pose
      ? t('ar.finding')
      : jobsQ.isError
        ? t('ar.load_error')
        : jobsQ.isSuccess && businesses.length === 0
        ? t(chip === 'all' && !search ? 'ar.no_jobs' : 'ar.no_jobs_category', { km: RANGE_M / 1000 })
        : null;

  const open = (b: Business) => {
    haptic('medium');
    if (b.employerId) navigation.navigate('LookInside', { employerId: b.employerId, distanceM: Math.round(b.dist) });
    else navigation.navigate('JobDetail', { jobId: b.jobs[0]!.id });
  };

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: '#14110E' }}>
        {perm?.granted ? (
          <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
        ) : (
          <LinearGradient colors={['#2A241E', '#14110E']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
          locations={[0, 0.2, 0.65, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Stems + ground rings */}
        {placed.map(({ b, ring, box, near }) => (
          <View key={`g-${b.key}`} pointerEvents="none">
            <Stem from={ring} to={{ x: box.x, y: box.y + box.h / 2 }} color={b.glow} width={near ? 2.5 : 1.5} />
            <GroundRing x={ring.x} y={ring.y} color={b.glow} size={near ? 92 : 56} roll={pose?.roll ?? 0} />
          </View>
        ))}

        {/* Business bubbles — far first so near ones sit on top */}
        {[...placed].reverse().map(({ b, box, near }) => (
          <BusinessBubble key={b.key} b={b} box={box} near={near} hasTour={b.employerId ? (tours.get(b.employerId)?.photoCount ?? 0) > 0 : false} onPress={() => open(b)} t={t} />
        ))}

        {/* Header */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('ar.back_a11y')} style={{ flex: 1 }}>
            <Brand sub={t('ar.brand_sub')} />
          </Pressable>
          <CircleButton icon="map" label={t('ar.list_a11y')} onPress={() => navigation.goBack()} />
          <CircleButton
            icon={searchOpen ? 'x' : 'search'}
            label={t('ar.search_a11y')}
            onPress={() => {
              haptic('selection');
              if (searchOpen) setSearch('');
              setSearchOpen((v) => !v);
            }}
            style={{ marginLeft: 10 }}
          />
        </View>
        {searchOpen && (
          <View style={{ position: 'absolute', top: insets.top + 64, left: 16, right: 16, height: 46, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }}>
            <BlurView intensity={40} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
              <Feather name="search" size={18} color="#FFFFFF" />
              <TextInput
                autoFocus
                value={search}
                onChangeText={setSearch}
                placeholder={t('ar.search_placeholder')}
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={{ flex: 1, color: '#FFFFFF', fontSize: 15 }}
                returnKeyType="search"
              />
            </View>
          </View>
        )}

        {(status || turnHint) && (
          <View pointerEvents="none" style={{ position: 'absolute', top: H * 0.42, left: 24, right: 24, alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(15,13,11,0.62)', borderRadius: radii.pill, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center' }}>{status ?? turnHint}</Text>
            </View>
          </View>
        )}

        {/* Radar + list */}
        <View style={{ position: 'absolute', left: 14, top: controlsTop }}>
          <Radar businesses={businesses} yaw={pose?.yaw ?? 0} />
        </View>
        <View style={{ position: 'absolute', right: 16, top: controlsTop + 86 }}>
          <CircleButton icon="list" label={t('ar.list_a11y')} onPress={() => navigation.goBack()} style={{ width: 56, height: 56, borderRadius: 28 }} />
        </View>

        {/* Category chips */}
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: chipsBottom, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)' }}>
          <BlurView intensity={40} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,18,16,0.35)' }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4, gap: 2 }}>
            {CHIPS.map((c) => {
              const active = chip === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    haptic('selection');
                    setChip(c);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', backgroundColor: active ? '#FFFFFF' : 'transparent' }}
                >
                  <Text style={{ color: active ? '#111111' : '#FFFFFF', fontSize: 14, fontWeight: active ? '600' : '400' }}>{t(`ar.cat.${c}`)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Screen>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function BusinessBubble({
  b,
  box,
  near,
  hasTour,
  onPress,
  t,
}: {
  b: Business;
  box: { x: number; y: number; w: number; h: number };
  near: boolean;
  hasTour: boolean;
  onPress: () => void;
  t: TFn;
}) {
  const s = box.h / (near ? 70 : 58);
  const openings = t(b.openings === 1 ? 'ar.openings_one' : 'ar.openings', { n: b.openings });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${b.name}, ${openings}, ${fmtDistance(b.dist)}${hasTour ? `, ${t('ar.has_tour_a11y')}` : ''}`}
      style={{ position: 'absolute', left: box.x - box.w / 2, top: box.y - box.h / 2, width: box.w, height: box.h }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 16 * s,
          backgroundColor: 'rgba(38,32,26,0.58)',
          borderWidth: near ? 1.2 : 0.8,
          borderColor: near ? 'rgba(255,214,150,0.85)' : 'rgba(255,255,255,0.5)',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10 * s,
          gap: 10 * s,
          shadowColor: b.glow,
          shadowOpacity: near ? 0.6 : 0.2,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <View>
          <Thumb uri={b.photoUrl} icon={b.icon} size={(near ? 42 : 34) * s} radius={(near ? 21 : 17) * s} ring={near} />
          {hasTour && (
            <View style={{ position: 'absolute', right: -4, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="camera" size={11} color="#111111" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: (near ? 16 : 14) * s, fontWeight: '600' }}>{b.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11.5 * s, flex: 1 }} numberOfLines={1}>{openings}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11.5 * s }}>{fmtDistance(b.dist)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function Stem({ from, to, color, width }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; width: number }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.x - from.x, from.y - to.y);
  return (
    <View
      style={{
        position: 'absolute',
        left: (from.x + to.x) / 2 - width / 2,
        top: (from.y + to.y) / 2 - length / 2,
        width,
        height: length,
        transform: [{ rotate: `${angle}rad` }],
        shadowColor: color,
        shadowOpacity: 0.9,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <LinearGradient colors={['#FFFFFF', color]} style={{ flex: 1, borderRadius: width }} />
    </View>
  );
}

function GroundRing({ x, y, color, size, roll }: { x: number; y: number; color: string; size: number; roll: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate: `${roll}rad` }, { scaleY: 0.3 }],
      }}
    >
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 4, borderColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 }} />
      <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size, borderWidth: 2, borderColor: color, opacity: 0.6 }} />
    </View>
  );
}

function Radar({ businesses, yaw }: { businesses: Business[]; yaw: number }) {
  const SIZE = 142;
  const R = SIZE / 2;
  const at = (rel: number, r: number) => ({ x: R + r * Math.sin(rel), y: R - r * Math.cos(rel) });
  const cardinals: Array<[string, number]> = [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]];
  return (
    <View style={{ width: SIZE, height: SIZE, borderRadius: R, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' }}>
      <BlurView intensity={30} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(14,12,10,0.45)' }} />
      <View style={{ position: 'absolute', left: R * 0.45, top: R * 0.45, width: R * 1.1, height: R * 1.1, borderRadius: R, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)' }} />
      <View style={{ position: 'absolute', left: R - 0.25, top: 8, width: 0.5, height: SIZE - 16, backgroundColor: 'rgba(255,255,255,0.12)' }} />
      <View style={{ position: 'absolute', top: R - 0.25, left: 8, height: 0.5, width: SIZE - 16, backgroundColor: 'rgba(255,255,255,0.12)' }} />
      {cardinals.map(([label, bearing]) => {
        const p = at(bearing - yaw, R - 13);
        return (
          <Text key={label} style={{ position: 'absolute', left: p.x - 6, top: p.y - 8, width: 12, textAlign: 'center', color: '#FFFFFF', fontSize: 11 }}>
            {label}
          </Text>
        );
      })}
      {businesses.map((b) => {
        const pos = at(b.bearing - yaw, (R - 26) * Math.min(1, Math.sqrt(b.dist / RANGE_M)) + 8);
        return (
          <View
            key={b.key}
            style={{
              position: 'absolute',
              left: pos.x - 5,
              top: pos.y - 5,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: b.glow,
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.85)',
              shadowColor: b.glow,
              shadowOpacity: 1,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        );
      })}
      <View style={{ position: 'absolute', left: R - 14, top: R - 16 }}>
        <MaterialCommunityIcons name="navigation" size={28} color="#FFFFFF" />
      </View>
    </View>
  );
}
