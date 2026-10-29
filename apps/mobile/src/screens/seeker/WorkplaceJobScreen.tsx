/**
 * WorkplaceJobScreen — one vacancy inside its workplace.
 *
 * Top half: a photo of where this role actually works (the photo the
 * owner pinned it on, else the work area / storefront). Bottom half:
 * Overview / Workplace / Team / FAQs tabs with Message + Apply Now.
 *
 * Reached from Look Inside pins, the AR view and job detail. Apply is
 * one tap (jobs with a skill check open the full job detail instead).
 * Message opens the chat once the seeker has applied — chat on Doondo
 * always hangs off an application.
 */

import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen, Text } from '@/components';
import { resolveMediaUrl } from '@/api/client';
import { portfolioApi, heroPhotoFor } from '@/api/portfolio.api';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { chatApi } from '@/api/chat.api';
import { ApiError } from '@/api/errors';
import type { PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { enqueueApplication } from '@/lib/offlineQueue';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { classifyJob, fmtDistance, formatPay } from '@/lib/jobCategory';
import { WORKPLACE_QUESTIONS } from '@/lib/reverseInterviewCatalog';
import { CircleButton, GLASS, Thumb, WHITE_DIM } from './workplace/shared';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type R = RouteProp<AppStackParamList, 'WorkplaceJob'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type Tab = 'overview' | 'workplace' | 'team' | 'faqs';
const TABS: Tab[] = ['overview', 'workplace', 'team', 'faqs'];
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function fmtTime(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h == null || Number.isNaN(h)) return null;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
}

