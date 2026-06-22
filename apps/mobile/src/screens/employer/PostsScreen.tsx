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
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
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

  // Deterministic view count derived from job id hash (10–100)
  const views = 10 + ([...job.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 91;

  const transition = useMutation({
    mutationFn: (next: Exclude<JobStatus, 'expired'> | 'expired') => {
      if (next === 'paused') return jobsApi.pause(job.id);
      if (next === 'active') return jobsApi.reopen(job.id);
      return jobsApi.close(job.id);
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
    },
    onError: () => haptic('error'),
  });

  const repost = useMutation({
    mutationFn: () => jobsApi.repost(job.id),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
    },
    onError: () => haptic('error'),
  });

  const open = job.status === 'active' || job.status === 'paused';

  const goToApplicants = () => {
    haptic('selection');
    navigation.navigate('JobApplicants', { jobId: job.id, jobTitle: job.title });
  };

  const healthColor = jobHealthColor(job, stats);

  return (
    <Card premium={job.status === 'filled'}>
      <View style={{ gap: spacing.md }}>
        {/* Health indicator — coloured left accent bar */}
        {healthColor && (
          <View style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 4, borderRadius: 4,
            backgroundColor: healthColor,
          }} />
        )}
        {/* Row 1 — icon, title block, status pill, kebab */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.md,
          }}
        >
          <JobIcon title={job.title} type={job.type} />

          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
              {job.title}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexWrap: 'wrap',
              }}
            >
              {job.location.area ? (
                <>
                  <Text variant="footnote" tone="secondary">
                    📍 {job.location.area}
                  </Text>
                  <Text variant="footnote" tone="tertiary">
                    ·
                  </Text>
                </>
              ) : null}
              <Text variant="footnote" tone="secondary">
                {formatType(job.type, t)}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            <StatusPill status={job.status} t={t} />
            <KebabButton
              onPress={() => {
                haptic('light');
                goToApplicants();
              }}
              color={theme.text.tertiary}
            />
          </View>
        </View>

        {/* Auto-escalation badge — boosted, or needs the employer's attention. */}
        <EscalationBadge job={job} t={t} />

        {/* Expiry countdown badge — shown when ≤ 7 days left on active jobs */}
        {(() => {
          if (job.status !== 'active') return null;
          const expiresAt = new Date(job.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000;
          const daysLeft = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
          if (daysLeft > 7 || daysLeft < 0) return null;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: AMBER + '18', borderWidth: 0.5, borderColor: AMBER + '60',
                borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ fontSize: 12 }}>⏰</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: AMBER }}>
                  {daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft}d`}
                </Text>
              </View>
              <Pressable
                onPress={() => { haptic('selection'); repost.mutate(); }}
                disabled={repost.isPending}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: GREEN + '18', borderWidth: 0.5, borderColor: GREEN + '60',
                  borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
                  opacity: pressed || repost.isPending ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>
                  {repost.isPending ? 'Renewing…' : '↻ Renew 30 days'}
                </Text>
              </Pressable>
            </View>
          );
        })()}

        {/* Performance metrics strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="footnote" tone="tertiary">👁</Text>
            <Text variant="footnote" tone="secondary" weight="medium">{views}</Text>
            <Text variant="footnote" tone="tertiary"> views</Text>
          </View>
          <Text variant="footnote" tone="tertiary">·</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="footnote" tone="tertiary">👥</Text>
            <Text variant="footnote" tone="secondary" weight="medium">
              {stats?.applicants ?? job.applicantsCount ?? 0}
            </Text>
            <Text variant="footnote" tone="tertiary"> applied</Text>
          </View>
          <Text variant="footnote" tone="tertiary">·</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="footnote" style={{ color: GREEN }}>✓</Text>
            <Text variant="footnote" weight="medium" style={{ color: GREEN }}>{stats?.hired ?? 0}</Text>
            <Text variant="footnote" tone="tertiary"> hired</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {job.status === 'active' && (
              <Pressable
                onPress={() => { haptic('selection'); setShowBoost(true); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderRadius: 20,
                  backgroundColor: AMBER + '20',
                  borderWidth: 0.5, borderColor: AMBER + '60',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 11 }}>⚡</Text>
                <Text variant="footnote" weight="semibold" style={{ color: AMBER }}>Boost</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Fill-rate progress bar — shown for multi-headcount jobs */}
        {job.headcount > 1 && (
          <View style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="footnote" tone="secondary">
                {stats?.hired ?? 0} / {job.headcount} positions filled
              </Text>
              <Text variant="footnote" weight="semibold" style={{
                color: (stats?.hired ?? 0) >= job.headcount ? GREEN : BLUE,
              }}>
                {Math.round(((stats?.hired ?? 0) / job.headcount) * 100)}%
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: isLight ? '#E5E7EB' : '#374151' }}>
              <View style={{
                height: 6, borderRadius: 3,
                width: `${Math.min(100, Math.round(((stats?.hired ?? 0) / job.headcount) * 100))}%`,
                backgroundColor: (stats?.hired ?? 0) >= job.headcount ? GREEN : BLUE,
              }} />
            </View>
          </View>
        )}

        {/* Row 2 — full-width "View applicants" inset row */}
        <AnimatedPressable onPress={goToApplicants}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: theme.bg.muted,
              borderRadius: radii.md,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text variant="body" tone="secondary">
              👥
            </Text>
            <Text variant="body" weight="medium" style={{ flex: 1 }}>
              {t('employer.posts.view_applicants')}
            </Text>
            <View
              style={{
                minWidth: 32,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.heroSubtle,
                borderWidth: 0.5,
                borderColor: theme.brand.heroBorder,
                alignItems: 'center',
              }}
            >
              <Text variant="footnote" tone="hero" weight="medium">
                {job.applicantsCount}
              </Text>
            </View>
            <Text variant="body" tone="tertiary">
              ›
            </Text>
          </View>
        </AnimatedPressable>

        {/* Row 3 — primary actions, only on open jobs */}
        {open && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {job.status === 'active' ? (
              <ActionButton
                glyph="⏸"
                label={t('employer.posts.action_pause')}
                tone="warning"
                onPress={() => transition.mutate('paused')}
              />
            ) : (
              <ActionButton
                glyph="▶"
                label={t('employer.posts.action_reopen')}
                tone="success"
                onPress={() => transition.mutate('active')}
              />
            )}
            <ActionButton
              glyph="✕"
              label={t('employer.posts.action_close')}
              tone="danger"
              onPress={() => transition.mutate('expired')}
            />
          </View>
        )}

        {/* Re-post — for closed / filled jobs: "same as last time". */}
        {!open && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ActionButton
              glyph="↻"
              label={t('employer.posts.action_repost')}
              tone="success"
              onPress={() => repost.mutate()}
            />
          </View>
        )}

        {/* Edit / Duplicate row — always visible on open jobs */}
        {open && (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => {
                haptic('selection');
                navigation.navigate('PostJob', {
                  editJobId: job.id,
                  prefill: {
                    title: job.title,
                    description: job.description ?? '',
                    type: job.type,
                    amount: String(Math.round((job.pay?.amount ?? 0) / 100)),
                    period: job.pay?.period ?? 'day',
                    skills: job.skills ?? [],
                  },
                });
              }}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 5, paddingVertical: 9, borderRadius: 10,
                backgroundColor: isLight ? '#EFF6FF' : '#1E3A5F',
                borderWidth: 1, borderColor: BLUE + '40',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13 }}>✏️</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic('selection');
                navigation.navigate('PostJob', {
                  prefill: {
                    title: job.title,
                    description: job.description ?? '',
                    type: job.type,
                    amount: String(Math.round((job.pay?.amount ?? 0) / 100)),
                    period: job.pay?.period ?? 'day',
                    skills: job.skills ?? [],
                  },
                });
              }}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 5, paddingVertical: 9, borderRadius: 10,
                backgroundColor: isLight ? '#F5F3FF' : '#2E1B5C',
                borderWidth: 1, borderColor: '#7C3AED40',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13 }}>📋</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#7C3AED' }}>Duplicate</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Boost promo sheet */}
      <Modal visible={showBoost} transparent animationType="slide" onRequestClose={() => setShowBoost(false)}>
        <BlurOverlay>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end' }}
          onPress={() => setShowBoost(false)}>
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View style={{
              backgroundColor: isLight ? '#FFFFFF' : '#0D0D0D',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: spacing.xl, gap: spacing.lg,
              paddingBottom: spacing['2xl'],
            }}>
              {/* Handle */}
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isLight ? '#D1D5DB' : '#374151', alignSelf: 'center' }} />

              <View style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>⚡ Boost this job</Text>
                <Text style={{ fontSize: 14, color: isLight ? '#6B7280' : '#9CA3AF' }}>
                  Reach more qualified workers faster with urgency tags.
                </Text>
              </View>

              {/* Urgency tag options */}
              {[
                { emoji: '🔥', tag: 'Urgent Hire', desc: 'Top of search results for 7 days', price: '₹299', color: '#EF4444' },
                { emoji: '⭐', tag: 'Featured', desc: 'Highlighted card for 14 days', price: '₹499', color: AMBER },
                { emoji: '🚀', tag: 'Sponsored', desc: 'Push notification to 500+ matched workers', price: '₹899', color: BLUE },
              ].map((opt) => (
                <Pressable
                  key={opt.tag}
                  onPress={() => { haptic('selection'); setShowBoost(false); }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    padding: spacing.md,
                    borderRadius: 14,
                    backgroundColor: opt.color + '12',
                    borderWidth: 1, borderColor: opt.color + '40',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12,
                    backgroundColor: opt.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: opt.color }}>{opt.tag}</Text>
                    <Text style={{ fontSize: 13, color: isLight ? '#6B7280' : '#9CA3AF' }}>{opt.desc}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: isLight ? '#111827' : '#F9FAFB' }}>{opt.price}</Text>
                </Pressable>
              ))}

              <Text style={{ fontSize: 12, color: isLight ? '#9CA3AF' : '#6B7280', textAlign: 'center' }}>
                Charges apply per posting period. Cancel anytime.
              </Text>

              <Pressable onPress={() => setShowBoost(false)} style={({ pressed }) => ({
                paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
                borderColor: isLight ? '#D1D5DB' : '#374151', alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
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

function ActionButton({
  glyph,
  label,
  tone,
  onPress,
}: {
  glyph: string;
  label: string;
  tone: 'warning' | 'danger' | 'success';
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const map = {
    warning: {
      bg: theme.status.warningSubtle,
      border: theme.status.warningBorder,
      fg: theme.status.warning,
    },
    danger: {
      bg: theme.status.dangerSubtle,
      border: theme.status.dangerBorder,
      fg: theme.status.danger,
    },
    success: {
      bg: theme.status.successSubtle,
      border: theme.status.successBorder,
      fg: theme.status.success,
    },
  };
  const c = map[tone];

  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: c.bg,
        borderWidth: 0.5,
        borderColor: c.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="footnote" weight="medium" style={{ color: c.fg }}>
        {glyph}
      </Text>
      <Text variant="footnote" weight="medium" style={{ color: c.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

function KebabButton({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="title" style={{ color, lineHeight: 18 }}>
        ⋮
      </Text>
    </Pressable>
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
