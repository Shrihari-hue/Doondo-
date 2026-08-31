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
 * The empty state's "Post a job" button is the sole CTA that opens the
 * PostJob modal — there's no header/FAB duplicate.
 */

import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing, blue } from '@doondo/tokens';
import { Screen, Text, Card, Pill, SkeletonCard, EmptyState, BlurOverlay, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { JobStatus, PublicJob } from '@/api/types';
import type { AppStackParamList } from '@/navigation/types';
import { JobIcon } from './JobIcon';

const BLUE = '#2563EB'; // = theme.brand.primary; module-scope constant, theme unreachable here
const ORANGE = '#F97316';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

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
            tintColor={theme.brand.accent}
          />
        }
      >
        <Header count={jobs.length} t={t} />

        {(query.isLoading || query.isRefetching) ? (
          <View style={{ gap: spacing.md }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : query.isError ? (
          <EmptyState
            icon="x-circle"
            tone="warning"
            eyebrow={t('employer.posts.offline_eyebrow')}
            title={t('employer.posts.offline_title')}
            message={t('employer.posts.offline_message')}
            tall
          />
        ) : jobs.length === 0 ? (
          <PostJobEmptyState onPostJob={onPostJob} t={t} />
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
    </Screen>
  );
}

function Header({ count, t }: { count: number; t: TFn }) {
  return (
    <LinearGradient
      colors={['#060B16', '#0D1B33', blue[900]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: '100%',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radii.xl,
        padding: spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(96,165,250,0.25)',
      }}
    >
      <Text
        variant="caption"
        weight="medium"
        style={{ letterSpacing: 1.4, color: blue[300], textAlign: 'center' }}
      >
        {t('employer.posts.eyebrow')}
      </Text>
      <Text
        variant="display"
        weight="medium"
        display
        style={{ color: '#FFFFFF', textAlign: 'center' }}
      >
        {t('employer.posts.title')}
      </Text>
      <Text
        variant="footnote"
        style={{ color: 'rgba(255,255,255,0.65)', textAlign: 'center' }}
      >
        {count > 0
          ? t('employer.posts.subtitle_manage')
          : t('employer.posts.subtitle_empty')}
      </Text>
    </LinearGradient>
  );
}

/**
 * Blue-themed "no jobs yet" state — the single Post-a-job entry point on
 * this screen (the header's "+ New" button and the floating FAB were
 * removed so there's exactly one CTA, matching the reference design).
 */
function PostJobEmptyState({ onPostJob, t }: { onPostJob: () => void; t: TFn }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing.xl,
      }}
    >
      <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }}>
        {/* Sparkle accents */}
        <Sparkle size={9} color={BLUE} style={{ top: 10, right: 14 }} />
        <Sparkle size={7} color={BLUE} style={{ top: 34, left: 4 }} />
        <Sparkle size={8} color={ORANGE} style={{ bottom: 16, left: 20 }} />
        <Sparkle size={7} color={BLUE} style={{ bottom: 44, right: 0 }} />

        {/* Outer circle */}
        <View
          style={{
            width: 108,
            height: 108,
            borderRadius: 54,
            borderWidth: 1,
            borderColor: BLUE + '33',
            backgroundColor: BLUE + '0D',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Layered document + briefcase glyphs */}
          <Feather
            name="file-text"
            size={30}
            color={blue[300]}
            style={{ position: 'absolute', top: 26, right: 24 }}
          />
          <Feather
            name="briefcase"
            size={34}
            color={BLUE}
            style={{ position: 'absolute', bottom: 24, left: 22 }}
          />

          {/* Small "+" badge */}
          <View
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: BLUE,
              borderWidth: 3,
              borderColor: theme.bg.canvas,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
          </View>
        </View>
      </View>

      <Text
        variant="caption"
        weight="medium"
        style={{ letterSpacing: 1.2, textAlign: 'center', color: BLUE }}
      >
        {t('employer.posts.empty_eyebrow')}
      </Text>

      <Text variant="bodyLarge" weight="medium" style={{ textAlign: 'center' }}>
        {t('employer.posts.empty_title')}
      </Text>

      <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
        {t('employer.posts.empty_message')}
      </Text>

      <Pressable
        onPress={onPostJob}
        style={({ pressed }) => ({
          marginTop: spacing.md,
          alignSelf: 'stretch',
          maxWidth: 280,
          backgroundColor: ORANGE,
          borderRadius: radii.lg,
          paddingVertical: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
          {t('employer.posts.cta_post')}
        </Text>
        <Feather name="plus" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/** Small 4-point sparkle accent — hand-drawn from two crossed bars, no glyph/emoji. */
function Sparkle({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style: { top?: number; bottom?: number; left?: number; right?: number };
}) {
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: size / 2 - 1,
          width: 2,
          height: size,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size / 2 - 1,
          left: 0,
          width: size,
          height: 2,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
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
              backgroundColor: theme.brand.accent,
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Feather name="map-pin" size={11} color={theme.text.secondary} />
                  <Text variant="footnote" tone="secondary">{job.location.area}</Text>
                </View>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="zap" size={20} color={isLight ? '#111827' : '#F9FAFB'} />
                    <Text style={{ fontSize: 22, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>Boost this job</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: isLight ? '#6B7280' : '#9CA3AF' }}>Reach more qualified workers faster.</Text>
                </View>
                {[
                  { icon: 'zap' as const, tag: 'Urgent Hire', desc: 'Top of search results for 7 days', price: '₹299', color: '#EF4444' },
                  { icon: 'star' as const, tag: 'Featured', desc: 'Highlighted card for 14 days', price: '₹499', color: AMBER },
                  { icon: 'send' as const, tag: 'Sponsored', desc: 'Push notification to 500+ matched workers', price: '₹899', color: BLUE },
                ].map((opt) => (
                  <Pressable key={opt.tag} onPress={() => { haptic('selection'); setShowBoost(false); }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
                      borderRadius: 14, backgroundColor: opt.color + '12',
                      borderWidth: 1, borderColor: opt.color + '40', opacity: pressed ? 0.75 : 1,
                    })}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: opt.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={opt.icon} size={20} color={opt.color} />
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
        backgroundColor: theme.brand.accentSubtle,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.brand.accentBorder,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.md,
          backgroundColor: theme.brand.accentSubtle,
          borderWidth: 0.5,
          borderColor: theme.brand.accentBorder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="info" size={20} color={theme.brand.accent} />
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
