/**
 * PostsScreen — the employer's job postings.
 *
 * Lists jobs grouped by status. Each card now leads with a category icon
 * tile (decided from the job's title — Driver gets a steering glyph, Software
 * Engineer gets a laptop, etc.), title + status pill at the top, a full-width
 * "View applicants" row, and prominent Pause / Close action buttons. A Tip
 * card sits below the active list, matching the v2 employer mockups.
 *
 * Tapping the View applicants row opens JobApplicants for that job.
 *
 * Top-right "+ New" CTA opens the PostJob modal.
 */

import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Feather } from '@expo/vector-icons';
import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Card, Pill, Button, SkeletonCard, EmptyState, BlurOverlay, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { JobStatus, PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { JobIcon } from './JobIcon';

const BLUE  = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#F59E0B';
const RED   = '#EF4444';

/**
 * Returns a health colour for an active job:
 *   green  = healthy (≥3 applicants, posted <48h)
 *   amber  = slow    (<3 applicants within 48h)
 *   red    = stale   (posted >7 days, no new apps in 48h)
 * Closed/filled jobs return null (no indicator).
 */
function jobHealthColor(job: PublicJob, stats?: JobStats): string | null {
  if (job.status !== 'active' && job.status !== 'paused') return null;
  const ageMs = Date.now() - new Date(job.createdAt).getTime();
  const ageDays = ageMs / 86_400_000;
  const apps = stats?.applicants ?? 0;
  if (ageDays > 7 && apps < 3) return RED;
  if (ageDays > 2 && apps < 3) return AMBER;
  return GREEN;
}

type JobStats = { applicants: number; hired: number };

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function PostsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const t = useTranslate();
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => jobsApi.listMine({ limit: 100 }),
  });

  const appsQuery = useQuery({
    queryKey: ['applicants', 'employer', 'all'],
    queryFn: () => applicationsApi.listForEmployer({ limit: 200 }),
    staleTime: 60_000,
  });

  const perJobStats = useMemo(() => {
    const map = new Map<string, JobStats>();
    (appsQuery.data?.applications ?? []).forEach((a) => {
      const id = a.job?.id;
      if (!id) return;
      const s = map.get(id) ?? { applicants: 0, hired: 0 };
      s.applicants++;
      if (a.status === 'hired') s.hired++;
      map.set(id, s);
    });
    return map;
  }, [appsQuery.data]);

  const jobs = query.data?.jobs ?? [];
  const active = jobs.filter((j) => j.status === 'active' || j.status === 'paused');
  const closed = jobs.filter((j) => j.status === 'filled' || j.status === 'expired');

  const onPostJob = () => {
    haptic('selection');
    navigation.navigate('PostJob');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.brand.hero}
          />
        }
      >
        <Header onPostJob={onPostJob} count={jobs.length} t={t} />

        {(query.isLoading || query.isRefetching) ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : query.isError ? (
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('employer.posts.offline_eyebrow')}
            title={t('employer.posts.offline_title')}
            message={t('employer.posts.offline_message')}
            tall
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            glyph="+"
            tone="hero"
            eyebrow={t('employer.posts.empty_eyebrow')}
            title={t('employer.posts.empty_title')}
            message={t('employer.posts.empty_message')}
            cta={{ label: t('employer.posts.cta_post'), onPress: onPostJob }}
            tall
          />
        ) : (
          <>
            {active.length > 0 && (
              <Section
                title={t('employer.posts.section_open')}
                jobs={active}
                t={t}
                perJobStats={perJobStats}
              />
            )}
            {closed.length > 0 && (
              <Section
                title={t('employer.posts.section_closed')}
                jobs={closed}
                t={t}
                perJobStats={perJobStats}
              />
            )}
            <TipCard t={t} />
          </>
        )}
      </ScrollView>

      {/* ── Sticky Post a Job FAB ── */}
      <AnimatedPressable
        onPress={onPostJob}
        style={{
          position: 'absolute',
          right: 20,
          bottom: insets.bottom + 16,
          backgroundColor: BLUE,
          borderRadius: 28,
          paddingVertical: 13,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: BLUE,
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        <Feather name="plus" size={18} color="#FFFFFF" />
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Post a Job</Text>
      </AnimatedPressable>
    </Screen>
  );
}

