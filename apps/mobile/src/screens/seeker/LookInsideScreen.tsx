/**
 * LookInsideScreen — the "storefront becomes a portfolio" view.
 *
 * Full-screen photos of the business (swipe or use the filmstrip). Each
 * photo can carry role pins the owner placed — "Barista · 2 openings"
 * right where that person works — and tapping one opens the workplace
 * job sheet for that vacancy. The workplace video, when present, is the
 * last item of the filmstrip.
 *
 * Businesses without photos still get a useful screen: the employer and
 * their open jobs.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, Text } from '@/components';
import { resolveMediaUrl } from '@/api/client';
import { portfolioApi, type PortfolioPhoto } from '@/api/portfolio.api';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { classifyJob, formatPay } from '@/lib/jobCategory';
import { Brand, CircleButton, GLASS, Thumb, WHITE_DIM, coverPoint, useImageSize } from './workplace/shared';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type R = RouteProp<AppStackParamList, 'LookInside'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

type Item = { type: 'photo'; photo: PortfolioPhoto } | { type: 'video'; url: string; durationSeconds: number };

export function LookInsideScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<R>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const t = useTranslate();

  const q = useQuery({
    queryKey: ['portfolio', params.employerId],
    queryFn: () => portfolioApi.get(params.employerId),
    staleTime: 60_000,
  });
  const employer = q.data?.employer;
  const portfolio = q.data?.portfolio ?? null;
  const jobs = q.data?.jobs ?? [];
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const name = employer?.companyName || employer?.name || '';
  const openings = jobs.reduce((n, j) => n + Math.max(1, j.headcount || 1), 0);

  const items: Item[] = useMemo(() => {
    const list: Item[] = (portfolio?.photos ?? []).map((photo) => ({ type: 'photo', photo }));
    if (portfolio?.video) list.push({ type: 'video', url: portfolio.video.url, durationSeconds: portfolio.video.durationSeconds });
    return list;
  }, [portfolio]);

  const initialIndex = Math.max(0, items.findIndex((i) => i.type === 'photo' && i.photo.id === params.photoId));
  const [index, setIndex] = useState(initialIndex);
  const [jobsOpen, setJobsOpen] = useState(false);
  const pager = useRef<FlatList<Item>>(null);
  const strip = useRef<ScrollView>(null);

  const openJob = (job: PublicJob) => {
    haptic('selection');
    navigation.navigate('WorkplaceJob', { jobId: job.id, employerId: params.employerId, distanceM: params.distanceM });
  };

  const goTo = (i: number) => {
    haptic('selection');
    setIndex(i);
    pager.current?.scrollToIndex({ index: i, animated: true });
  };

  const STRIP_H = 132;

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: '#14110E' }}>
        {items.length > 0 ? (
          <FlatList
            ref={pager}
            data={items}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
            keyExtractor={(it, i) => (it.type === 'photo' ? it.photo.id : `video-${i}`)}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / W);
              setIndex(i);
              strip.current?.scrollTo({ x: Math.max(0, i * 98 - W / 2 + 49), animated: true });
            }}
            renderItem={({ item, index: i }) =>
              item.type === 'photo' ? (
                <PhotoPage photo={item.photo} W={W} H={H} jobsById={jobsById} onJob={openJob} t={t} />
              ) : (
                <VideoPage url={item.url} W={W} H={H} active={i === index} />
              )
            }
          />
        ) : (
          <LinearGradient colors={['#3A2E22', '#14110E']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        )}

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 140 }}
        />

        {/* Header */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 16, flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Brand sub={t('ar.brand_sub')} />
            {employer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', flexShrink: 1 }}>{name}</Text>
                {employer.isVerified && <MaterialCommunityIcons name="check-decagram" size={16} color="#7CC4FF" />}
              </View>
            )}
          </View>
          <CircleButton icon="x" label={t('look_inside.close_a11y')} onPress={() => navigation.goBack()} />
        </View>

        {q.isLoading && (
          <View style={{ position: 'absolute', top: H * 0.45, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: WHITE_DIM }}>{t('look_inside.loading')}</Text>
          </View>
        )}
        {q.isError && (
          <View style={{ position: 'absolute', top: H * 0.42, left: 24, right: 24, alignItems: 'center', gap: 12 }}>
            <Text style={{ color: '#FFFFFF', textAlign: 'center' }}>{t('look_inside.load_error')}</Text>
            <Pressable onPress={() => void q.refetch()} style={[GLASS, { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 }]}>
              <Text style={{ color: '#FFFFFF' }}>{t('look_inside.retry')}</Text>
            </Pressable>
          </View>
        )}

        {/* No photos yet → jobs list front and centre */}
        {q.isSuccess && items.length === 0 && (
          <View style={{ position: 'absolute', top: insets.top + 130, left: 16, right: 16, bottom: insets.bottom + 16 }}>
            <Text style={{ color: WHITE_DIM, fontSize: 14, marginBottom: 14 }}>{t('look_inside.no_photos')}</Text>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {jobs.map((j) => (
                <JobRow key={j.id} job={j} photoUrl={employer?.photoUrl ?? null} onPress={() => openJob(j)} t={t} />
              ))}
              {jobs.length === 0 && <Text style={{ color: '#FFFFFF' }}>{t('look_inside.no_jobs')}</Text>}
            </ScrollView>
          </View>
        )}

        {/* Bottom: jobs pill + filmstrip */}
        {items.length > 0 && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: STRIP_H + 120 + insets.bottom }} />
            {jobs.length > 0 && (
              <Pressable
                onPress={() => setJobsOpen(true)}
                accessibilityRole="button"
                style={[GLASS, { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 40, borderRadius: 20, marginBottom: 12 }]}
              >
                <MaterialCommunityIcons name="briefcase-outline" size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 14 }}>
                  {t(openings === 1 ? 'look_inside.jobs_here_one' : 'look_inside.jobs_here', { n: openings })}
                </Text>
                <Feather name="chevron-up" size={16} color="#FFFFFF" />
              </Pressable>
            )}
            <View style={{ backgroundColor: 'rgba(20,17,14,0.82)', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 14, paddingBottom: insets.bottom + 12 }}>
              <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
                {items.map((it, i) => {
                  const active = i === index;
                  const uri = it.type === 'photo' ? it.photo.url : (portfolio?.photos[0]?.url ?? null);
                  const label =
                    it.type === 'photo' ? it.photo.caption || t(`look_inside.kind.${it.photo.kind}`) : t('look_inside.kind.video');
                  return (
                    <Pressable key={i} onPress={() => goTo(i)} accessibilityRole="button" accessibilityLabel={label} style={{ width: 88, alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden', borderWidth: active ? 2.5 : 0.5, borderColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.3)' }}>
                        {uri ? <Image source={{ uri: resolveMediaUrl(uri) ?? undefined }} style={{ width: '100%', height: '100%' }} /> : null}
                        {it.type === 'video' && (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                            <MaterialCommunityIcons name="play-circle" size={34} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={{ color: active ? '#FFFFFF' : WHITE_DIM, fontSize: 12, fontWeight: active ? '600' : '400' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Jobs sheet */}
        {jobsOpen && (
          <Pressable onPress={() => setJobsOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#1C1814', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingBottom: insets.bottom + 16, maxHeight: H * 0.7, gap: 12 }}>
              <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '700' }}>{t('look_inside.open_roles', { name })}</Text>
              <ScrollView contentContainerStyle={{ gap: 10 }}>
                {jobs.map((j) => (
                  <JobRow key={j.id} job={j} photoUrl={employer?.photoUrl ?? null} onPress={() => { setJobsOpen(false); openJob(j); }} t={t} />
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

// ─── Pages ──────────────────────────────────────────────────────────────────

function PhotoPage({
  photo,
  W,
  H,
  jobsById,
  onJob,
  t,
}: {
  photo: PortfolioPhoto;
  W: number;
  H: number;
  jobsById: Map<string, PublicJob>;
  onJob: (job: PublicJob) => void;
  t: TFn;
}) {
  const size = useImageSize(photo.url);
  return (
    <View style={{ width: W, height: H }}>
      <Image source={{ uri: resolveMediaUrl(photo.url) ?? undefined }} resizeMode="cover" style={{ width: W, height: H }} />
      {size &&
        photo.pins.map((pin) => {
          const pt = coverPoint(pin, size, { w: W, h: H });
          if (!pt) return null;
          const job = pin.jobId ? jobsById.get(pin.jobId) : undefined;
          return <Pin key={pin.id} x={pt.x} y={pt.y} W={W} label={pin.label} job={job} onPress={job ? () => onJob(job) : undefined} t={t} />;
        })}
    </View>
  );
}

function Pin({
  x,
  y,
  W,
  label,
  job,
  onPress,
  t,
}: {
  x: number;
  y: number;
  W: number;
  label: string;
  job?: PublicJob;
  onPress?: () => void;
  t: TFn;
}) {
  const BW = 168;
  const STEM = 54;
  const left = Math.max(10, Math.min(W - BW - 10, x - BW / 2));
  const n = job ? Math.max(1, job.headcount || 1) : 0;
  const icon = job ? classifyJob(job).icon : 'account-outline';
  return (
    <>
      {/* Stem + ground ring */}
      <View pointerEvents="none" style={{ position: 'absolute', left: x - 1, top: y - STEM, width: 2, height: STEM }}>
        <LinearGradient colors={['rgba(255,255,255,0.9)', '#FFC56B']} style={{ flex: 1 }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: x - 22,
          top: y - 8,
          width: 44,
          height: 16,
          borderRadius: 22,
          borderWidth: 2.5,
          borderColor: '#FFC56B',
          shadowColor: '#FFB23F',
          shadowOpacity: 1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={job ? `${label}, ${t(n === 1 ? 'ar.openings_one' : 'ar.openings', { n })}` : label}
        style={[GLASS, { position: 'absolute', left, top: y - STEM - 52, width: BW, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8, borderColor: 'rgba(255,255,255,0.55)' }]}
      >
        <Thumb uri={null} icon={icon} size={36} radius={18} ring />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>{label}</Text>
          {job ? (
            <Text style={{ color: WHITE_DIM, fontSize: 11 }}>{t(n === 1 ? 'ar.openings_one' : 'ar.openings', { n })}</Text>
          ) : null}
        </View>
      </Pressable>
    </>
  );
}

function VideoPage({ url, W, H, active }: { url: string; W: number; H: number; active: boolean }) {
  const player = useVideoPlayer(resolveMediaUrl(url) ?? '', (p) => {
    p.loop = true;
  });
  // Play only while this page is showing.
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={{ width: W, height: H, backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: W, height: H }} contentFit="cover" nativeControls={false} />
    </View>
  );
}

function JobRow({ job, photoUrl, onPress, t }: { job: PublicJob; photoUrl: string | null; onPress: () => void; t: TFn }) {
  const n = Math.max(1, job.headcount || 1);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[GLASS, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18 }]}>
      <Thumb uri={photoUrl} icon={classifyJob(job).icon} size={48} radius={14} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>{job.title}</Text>
        <Text numberOfLines={1} style={{ color: WHITE_DIM, fontSize: 13 }}>
          {formatPay(job, t)} · {t(n === 1 ? 'ar.openings_one' : 'ar.openings', { n })}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color="#FFFFFF" />
    </Pressable>
  );
}