export function WorkplaceJobScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<R>();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const t = useTranslate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [notice, setNotice] = useState<string | null>(null);
  const [appliedNow, setAppliedNow] = useState(false);

  const portfolioQ = useQuery({
    queryKey: ['portfolio', params.employerId],
    queryFn: () => portfolioApi.get(params.employerId),
    staleTime: 60_000,
  });
  const fromPortfolio = portfolioQ.data?.jobs.find((j) => j.id === params.jobId);
  const jobQ = useQuery({
    queryKey: ['job', params.jobId],
    queryFn: () => jobsApi.detail(params.jobId),
    enabled: portfolioQ.isFetched && !fromPortfolio,
  });
  const job: PublicJob | undefined = fromPortfolio ?? jobQ.data?.job;
  const employer = portfolioQ.data?.employer;
  const portfolio = portfolioQ.data?.portfolio ?? null;
  const hero = heroPhotoFor(portfolio, params.jobId);
  const name = employer?.companyName || employer?.name || job?.employer?.companyName || job?.employer?.name || '';

  // Saved + applied state from the shared caches.
  const savedQ = useQuery({ queryKey: ['jobs', 'saved'], queryFn: () => jobsApi.listSaved(), staleTime: 60_000 });
  const saved = savedQ.data?.jobs.some((j) => j.id === params.jobId) ?? false;
  const appsQ = useQuery({
    queryKey: ['applications', 'me', 'workplace'],
    queryFn: () => applicationsApi.listMine({ limit: 100 }),
    staleTime: 30_000,
  });
  const application = appsQ.data?.applications.find((a) => a.jobId === params.jobId);
  const applied = appliedNow || Boolean(application);

  const saveMutation = useMutation({
    mutationFn: () => (saved ? jobsApi.unsave(params.jobId) : jobsApi.save(params.jobId)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs', 'saved'] }),
  });

  const applyMutation = useMutation({
    mutationFn: () => applicationsApi.apply(params.jobId, {}),
    onSuccess: () => {
      haptic('success');
      setAppliedNow(true);
      setNotice(t('workplace_job.applied_notice'));
      void qc.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.isTransient) {
        void enqueueApplication({ jobId: params.jobId, payload: {} });
        setAppliedNow(true);
        setNotice(t('workplace_job.queued_notice'));
      } else {
        haptic('error');
        setNotice(friendlyErrorMessage(err, t('job_detail.errors.generic')));
      }
    },
  });

  const messageMutation = useMutation({
    mutationFn: async () => {
      const app =
        application ??
        (await applicationsApi.listMine({ limit: 100 })).applications.find((a) => a.jobId === params.jobId);
      if (!app) return null;
      return chatApi.ensureFromApplication(app.id);
    },
    onSuccess: (res) => {
      if (!res) {
        setNotice(t('workplace_job.message_after_apply'));
        return;
      }
      navigation.navigate('Conversation', { conversationId: res.conversationId });
    },
    onError: (err) => setNotice(friendlyErrorMessage(err, t('job_detail.errors.generic'))),
  });

  const openFull = () => navigation.navigate('JobDetail', { jobId: params.jobId });
  const apply = () => {
    if (!job) return;
    if (job.requiredSkillTestId) return openFull();
    haptic('medium');
    setNotice(null);
    applyMutation.mutate();
  };

  const icon = job ? classifyJob(job).icon : 'briefcase-outline';
  const openings = job ? Math.max(1, job.headcount || 1) : 0;
  const heroH = H * 0.44;

  return (
    <Screen edges={[]}>
      <View style={{ flex: 1, backgroundColor: '#14110E' }}>
        {/* Hero photo */}
        <View style={{ height: heroH + 40 }}>
          {hero ? (
            <Image source={{ uri: resolveMediaUrl(hero.url) ?? undefined }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
          ) : (
            <LinearGradient colors={['#4A3A2A', '#1E1914']} style={{ flex: 1 }} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>

        {/* Top bar */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' }}>
          <CircleButton icon="arrow-left" label={t('ar.back_a11y')} onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }} />
          <CircleButton
            icon="bookmark"
            active={saved}
            label={t(saved ? 'ar.unsave_a11y' : 'ar.save_a11y')}
            onPress={() => {
              haptic('selection');
              saveMutation.mutate();
            }}
          />
          <CircleButton icon="more-horizontal" label={t('workplace_job.full_details_a11y')} onPress={openFull} style={{ marginLeft: 10 }} />
        </View>

        {/* Header card */}
        {job && (
          <View style={[GLASS, { position: 'absolute', top: insets.top + 66, left: 16, right: 16, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(30,26,22,0.62)' }]}>
            <Thumb uri={employer?.photoUrl} icon={icon} size={54} radius={27} ring />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '600' }}>{job.title}</Text>
              <Text numberOfLines={1} style={{ color: WHITE_DIM, fontSize: 14, marginTop: 2 }}>{name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{t(openings === 1 ? 'ar.openings_one' : 'ar.openings', { n: openings })}</Text>
              {params.distanceM != null && <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{fmtDistance(params.distanceM)}</Text>}
            </View>
          </View>
        )}

        {/* Sheet */}
        <View style={{ position: 'absolute', top: heroH, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(28,24,20,0.97)', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' }}>
          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.12)' }}>
            {TABS.map((k) => {
              const active = tab === k;
              return (
                <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={{ flex: 1, alignItems: 'center', paddingBottom: 10 }}>
                  <Text style={{ color: active ? '#FFFFFF' : WHITE_DIM, fontSize: 15, fontWeight: active ? '600' : '400' }}>{t(`workplace_job.tab.${k}`)}</Text>
                  {active && <View style={{ position: 'absolute', bottom: 0, width: 64, height: 2.5, borderRadius: 2, backgroundColor: '#FFFFFF' }} />}
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 + insets.bottom, gap: 18 }}>
            {!job ? (
              <Text style={{ color: WHITE_DIM }}>{portfolioQ.isError || jobQ.isError ? t('look_inside.load_error') : t('look_inside.loading')}</Text>
            ) : tab === 'overview' ? (
              <Overview job={job} name={name} distanceM={params.distanceM} t={t} />
            ) : tab === 'workplace' ? (
              <Workplace
                about={portfolio?.about ?? null}
                perks={portfolio?.perks ?? []}
                photos={portfolio?.photos ?? []}
                hasVideo={Boolean(portfolio?.video)}
                onPhoto={(photoId) => navigation.navigate('LookInside', { employerId: params.employerId, photoId, distanceM: params.distanceM })}
                t={t}
              />
            ) : tab === 'team' ? (
              <Team team={portfolio?.team ?? []} t={t} />
            ) : (
              <Faqs faqs={portfolio?.faqs ?? []} job={job} t={t} />
            )}
          </ScrollView>

          {/* Actions */}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, gap: 8 }}>
            {notice ? <Text style={{ color: '#FFD9A8', fontSize: 13, textAlign: 'center' }}>{notice}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 12, height: 56 }}>
              <Pressable
                onPress={() => {
                  haptic('selection');
                  setNotice(null);
                  messageMutation.mutate();
                }}
                accessibilityRole="button"
                style={{ flex: 1, borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                <MaterialCommunityIcons name="message-text-outline" size={20} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>{t('workplace_job.message')}</Text>
              </Pressable>
              <Pressable
                onPress={apply}
                disabled={applied || applyMutation.isPending || !job}
                accessibilityRole="button"
                style={{ flex: 1, borderRadius: 28, backgroundColor: applied ? '#DCF57E' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: applyMutation.isPending ? 0.7 : 1 }}
              >
                <Text style={{ color: '#111111', fontSize: 16, fontWeight: '600' }}>
                  {applied ? t('ar.applied') : applyMutation.isPending ? t('ar.applying') : t('ar.apply_now')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

function Row({ icon, title, sub }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; sub?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon} size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>{title}</Text>
        {sub ? <Text style={{ color: WHITE_DIM, fontSize: 13, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Overview({ job, name, distanceM, t }: { job: PublicJob; name: string; distanceM?: number; t: TFn }) {
  const [more, setMore] = useState(false);
  const start = fmtTime(job.schedule?.startTime);
  const end = fmtTime(job.schedule?.endTime);
  const days = (job.schedule?.days ?? []).slice().sort();
  const daysLabel =
    days.length > 0 && days.length < 7 ? days.map((d) => t(`workplace_job.day.${DAY_KEYS[d] ?? 'mon'}`)).join(', ') : null;
  const timeLabel = start && end ? `${start} – ${end}` : null;
  const place = [name, job.location.area || job.location.city].filter(Boolean).join(', ');
  return (
    <>
      <Row icon="currency-inr" title={formatPay(job, t)} sub={job.pay.amountMax ? t('workplace_job.based_on_experience') : null} />
      <Row icon="clock-outline" title={t(`common.job_type.${job.type}`)} sub={[timeLabel, daysLabel].filter(Boolean).join(' · ') || null} />
      <Row icon="map-marker-outline" title={place} sub={distanceM != null ? t('workplace_job.from_you', { dist: fmtDistance(distanceM) }) : job.location.address} />
      {job.description ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>{t('workplace_job.description')}</Text>
          <Text style={{ color: WHITE_DIM, fontSize: 15, lineHeight: 22 }} numberOfLines={more ? undefined : 4}>{job.description}</Text>
          {job.description.length > 180 && (
            <Pressable onPress={() => setMore((m) => !m)} hitSlop={8}>
              <Text style={{ color: '#FFD38A', fontSize: 14 }}>{more ? t('workplace_job.less') : t('workplace_job.more')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </>
  );
}

function Workplace({
  about,
  perks,
  photos,
  hasVideo,
  onPhoto,
  t,
}: {
  about: string | null;
  perks: string[];
  photos: Array<{ id: string; url: string; kind: string; caption: string | null }>;
  hasVideo: boolean;
  onPhoto: (photoId?: string) => void;
  t: TFn;
}) {
  const { width } = useWindowDimensions();
  const tile = (width - 40 - 16) / 3;
  if (!about && perks.length === 0 && photos.length === 0) {
    return <Text style={{ color: WHITE_DIM }}>{t('workplace_job.workplace_empty')}</Text>;
  }
  return (
    <>
      {about ? <Text style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 22 }}>{about}</Text> : null}
      {perks.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {perks.map((p) => (
            <View key={p} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13 }}>✓ {p}</Text>
            </View>
          ))}
        </View>
      )}
      {photos.length > 0 && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600', flex: 1 }}>{t('workplace_job.photos')}</Text>
            <Pressable onPress={() => onPhoto()} hitSlop={8}>
              <Text style={{ color: '#FFD38A', fontSize: 14 }}>{hasVideo ? t('workplace_job.look_inside_video') : t('workplace_job.look_inside')} ›</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((p) => (
              <Pressable key={p.id} onPress={() => onPhoto(p.id)} accessibilityRole="imagebutton" accessibilityLabel={p.caption || t(`look_inside.kind.${p.kind}`)}>
                <Image source={{ uri: resolveMediaUrl(p.url) ?? undefined }} style={{ width: tile, height: tile, borderRadius: 12, backgroundColor: '#2A241E' }} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

function Team({ team, t }: { team: Array<{ id: string; name: string; role: string; photoUrl: string | null; tenure: string | null }>; t: TFn }) {
  if (team.length === 0) return <Text style={{ color: WHITE_DIM }}>{t('workplace_job.team_empty')}</Text>;
  return (
    <>
      {team.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Thumb uri={m.photoUrl} icon="account" size={52} radius={26} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '500' }}>{m.name}</Text>
            <Text style={{ color: WHITE_DIM, fontSize: 13 }}>{[m.role, m.tenure].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

function Faqs({ faqs, job, t }: { faqs: Array<{ id: string; q: string; a: string }>; job: PublicJob; t: TFn }) {
  const answers = job.workplaceAnswers;
  const answered = answers ? WORKPLACE_QUESTIONS.filter((q) => answers[q.field] === true || answers[q.field] === false) : [];
  const [open, setOpen] = useState<string | null>(faqs[0]?.id ?? null);
  const empty = useMemo(() => faqs.length === 0 && answered.length === 0, [faqs.length, answered.length]);
  if (empty) return <Text style={{ color: WHITE_DIM }}>{t('workplace_job.faqs_empty')}</Text>;
  return (
    <>
      {faqs.map((f) => (
        <Pressable key={f.id} onPress={() => setOpen(open === f.id ? null : f.id)} style={{ gap: 6, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.12)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '500', flex: 1 }}>{f.q}</Text>
            <Feather name={open === f.id ? 'chevron-up' : 'chevron-down'} size={18} color={WHITE_DIM} />
          </View>
          {open === f.id && <Text style={{ color: WHITE_DIM, fontSize: 14, lineHeight: 21 }}>{f.a}</Text>}
        </Pressable>
      ))}
      {answered.length > 0 && answers && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{t('workplace_job.on_record')}</Text>
          {answered.map((q) => (
            <View key={q.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name={answers[q.field] ? 'check-circle' : 'close-circle'} size={18} color={answers[q.field] ? '#7EE2A8' : '#FF9C8A'} />
              <Text style={{ color: '#FFFFFF', fontSize: 14, flex: 1 }}>{t(q.key)}</Text>
              <Text style={{ color: WHITE_DIM, fontSize: 13 }}>{answers[q.field] ? t('workplace_job.yes') : t('workplace_job.no')}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}