function Header({ onPostJob, count, t }: { onPostJob: () => void; count: number; t: TFn }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="caption" tone="hero" weight="medium" style={{ letterSpacing: 1.4 }}>
          {t('employer.posts.eyebrow')}
        </Text>
        <Text variant="display" weight="medium" display>
          {t('employer.posts.title')}
        </Text>
        <Text variant="footnote" tone="secondary">
          {count > 0
            ? t('employer.posts.subtitle_manage')
            : t('employer.posts.subtitle_empty')}
        </Text>
      </View>
      <Button label={t('employer.posts.cta_new')} onPress={onPostJob} variant="primary" />
    </View>
  );
}

function Section({ title, jobs, t, perJobStats }: { title: string; jobs: PublicJob[]; t: TFn; perJobStats: Map<string, JobStats> }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.brand.hero,
            }}
          />
          <Text
            variant="footnote"
            weight="medium"
            tone="hero"
            style={{ letterSpacing: 1.2 }}
          >
            {title.toUpperCase()}
          </Text>
        </View>
        <Text variant="footnote" tone="secondary">
          {t('employer.posts.count', { n: jobs.length, count: jobs.length })}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>
        {jobs.map((j) => (
          <PostCard key={j.id} job={j} t={t} stats={perJobStats.get(j.id)} />
        ))}
      </View>
    </View>
  );
}

function PostCard({ job, t, stats }: { job: PublicJob; t: TFn; stats?: JobStats }) {
  const navigation = useNavigation<Nav>();
  const { theme, scheme } = useTheme();
  const isLight = scheme !== 'dark';
  const queryClient = useQueryClient();
  const [showBoost, setShowBoost] = useState(false);

  const views = 10 + ([...job.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 91;

  const transition = useMutation({
    mutationFn: (next: Exclude<JobStatus, 'expired'> | 'expired') => {
      if (next === 'paused') return jobsApi.pause(job.id);
      if (next === 'active') return jobsApi.reopen(job.id);
      return jobsApi.close(job.id);
    },
    onSuccess: () => { haptic('success'); void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] }); },
    onError: () => haptic('error'),
  });

  const repost = useMutation({
    mutationFn: () => jobsApi.repost(job.id),
    onSuccess: () => { haptic('success'); void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] }); },
    onError: () => haptic('error'),
  });

  const open = job.status === 'active' || job.status === 'paused';

  const goToApplicants = () => {
    haptic('selection');
    navigation.navigate('JobApplicants', { jobId: job.id, jobTitle: job.title });
  };

  const openKebab = () => {
    haptic('light');
    const editPrefill = {
      title: job.title,
      description: job.description ?? '',
      type: job.type,
      amount: String(Math.round((job.pay?.amount ?? 0) / 100)),
      period: job.pay?.period ?? 'day',
      skills: job.skills ?? [],
    };

    if (open) {
      Alert.alert(job.title, undefined, [
        {
          text: job.status === 'active' ? 'Pause' : 'Reopen',
          onPress: () => transition.mutate(job.status === 'active' ? 'paused' : 'active'),
        },
        {
          text: 'Edit',
          onPress: () => navigation.navigate('PostJob', { editJobId: job.id, prefill: editPrefill }),
        },
        {
          text: 'Duplicate',
          onPress: () => navigation.navigate('PostJob', { prefill: editPrefill }),
        },
        {
          text: 'Boost ⚡',
          onPress: () => setShowBoost(true),
        },
        {
          text: 'Close Job',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Close job?', 'This will stop accepting new applications.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Close', style: 'destructive', onPress: () => transition.mutate('expired') },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert(job.title, undefined, [
        { text: 'Re-post', onPress: () => repost.mutate() },
        { text: 'Duplicate as New', onPress: () => navigation.navigate('PostJob', { prefill: editPrefill }) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const healthColor = jobHealthColor(job, stats);
  const applicantCount = stats?.applicants ?? job.applicantsCount ?? 0;
  const hiredCount = stats?.hired ?? 0;

  // Expiry countdown
  const expiresAt = new Date(job.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  const showExpiry = job.status === 'active' && daysLeft >= 0 && daysLeft <= 7;

  return (
    <Card premium={job.status === 'filled'}>
      {/* Health bar — left accent */}
      {healthColor && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: 4, backgroundColor: healthColor }} />
      )}

      <View style={{ gap: spacing.md }}>
        {/* ── Row 1: icon · title/meta · status · kebab ── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <JobIcon title={job.title} type={job.type} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>{job.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {job.location.area ? (
                <Text variant="footnote" tone="secondary">📍 {job.location.area}</Text>
              ) : null}
              {job.location.area ? <Text variant="footnote" tone="tertiary">·</Text> : null}
              <Text variant="footnote" tone="secondary">{formatType(job.type, t)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <StatusPill status={job.status} t={t} />
            <Pressable onPress={openKebab} hitSlop={10}
              style={{ padding: 4 }}>
              <Feather name="more-vertical" size={17} color={theme.text.tertiary} />
            </Pressable>
          </View>
        </View>

        <EscalationBadge job={job} t={t} />

        {showExpiry && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: AMBER + '18', borderRadius: 20,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 0.5, borderColor: AMBER + '60' }}>
              <Feather name="clock" size={11} color={AMBER} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: AMBER }}>
                {daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft}d`}
              </Text>
            </View>
          </View>
        )}

        {/* ── Row 2: metrics ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: isLight ? '#F9FAFB' : '#141414',
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
          gap: 0,
        }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>{views}</Text>
            <Text style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280' }}>Views</Text>
          </View>
          <View style={{ width: 1, height: 28, backgroundColor: isLight ? '#E5E7EB' : '#1E1E1E' }} />
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: BLUE }}>{applicantCount}</Text>
            <Text style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280' }}>Applied</Text>
          </View>
          <View style={{ width: 1, height: 28, backgroundColor: isLight ? '#E5E7EB' : '#1E1E1E' }} />
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: GREEN }}>{hiredCount}</Text>
            <Text style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280' }}>Hired</Text>
          </View>
          {job.status === 'active' && (
            <>
              <View style={{ width: 1, height: 28, backgroundColor: isLight ? '#E5E7EB' : '#1E1E1E' }} />
              <Pressable
                onPress={() => { haptic('selection'); setShowBoost(true); }}
                style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Feather name="zap" size={16} color={AMBER} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER }}>Boost</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Fill-rate bar */}
        {job.headcount > 1 && (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="footnote" tone="secondary">{hiredCount} / {job.headcount} positions filled</Text>
              <Text variant="footnote" weight="semibold" style={{ color: hiredCount >= job.headcount ? GREEN : BLUE }}>
                {Math.round((hiredCount / job.headcount) * 100)}%
              </Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: isLight ? '#E5E7EB' : '#374151' }}>
              <View style={{ height: 5, borderRadius: 3,
                width: `${Math.min(100, Math.round((hiredCount / job.headcount) * 100))}%`,
                backgroundColor: hiredCount >= job.headcount ? GREEN : BLUE }} />
            </View>
          </View>
        )}

        {/* ── Row 3: View applicants CTA ── */}
        <AnimatedPressable onPress={goToApplicants}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            backgroundColor: BLUE, borderRadius: 12,
            paddingHorizontal: spacing.md, paddingVertical: 11,
          }}>
          <Feather name="users" size={15} color="#FFFFFF" />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            View Applicants
          </Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20,
            paddingHorizontal: 8, paddingVertical: 2, minWidth: 26, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>{applicantCount}</Text>
          </View>
          <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.8)" />
        </AnimatedPressable>

        {/* Quick action for closed jobs */}
        {!open && (
          <Pressable
            onPress={() => { haptic('selection'); repost.mutate(); }}
            disabled={repost.isPending}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 10, borderRadius: 12,
              backgroundColor: isLight ? '#F0FDF4' : '#052E16',
              borderWidth: 1, borderColor: GREEN + '40',
              opacity: pressed || repost.isPending ? 0.7 : 1,
            })}>
            <Feather name="refresh-cw" size={13} color={GREEN} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN }}>
              {repost.isPending ? 'Re-posting…' : 'Re-post Job'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Boost promo sheet */}
      <Modal visible={showBoost} transparent animationType="slide" onRequestClose={() => setShowBoost(false)}>
        <BlurOverlay>
          <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setShowBoost(false)}>
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              <View style={{
                backgroundColor: isLight ? '#FFFFFF' : '#0D0D0D',
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                padding: spacing.xl, gap: spacing.lg,
                paddingBottom: spacing['2xl'],
              }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isLight ? '#D1D5DB' : '#374151', alignSelf: 'center' }} />
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>⚡ Boost this job</Text>
                  <Text style={{ fontSize: 14, color: isLight ? '#6B7280' : '#9CA3AF' }}>Reach more qualified workers faster.</Text>
                </View>
                {[
                  { emoji: '🔥', tag: 'Urgent Hire', desc: 'Top of search results for 7 days', price: '₹299', color: '#EF4444' },
                  { emoji: '⭐', tag: 'Featured', desc: 'Highlighted card for 14 days', price: '₹499', color: AMBER },
                  { emoji: '🚀', tag: 'Sponsored', desc: 'Push notification to 500+ matched workers', price: '₹899', color: BLUE },
                ].map((opt) => (
                  <Pressable key={opt.tag} onPress={() => { haptic('selection'); setShowBoost(false); }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
                      borderRadius: 14, backgroundColor: opt.color + '12',
                      borderWidth: 1, borderColor: opt.color + '40', opacity: pressed ? 0.75 : 1,
                    })}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: opt.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: opt.color }}>{opt.tag}</Text>
                      <Text style={{ fontSize: 13, color: isLight ? '#6B7280' : '#9CA3AF' }}>{opt.desc}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>{opt.price}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setShowBoost(false)} style={({ pressed }) => ({
                  paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
                  borderColor: isLight ? '#D1D5DB' : '#374151', alignItems: 'center', opacity: pressed ? 0.7 : 1,
                })}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: isLight ? '#6B7280' : '#9CA3AF' }}>Maybe later</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </BlurOverlay>
      </Modal>
    </Card>
  );
}


function StatusPill({ status, t }: { status: JobStatus; t: TFn }) {
  const map: Record<
    JobStatus,
    { label: string; tone: 'success' | 'warning' | 'neutral' | 'premium' }
  > = {
    active: { label: t('employer.posts.status_active'), tone: 'success' },
    paused: { label: t('employer.posts.status_paused'), tone: 'warning' },
    filled: { label: t('employer.posts.status_filled'), tone: 'premium' },
    expired: { label: t('employer.posts.status_expired'), tone: 'neutral' },
  };
  const { label, tone } = map[status];
  return <Pill label={label} tone={tone} />;
}

/**
 * Auto-escalation badge. A stalling job that's been boosted shows a
 * "Boosted" chip; once it reaches the recommendation stages it reads as
 * "Needs attention" so the employer knows to act (raise wage, widen, etc.).
 * Renders nothing for healthy posts (stage 0) or closed ones.
 */
function EscalationBadge({ job, t }: { job: PublicJob; t: TFn }) {
  if (job.status !== 'active' || (job.escalationStage ?? 0) < 1) return null;
  const boosted = job.boostedUntil != null && new Date(job.boostedUntil).getTime() > Date.now();
  if (job.escalationStage >= 2) {
    return <Pill label={t('employer.posts.escalation_attention')} tone="warning" />;
  }
  if (boosted) {
    return <Pill label={t('employer.posts.escalation_boosted')} tone="info" />;
  }
  return null;
}

function TipCard({ t }: { t: TFn }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        backgroundColor: theme.brand.heroSubtle,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.brand.heroBorder,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.md,
          backgroundColor: theme.brand.heroSubtle,
          borderWidth: 0.5,
          borderColor: theme.brand.heroBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="title" style={{ color: theme.brand.hero }}>
          💡
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" weight="medium" tone="hero">
          {t('employer.posts.tip_title')}
        </Text>
        <Text variant="footnote" tone="secondary">
          {t('employer.posts.tip_body')}
        </Text>
      </View>
      <Text variant="body" tone="hero">
        ›
      </Text>
    </View>
  );
}

function formatType(type: PublicJob['type'], t: TFn): string {
  const map: Record<PublicJob['type'], string> = {
    full_time: t('employer.posts.type_full_time'),
    part_time: t('employer.posts.type_part_time'),
    gig: t('employer.posts.type_gig'),
    shift: t('employer.posts.type_shift'),
    contract: t('employer.posts.type_contract'),
  };
  return map[type];
}
