/**
 * JobDetailScreen — full posting view with Apply CTA + Save heart.
 *
 * Redesigned to match the seeker Phase-2 mockup:
 *   - Header: back / "Job Details" title / share icon
 *   - Company card: avatar + name, job title, type pill, big pay range
 *   - Pills row: city, distance, hours, type — icon prefixed
 *   - Job Description
 *   - Requirements — derived from job.skills, rendered as green checkmarks
 *   - Sticky bottom row: Apply Now button + heart (save) icon
 *
 * All data is live from /jobs/:id. Save toggles via /jobs/:id/save and
 * /jobs/:id/save DELETE.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Pill,
  Card,
  Button,
  Avatar,
  SkeletonCard,
  EmptyState,
  WomenSafetyBadge,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi, type ApplyPayload } from '@/api/applications.api';
import { enqueueApplication } from '@/lib/offlineQueue';
import { contactApi } from '@/api/contact.api';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import {
  getJobOffline,
  isJobDownloaded,
  removeJobOffline,
  saveJobOffline,
} from '@/lib/downloads';
import { ApplyCelebration } from './apply-moment/ApplyCelebration';
import { WORKPLACE_QUESTIONS, hasAnyAnswer } from '@/lib/reverseInterviewCatalog';
import { WOMEN_SAFETY_SIGNAL_DEFS } from '@/lib/womenSafetyCatalog';
import type { AppStackParamList } from '@/navigation/types';
import type {
  PublicJob,
  WomenSafety,
  WomenSafetyTier,
  WorkplaceAnswers,
} from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobDetail'>;
type Route = RouteProp<AppStackParamList, 'JobDetail'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function JobDetailScreenInner() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const t = useTranslate();
  const [appliedNow, setAppliedNow] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  // True when the apply was saved to the offline queue (no connection)
  // rather than delivered. The applied card swaps to the offline copy.
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  // Cover letter — optional, multiline, only surfaces in Career mode
  // (Today mode is one-tap express-interest with no note).
  const [coverNote, setCoverNote] = useState('');
  // Team-member declaration. Only relevant when seeker.workType==='team'.
  const [teamMembers, setTeamMembers] = useState<Array<{ name: string; phone: string }>>([]);

  // Detail fetch — when the network call fails, fall back to the
  // offline cache. The screen still renders fully if we have a cached
  // copy of this job (Download Center → tap a job → here works offline).
  const detail = useQuery({
    queryKey: ['job', route.params.jobId],
    queryFn: async () => {
      try {
        return await jobsApi.detail(route.params.jobId);
      } catch (err) {
        const cached = await getJobOffline(route.params.jobId);
        if (cached) {
          return { job: cached.job };
        }
        throw err;
      }
    },
  });

  // Downloaded state. The toggle saves / removes the cache copy of this
  // job; whenever the network detail re-fetches, we refresh the saved
  // copy so it doesn't go stale.
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void isJobDownloaded(route.params.jobId).then((v) => {
      if (!cancelled) setDownloaded(v);
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.jobId]);

  // Keep cache fresh whenever the network gives us a new copy.
  useEffect(() => {
    if (downloaded && detail.data?.job) {
      void saveJobOffline(detail.data.job).catch(() => undefined);
    }
  }, [downloaded, detail.data]);

  async function toggleDownload() {
    if (!detail.data?.job) return;
    haptic('light');
    if (downloaded) {
      await removeJobOffline(detail.data.job.id);
      setDownloaded(false);
    } else {
      try {
        await saveJobOffline(detail.data.job);
        setDownloaded(true);
      } catch {
        haptic('error');
      }
    }
  }

  // Resolve initial saved state from the saved-list — server doesn't
  // expose saved-by-me on the detail endpoint yet, so we derive it.
  const savedList = useQuery({
    queryKey: ['jobs', 'saved'],
    queryFn: () => jobsApi.listSaved(),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (savedList.data && saved === null) {
      setSaved(
        savedList.data.jobs.some((j) => j.id === route.params.jobId),
      );
    }
  }, [savedList.data, route.params.jobId, saved]);

  const saveMutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? jobsApi.save(route.params.jobId)
        : jobsApi.unsave(route.params.jobId),
    onMutate: (next) => {
      // Optimistic toggle so the heart fills instantly.
      setSaved(next);
      haptic('light');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'saved'] });
    },
    onError: () => {
      // Roll back.
      setSaved((s) => !s);
      haptic('error');
    },
  });

  /** Build the apply request body from the current form state. */
  function buildApplyPayload(): ApplyPayload {
    const cleanedMembers = teamMembers
      .map((m) => ({ name: m.name.trim(), phone: m.phone.trim() }))
      .filter((m) => m.name && m.phone);
    return {
      coverNote: coverNote.trim() || undefined,
      teamMembers: cleanedMembers.length > 0 ? cleanedMembers : undefined,
      referrerId: route.params.ref,
    };
  }

  const applyMutation = useMutation({
    mutationFn: () => applicationsApi.apply(route.params.jobId, buildApplyPayload()),
    onSuccess: () => {
      setAppliedNow(true);
      setApplyError(null);
      setShowCelebration(true);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        haptic('error');
        setApplyError(t('job_detail.errors.already_applied'));
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.code === 'JOB_NOT_OPEN') {
        haptic('error');
        setApplyError(t('job_detail.errors.job_not_open'));
      } else if (err instanceof ApiError && err.isTransient) {
        // No connection (or a server hiccup). Don't lose the application
        // — queue it; useOfflineQueueSync sends it when the worker is
        // back online.
        void enqueueApplication({
          jobId: route.params.jobId,
          payload: buildApplyPayload(),
        });
        setQueuedOffline(true);
        setAppliedNow(true);
        setApplyError(null);
        haptic('success');
      } else {
        haptic('error');
        setApplyError(err instanceof Error ? err.message : t('job_detail.errors.generic'));
      }
    },
  });

  /**
   * One-tap "I'm interested" — the Today-mode equivalent of Apply.
   * Hits the lightweight `/express-interest` endpoint so the row gets
   * flagged for the employer's priority queue. Career mode never
   * touches this mutation; the existing applyMutation stays the only
   * path for the full-form Apply Now flow.
   */
  const interestMutation = useMutation({
    mutationFn: () => applicationsApi.expressInterest(route.params.jobId),
    onSuccess: () => {
      setAppliedNow(true);
      setApplyError(null);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        setApplyError(t('job_detail.errors.already_interested'));
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.code === 'JOB_NOT_OPEN') {
        setApplyError(t('job_detail.errors.job_not_open'));
      } else {
        setApplyError(err instanceof Error ? err.message : t('job_detail.errors.generic'));
      }
    },
  });

  // Today mode swaps the sticky CTA to a one-tap "I'm interested"
  // button. Defaults to 'career' so existing deep-links and any caller
  // that doesn't pass `fromMode` lands on the original Apply Now flow
  // unchanged.
  const fromMode = route.params.fromMode ?? 'career';
  const isTodayMode = fromMode === 'today';

  // ─── Loading + error ──────────────────────────────────────────────────────

  if (detail.isLoading) {
    return (
      <Screen>
        <Header t={t} onClose={() => navigation.goBack()} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            gap: spacing.lg,
          }}
        >
          <SkeletonCard lines={2} />
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </Screen>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <Header t={t} onClose={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('job_detail.load_error.eyebrow')}
            title={t('job_detail.load_error.title')}
            message={t('job_detail.load_error.message')}
            cta={{ label: t('job_detail.load_error.close'), onPress: () => navigation.goBack() }}
          />
        </View>
      </Screen>
    );
  }

  const job = detail.data.job;
  const employerName =
    job.employer?.companyName ?? job.employer?.name ?? t('jobs.card.default_employer');
  const typeLabel = formatType(job.type, t);
  const distanceLabel =
    job.distanceMeters != null
      ? job.distanceMeters < 1000
        ? t('job_detail.distance_away_m', { n: job.distanceMeters })
        : t('job_detail.distance_away_km', { n: (job.distanceMeters / 1000).toFixed(1) })
      : null;
  const timeLabel = formatScheduleTime(job.schedule, t);

  async function onShare() {
    haptic('light');
    // Rich, WhatsApp-friendly message — blue-collar networks share
    // job leads on WhatsApp constantly, so the body must read cleanly
    // on a single-line preview. Order: who's hiring, what role, pay,
    // where, and a tappable Doondo link.
    const lines: string[] = [];
    lines.push(`💼 ${job.title}`);
    // Default-employer label comes from translations now, so we keep the
    // raw English literal out of the comparison and just check whether
    // the employer object actually has a name we should attribute.
    if (
      employerName &&
      employerName !== t('jobs.card.default_employer')
    ) {
      lines.push(`at ${employerName}`);
    }
    lines.push('');
    lines.push(`💰 ${formatPay(job.pay, t)}`);
    const where = [job.location.area, job.location.city]
      .filter(Boolean)
      .join(', ');
    if (where) lines.push(`📍 ${where}`);
    if (job.urgent) lines.push(t('job_detail.share.urgent_line'));
    lines.push('');
    lines.push(t('job_detail.share.see_apply'));
    // Carry the sharer's user id as ?ref= — if the recipient applies
    // via this link and gets hired, the sharer earns a ₹100 referral
    // bonus credited to their wallet.
    const sharerRef = user?.id ? `?ref=${user.id}` : '';
    lines.push(`https://doondo.app/jobs/${job.id}${sharerRef}`);
    if (user?.id) {
      lines.push('');
      lines.push(t('job_detail.share.referral_bonus'));
    }
    try {
      await Share.share({
        message: lines.join('\n'),
        title: job.title,
      });
    } catch {
      // Share dialog cancelled — no-op.
    }
  }

  function toggleSave() {
    if (saved === null) return; // still resolving
    saveMutation.mutate(!saved);
  }

  return (
    <Screen>
      {showCelebration && (
        <ApplyCelebration
          onClose={() => {
            setShowCelebration(false);
            navigation.goBack();
          }}
        />
      )}

      <Header
        t={t}
        onClose={() => navigation.goBack()}
        onShare={() => void onShare()}
        onDownloadToggle={() => void toggleDownload()}
        downloaded={downloaded}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing['7xl'] + 80, // room for sticky apply row
          gap: spacing.xl,
        }}
      >
        {/* Company + title card */}
        <View
          style={{
            padding: spacing.lg,
            borderRadius: radii.lg,
            backgroundColor: theme.bg.surface,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <Pressable
              onPress={() => {
                if (!job.employer?.id) return;
                haptic('selection');
                navigation.navigate('EmployerDetail', { userId: job.employer.id });
              }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Avatar
                name={employerName}
                photoUrl={job.employer?.photoUrl ?? null}
                size={56}
                premium={job.employer?.isVerified}
              />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Pressable
                onPress={() => {
                  if (!job.employer?.id) return;
                  haptic('selection');
                  navigation.navigate('EmployerDetail', { userId: job.employer.id });
                }}
                hitSlop={6}
              >
                <Text variant="footnote" tone="tertiary" numberOfLines={1}>
                  {employerName}
                  {job.employer?.isVerified ? '  ✓' : ''}
                  {job.employer?.id ? '  ›' : ''}
                </Text>
              </Pressable>
              <Text variant="title" weight="medium" numberOfLines={2}>
                {job.title}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: radii.pill,
                backgroundColor: theme.status.successSubtle,
              }}
            >
              <Text variant="caption" weight="medium" style={{ color: theme.status.success }}>
                {typeLabel}
              </Text>
            </View>
          </View>

          {/* Pay range */}
          <Text variant="display" weight="medium" style={{ color: theme.text.primary }} display>
            {formatPay(job.pay, t)}
          </Text>

          {/* Pay transparency — "Typical pay for X in Y: ₹450–600 / day" */}
          <PayTransparencyLine job={job} t={t} />
        </View>

        {/* Pills with icon prefix */}
        <View style={{ gap: spacing.sm }}>
          <DetailRow icon="📍" label={job.location.city || job.location.address} />
          {distanceLabel && <DetailRow icon="📍" label={distanceLabel} />}
          {timeLabel && <DetailRow icon="🕐" label={timeLabel} />}
          <DetailRow icon="🕐" label={typeLabel} />
          {job.workMode && job.workMode !== 'onsite' ? (
            <DetailRow
              icon={job.workMode === 'remote' ? '🏠' : '🏢'}
              label={job.workMode === 'remote' ? t('job_detail.work_mode.remote') : t('job_detail.work_mode.hybrid')}
            />
          ) : null}
          {job.urgent && (
            <DetailRow icon="⚡" label={t('job_detail.urgent_pill')} tone={theme.status.warning} />
          )}
          {job.project ? (
            <DetailRow
              icon="📅"
              label={t('job_detail.project_pill', {
                days: job.project.totalDays,
                start: job.project.startDate,
                end: job.project.endDate,
              })}
              tone={theme.brand.accent}
            />
          ) : null}
        </View>

        {/* Job Description */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodyLarge" weight="medium">
            {t('job_detail.section.description')}
          </Text>
          {job.audioDescriptionUrl ? (
            <AudioDescriptionPill
              t={t}
              uri={job.audioDescriptionUrl}
              durationSeconds={job.audioDescriptionDurationSeconds ?? 0}
            />
          ) : null}
          <Text variant="body" tone="secondary">
            {job.description}
          </Text>
        </View>

        {/* Requirements — derived from job.skills */}
        {job.skills.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodyLarge" weight="medium">
              {t('job_detail.section.requirements')}
            </Text>
            <View style={{ gap: spacing.xs }}>
              {job.skills.map((s) => (
                <RequirementItem key={s} label={requirementLabel(s, t)} color={theme.status.success} />
              ))}
            </View>
          </View>
        )}

        {/* Reverse Interview — the employer's public answers to the
           questions workers care about (pay, PPE, contract, women's
           facilities). Self-hides when the employer answered none. */}
        {job.workplaceAnswers && hasAnyAnswer(job.workplaceAnswers) ? (
          <WorkplaceAnswersPanel answers={job.workplaceAnswers} t={t} />
        ) : null}

        {/* Doondo for Women — the employer's declared women-safety
           signals. Self-hides when the employer declared none. */}
        {job.womenSafety && job.womenSafetyTier !== 'none' ? (
          <WomenSafetyPanel
            womenSafety={job.womenSafety}
            tier={job.womenSafetyTier}
            t={t}
          />
        ) : null}

        {/* Smart Resume — tailor the worker's own history to this exact
           job before applying. AI re-orders skills, re-words past roles,
           and writes a job-tuned summary the worker reviews. */}
        {!appliedNow ? (
          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyLarge" weight="medium">
                {t('smart_resume.card_title')}
              </Text>
              <Text variant="footnote" tone="secondary">
                {t('smart_resume.card_body')}
              </Text>
              <Button
                label={t('smart_resume.card_cta')}
                variant="secondary"
                size="sm"
                onPress={() =>
                  navigation.navigate('TailoredResume', {
                    jobId: route.params.jobId,
                    jobTitle: job.title,
                  })
                }
              />
            </View>
          </Card>
        ) : null}

        {/* Cover letter — optional, Career mode only. Multiline,
           preserves line breaks. Sent with the application; the employer
           sees it on ApplicantDetail. */}
        {!isTodayMode && !appliedNow ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodyLarge" weight="medium">
              {t('job_detail.cover_letter')}
              <Text variant="footnote" tone="tertiary"> · {t('job_detail.cover_letter_optional')}</Text>
            </Text>
            <Text variant="footnote" tone="secondary">
              {t('job_detail.cover_letter_hint')}
            </Text>
            <CoverNoteField
              t={t}
              value={coverNote}
              onChange={setCoverNote}
            />
          </View>
        ) : null}

        {/* Team-apply hint — shown only when the seeker has marked their
           profile as a team. Tells them how many heads will be sent in
           with this Application so they can sanity-check before tapping. */}
        {!appliedNow && user?.workType === 'team' && (user.teamSize ?? 0) >= 2 ? (
          <TeamMembersField
            t={t}
            teamSize={user.teamSize ?? 0}
            members={teamMembers}
            onChange={setTeamMembers}
          />
        ) : null}

        {appliedNow && (
          <Card premium>
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">
                {queuedOffline
                  ? t('job_detail.applied_card.offline_queued_title')
                  : isTodayMode
                    ? t('job_detail.applied_card.interest_sent_title')
                    : t('job_detail.applied_card.applied_sent_title')}
              </Text>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                {queuedOffline
                  ? t('job_detail.applied_card.offline_queued_message')
                  : isTodayMode
                    ? t('job_detail.applied_card.interest_sent_message')
                    : t('job_detail.applied_card.applied_sent_message')}
              </Text>
              {/* No "call employer" while offline — the application
                 hasn't reached them yet. */}
              {!queuedOffline && (
                <CallEmployerButton t={t} jobId={route.params.jobId} />
              )}
            </View>
          </Card>
        )}

        {applyError && !appliedNow && (
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            {applyError}
          </Text>
        )}

        {/* Wage Strike Alerts (#46) — a quiet, always-available link. Flags
           are anonymous and never shown individually; only an aggregate
           signal surfaces once enough workers report the same job. */}
        <Pressable
          onPress={() => {
            haptic('selection');
            navigation.navigate('ReportWageIssue', { jobId: route.params.jobId, jobTitle: job.title });
          }}
          hitSlop={8}
          style={{ alignSelf: 'center', paddingVertical: spacing.sm }}
        >
          <Text variant="footnote" tone="tertiary">
            {t('job_detail.report_wage_issue_cta')}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Sticky Apply Now + Save heart */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
          backgroundColor: theme.bg.canvas,
          borderTopWidth: 0.5,
          borderTopColor: theme.border.default,
          flexDirection: 'row',
          gap: spacing.md,
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          {/*
            CTA branches on `fromMode`:
              - 'today'                  → "I'm interested" one-tap
              - 'career' | 'this_week'   → "Apply Now" full flow
            Both use PrimaryStickyCTA, which renders a real
            LinearGradient fill behind the label so the blue background
            is structural, not dependent on the Pressable's dynamic
            style function (which was previously producing a white-on-
            white render in some states).
          */}
          {isTodayMode ? (
            <PrimaryStickyCTA
              label={
                appliedNow
                  ? t('job_detail.interest_sent')
                  : interestMutation.isPending
                    ? t('job_detail.sending')
                    : t('job_detail.im_interested')
              }
              accessibilityLabel={t('job_detail.cta_a11y.im_interested')}
              disabled={appliedNow || interestMutation.isPending}
              onPress={() => {
                if (appliedNow || interestMutation.isPending) return;
                haptic('light');
                interestMutation.mutate();
              }}
            />
          ) : (
            <PrimaryStickyCTA
              label={
                appliedNow
                  ? t('job_detail.applied')
                  : applyMutation.isPending
                    ? t('job_detail.sending')
                    : t('job_detail.apply_now')
              }
              accessibilityLabel={t('job_detail.cta_a11y.apply_now')}
              disabled={appliedNow || applyMutation.isPending}
              onPress={() => {
                if (appliedNow || applyMutation.isPending) return;
                haptic('light');
                applyMutation.mutate();
              }}
            />
          )}
        </View>
        <Pressable
          onPress={toggleSave}
          disabled={saved === null}
          accessibilityRole="button"
          accessibilityLabel={saved ? t('job_detail.save.unsave_a11y') : t('job_detail.save.save_a11y')}
          style={{
            width: 52,
            height: 52,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: theme.border.default,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.bg.surface,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              lineHeight: 28,
              color: saved ? theme.status.danger : theme.text.tertiary,
            }}
          >
            {saved ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  t,
  onClose,
  onShare,
  onDownloadToggle,
  downloaded,
}: {
  t: TFn;
  onClose: () => void;
  onShare?: () => void;
  onDownloadToggle?: () => void;
  downloaded?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
      }}
    >
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Pressable onPress={onClose} hitSlop={12} style={{ width: 40 }}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
      </View>
      <Text
        variant="bodyLarge"
        weight="medium"
        style={{ textAlign: 'center' }}
        numberOfLines={1}
      >
        {t('job_detail.header_title')}
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md }}>
        {onDownloadToggle && (
          <Pressable
            onPress={onDownloadToggle}
            hitSlop={12}
            accessibilityLabel={downloaded ? t('job_detail.header.remove_offline_a11y') : t('job_detail.header.save_offline_a11y')}
          >
            <Feather
              name="download"
              size={18}
              color={downloaded ? theme.brand.primary : theme.text.primary}
            />
          </Pressable>
        )}
        {onShare && (
          <Pressable
            onPress={onShare}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('job_detail.header.share_a11y')}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#EFF6FF', // blue-50
              borderWidth: 0.5,
              borderColor: theme.border.default, // blue-200
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="share" size={15} color={theme.brand.primary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * The sticky-footer primary action button. The blue fill lives on a
 * LinearGradient inside a wrapper View, not on the Pressable's dynamic
 * style function — that was the root cause of the white-on-white render
 * the seekers were seeing, because the Pressable's style was sometimes
 * losing the backgroundColor between state transitions.
 *
 * Disabled state stays at 0.7 opacity (not 0.55) so the label is still
 * legible while the network call is in flight, and the gradient gives
 * the button a richer "real button" feel on both light and dark canvases.
 */
function PrimaryStickyCTA({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        borderRadius: radii.lg,
        overflow: 'hidden',
        opacity: disabled ? 0.7 : pressed ? 0.92 : 1,
        shadowColor: '#1D4ED8',
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        // Solid fallback under the gradient — if the gradient ever fails
        // to render (rare, but it has happened on older Android builds),
        // the button is still vivid blue with white text instead of the
        // previous white-on-white state.
        backgroundColor: theme.brand.primary,
      })}
    >
      <LinearGradient
        colors={['#3B82F6', theme.brand.primary, '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingVertical: 16,
          paddingHorizontal: spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: '800',
            letterSpacing: 0.3,
          }}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

// ─── Team-members field ─────────────────────────────────────────────────────

/**
 * Inline editor for the team-member declaration on a team application.
 * Up to 4 entries. The seeker types their teammates' names + phones so
 * the employer knows who's actually coming. No accept-flow in v1 — just
 * an honest list.
 */
function TeamMembersField({
  t,
  teamSize,
  members,
  onChange,
}: {
  t: TFn;
  teamSize: number;
  members: Array<{ name: string; phone: string }>;
  onChange: (next: Array<{ name: string; phone: string }>) => void;
}) {
  const { theme } = useTheme();
  const cap = Math.min(4, Math.max(0, teamSize - 1)); // exclude the seeker themselves

  const update = (i: number, patch: Partial<{ name: string; phone: string }>) => {
    onChange(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const add = () => {
    if (members.length >= cap) return;
    haptic('selection');
    onChange([...members, { name: '', phone: '' }]);
  };
  const remove = (i: number) => {
    haptic('light');
    onChange(members.filter((_, idx) => idx !== i));
  };

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: '#EFF6FF',
        borderWidth: 0.5,
        borderColor: theme.border.default,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 18 }}>👥</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E40AF' }}>
            {t('job_detail.team.applying_as_team', { count: teamSize })}
          </Text>
          <Text style={{ fontSize: 12, color: '#1E3A8A', opacity: 0.85 }}>
            {t('job_detail.team.add_teammates_hint')}
          </Text>
        </View>
      </View>

      {members.map((m, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            gap: spacing.xs,
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <TextInput
              value={m.name}
              onChangeText={(text) => update(i, { name: text })}
              placeholder={t('job_detail.team.teammate_name_placeholder', { n: i + 1 })}
              placeholderTextColor={theme.text.tertiary}
              autoCapitalize="words"
              style={{
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                borderRadius: radii.md,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm - 2,
                fontSize: 13,
                color: theme.text.primary,
              }}
            />
            <TextInput
              value={m.phone}
              onChangeText={(text) => update(i, { phone: text })}
              placeholder={t('job_detail.team.phone_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              keyboardType="phone-pad"
              style={{
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.border.default,
                borderRadius: radii.md,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm - 2,
                fontSize: 13,
                color: theme.text.primary,
              }}
            />
          </View>
          <Pressable onPress={() => remove(i)} hitSlop={6}>
            <Text style={{ fontSize: 16, color: theme.status.danger }}>×</Text>
          </Pressable>
        </View>
      ))}

      {members.length < cap ? (
        <Pressable
          onPress={add}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
            borderRadius: radii.pill,
            backgroundColor: theme.bg.surface,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.brand.primary }}>
            {t('job_detail.team.add_teammate_btn')}
          </Text>
        </Pressable>
      ) : (
        <Text style={{ fontSize: 11, color: theme.text.secondary }}>
          {t('job_detail.team.max_teammates_msg', { cap, team: teamSize })}
        </Text>
      )}
    </View>
  );
}

// ─── Cover letter field ─────────────────────────────────────────────────────

function CoverNoteField({
  t,
  value,
  onChange,
}: {
  t: TFn;
  value: string;
  onChange: (next: string) => void;
}) {
  const { theme } = useTheme();
  const remaining = 500 - value.length;
  return (
    <View style={{ gap: 4 }}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.length <= 500 ? text : text.slice(0, 500))}
        placeholder={t('job_detail.cover_letter_field.placeholder')}
        placeholderTextColor={theme.text.tertiary}
        multiline
        textAlignVertical="top"
        style={{
          backgroundColor: theme.bg.surface,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          fontSize: 14,
          lineHeight: 20,
          color: theme.text.primary,
          minHeight: 120,
        }}
      />
      <Text
        style={{
          fontSize: 11,
          color: theme.text.tertiary,
          textAlign: 'right',
        }}
      >
        {t('job_detail.cover_letter_field.chars_remaining', { n: remaining })}
      </Text>
    </View>
  );
}

// ─── Call employer button ───────────────────────────────────────────────────

/**
 * One-tap call to the employer. Only renders after the seeker has
 * applied (or expressed interest) — the backend gates the contact
 * reveal on an Application existing.
 *
 * v1 uses an unmasked tel: link. When we sign up for a telephony
 * provider (Exotel / Knowlarity), the reveal endpoint returns a masked
 * relay number instead — no client change needed.
 */
function CallEmployerButton({ t, jobId }: { t: TFn; jobId: string }) {
  const mutation = useMutation({
    mutationFn: () => contactApi.revealEmployer(jobId),
    onSuccess: (data) => {
      const phone = data.contact.phone;
      if (!phone) {
        haptic('error');
        Alert.alert(
          t('job_detail.call.couldnt_call_title'),
          t('job_detail.call.couldnt_call_body'),
        );
        return;
      }
      haptic('selection');
      const clean = phone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert(
          t('job_detail.call.couldnt_open_dialer'),
          t('job_detail.call.their_number_is', { phone }),
        );
      });
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : t('job_detail.call.couldnt_reveal');
      Alert.alert(t('job_detail.call.not_available_yet'), msg);
    },
  });

  return (
    <Pressable
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      accessibilityRole="button"
      accessibilityLabel={t('job_detail.call.call_a11y')}
      style={({ pressed }) => ({
        marginTop: 4,
        paddingVertical: 12,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981',
        opacity: mutation.isPending ? 0.5 : pressed ? 0.85 : 1,
        shadowColor: '#10B981',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      })}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
        {mutation.isPending ? t('job_detail.call.opening_dialer') : t('job_detail.call.call_employer')}
      </Text>
    </Pressable>
  );
}

// ─── Audio description pill ─────────────────────────────────────────────────

/**
 * Compact play/pause pill rendered above the text description when the
 * employer attached a voice note. Uses expo-audio's `useAudioPlayer`
 * hook (SDK 54+); if that import resolves to `undefined` (older
 * installs), the pill falls back to a static "Voice description
 * available" label and the seeker can still read the text.
 */
function AudioDescriptionPill({
  t,
  uri,
  durationSeconds,
}: {
  t: TFn;
  uri: string;
  durationSeconds: number;
}) {
  const { theme } = useTheme();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<{
    play: () => void;
    pause: () => void;
    release?: () => void;
    addListener?: (
      ev: string,
      cb: (e: { isPlaying?: boolean; currentTime?: number }) => void,
    ) => { remove: () => void };
  } | null>(null);

  // Lazy-load to keep the screen alive on devices/builds where the
  // expo-audio API surface doesn't match what we expect.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('expo-audio') as Record<string, unknown>;
        const createFn =
          (mod.AudioModule as { createAudioPlayer?: unknown } | undefined)
            ?.createAudioPlayer ??
          (mod.createAudioPlayer as unknown);
        if (typeof createFn !== 'function') {
          if (!cancelled) setSupported(false);
          return;
        }
        const instance = (createFn as (src: { uri: string }) => unknown)({
          uri,
        }) as {
          play: () => void;
          pause: () => void;
          release?: () => void;
          addListener?: (
            ev: string,
            cb: (e: { isPlaying?: boolean; currentTime?: number }) => void,
          ) => { remove: () => void };
        };
        if (cancelled) {
          instance.release?.();
          return;
        }
        playerRef.current = instance;
        setSupported(true);
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
      playerRef.current?.release?.();
      playerRef.current = null;
    };
  }, [uri]);

  // Tick elapsed time while playing — gives us a progress bar without
  // depending on the player's event system.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (durationSeconds > 0 && next >= durationSeconds) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, durationSeconds]);

  const toggle = () => {
    if (supported !== true || !playerRef.current) return;
    haptic('selection');
    if (playing) {
      try {
        playerRef.current.pause();
      } catch {
        /* ignore */
      }
      setPlaying(false);
    } else {
      try {
        playerRef.current.play();
      } catch {
        /* ignore */
      }
      setPlaying(true);
      setElapsed(0);
    }
  };

  // Read-only "audio available" fallback when the player API isn't
  // accessible. The text description below is still readable.
  if (supported === false) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.sm,
          borderRadius: radii.md,
          backgroundColor: '#EFF6FF',
          borderWidth: 0.5,
          borderColor: theme.border.default,
        }}
      >
        <Text style={{ fontSize: 14 }}>🎙</Text>
        <Text style={{ fontSize: 12, color: '#1E40AF', flex: 1 }}>
          {t('job_detail.audio.voice_unsupported', { duration: formatSeconds(durationSeconds) })}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={supported !== true}
      accessibilityRole="button"
      accessibilityLabel={playing ? t('job_detail.audio.pause_a11y') : t('job_detail.audio.play_a11y')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: '#EFF6FF',
        borderWidth: 0.5,
        borderColor: theme.border.default,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: theme.brand.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 14 }}>
          {playing ? '❚❚' : '▶'}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E40AF', flex: 1 }}>
        {playing
          ? t('job_detail.audio.voice_playing', {
              elapsed: formatSeconds(elapsed),
              duration: formatSeconds(durationSeconds),
            })
          : t('job_detail.audio.voice_listen', { duration: formatSeconds(durationSeconds) })}
      </Text>
    </Pressable>
  );
}

function formatSeconds(s: number): string {
  if (!s || s < 1) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Pay transparency line — fetches typical pay for (type, city, period)
 * and renders a single italic line under the pay row when there's
 * enough data. Silent when sample size < 5 so the worker never sees
 * a misleading "typical" based on three outliers.
 */
function PayTransparencyLine({ job, t }: { job: PublicJob; t: TFn }) {
  const { theme } = useTheme();
  const stats = useQuery({
    queryKey: [
      'jobs',
      'pay-stats',
      job.type,
      job.location.city,
      job.pay.period,
    ],
    queryFn: () =>
      jobsApi.payStats({
        type: job.type,
        city: job.location.city,
        period: job.pay.period,
      }),
    staleTime: 10 * 60_000, // 10 min — these stats barely change minute-to-minute
    enabled: Boolean(job.location.city && job.type && job.pay.period),
  });

  if (
    !stats.data ||
    stats.data.p25 == null ||
    stats.data.p75 == null ||
    stats.data.sampleSize < 5
  ) {
    return null;
  }

  const p25 = Math.round(stats.data.p25 / 100); // paise → rupees
  const p75 = Math.round(stats.data.p75 / 100);
  const periodSuffix = t(`job_detail.pay_transparency.period_${job.pay.period}`);
  const typeLabel = t(`job_detail.pay_transparency.type_${job.type}`);
  const offerAmount = Math.round(job.pay.amount / 100);

  // Soft hint when this employer is significantly below the typical band.
  const isLowOffer = offerAmount < p25 * 0.85;
  // Soft hint when this employer is at or above the upper quartile.
  const isStrongOffer = offerAmount >= p75;

  let trailingNote: string | null = null;
  if (isLowOffer) {
    trailingNote = t('job_detail.pay_transparency.below_typical');
  } else if (isStrongOffer) {
    trailingNote = t('job_detail.pay_transparency.above_typical');
  }

  return (
    <View style={{ marginTop: 4 }}>
      <Text
        style={{
          fontSize: 12,
          fontStyle: 'italic',
          color: theme.text.tertiary,
          lineHeight: 17,
        }}
      >
        {t('job_detail.pay_transparency.headline', {
          type: typeLabel,
          city: job.location.city,
          p25: p25.toLocaleString('en-IN'),
          p75: p75.toLocaleString('en-IN'),
          period: periodSuffix,
        })}
        {trailingNote ? (
          <Text
            style={{
              color: isLowOffer ? '#B91C1C' : '#047857',
              fontWeight: '600',
              fontStyle: 'normal',
            }}
          >
            {'  '}
            {trailingNote}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

// formatPeriodShort + prettyType used to live here as English-only helpers;
// they're now inlined into PayTransparencyLine via t() calls so they pick up
// the active locale instead of being baked in at module load.

function DetailRow({ icon, label, tone }: { icon: string; label: string; tone?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ fontSize: 16, lineHeight: 22 }}>{icon}</Text>
      <Text variant="body" style={{ color: tone ?? theme.text.primary }}>
        {label}
      </Text>
    </View>
  );
}

function RequirementItem({ label, color }: { label: string; color: string }) {
  // a11y label kept untranslated ('required') because screen readers cycle
  // through visible labels separately; the checkmark glyph is decorative.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{ fontSize: 18, lineHeight: 20, color }}
          accessibilityElementsHidden
        >
          ✓
        </Text>
      </View>
      <Text variant="body">{label}</Text>
    </View>
  );
}

// ─── Reverse Interview panel ─────────────────────────────────────────────────

/**
 * Read-only panel showing the employer's answers to the five standard
 * worker questions. The seeker reads this *before* applying — the terms
 * are on the record. A question the employer skipped shows "Not
 * answered", which is itself a signal.
 */
function WorkplaceAnswersPanel({
  answers,
  t,
}: {
  answers: WorkplaceAnswers;
  t: TFn;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="bodyLarge" weight="medium">
        {t('reverse_interview.detail_section')}
      </Text>
      <Card>
        <View style={{ gap: spacing.md }}>
          {WORKPLACE_QUESTIONS.map((q) => (
            <View
              key={q.field}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
            >
              <Text variant="footnote" style={{ flex: 1 }}>
                {t(q.key)}
              </Text>
              <WorkplaceAnswerBadge value={answers[q.field] ?? null} t={t} />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

/**
 * Read-only "Doondo for Women" panel. Lists the five women-safety
 * signals — a green tick for each the employer declared, a dim mark for
 * the rest — and states plainly that these are employer claims.
 */
function WomenSafetyPanel({
  womenSafety,
  tier,
  t,
}: {
  womenSafety: WomenSafety;
  tier: WomenSafetyTier;
  t: TFn;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="bodyLarge" weight="medium">
          {t('women.panel_title')}
        </Text>
        <WomenSafetyBadge tier={tier} compact />
      </View>
      <Card>
        <View style={{ gap: spacing.sm }}>
          {WOMEN_SAFETY_SIGNAL_DEFS.map((sig) => {
            const on = womenSafety[sig.key] === true;
            return (
              <View
                key={sig.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <Text style={{ fontSize: 15, width: 22 }}>{on ? '✅' : '▫️'}</Text>
                <Text
                  variant="footnote"
                  tone={on ? 'primary' : 'tertiary'}
                  style={{ flex: 1 }}
                >
                  {t(`women.signal.${sig.key}`)}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
      <Text variant="caption" tone="tertiary">
        {t('women.disclaimer')}
      </Text>
    </View>
  );
}

/** A Yes / No / Not-answered badge for one Reverse Interview question. */
function WorkplaceAnswerBadge({
  value,
  t,
}: {
  value: boolean | null;
  t: TFn;
}) {
  const { theme } = useTheme();

  const config =
    value === true
      ? {
          label: `✓ ${t('reverse_interview.yes')}`,
          bg: theme.status.successSubtle,
          border: theme.status.success,
          fg: theme.status.success,
        }
      : value === false
        ? {
            label: `✗ ${t('reverse_interview.no')}`,
            bg: '#FEE2E2',
            border: '#FCA5A5',
            fg: '#991B1B',
          }
        : {
            label: t('reverse_interview.not_answered'),
            bg: theme.bg.surface,
            border: theme.border.default,
            fg: theme.text.tertiary,
          };

  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 3,
        borderRadius: radii.pill,
        borderWidth: 0.5,
        borderColor: config.border,
        backgroundColor: config.bg,
      }}
    >
      <Text variant="caption" weight="medium" style={{ color: config.fg }}>
        {config.label}
      </Text>
    </View>
  );
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatPay(pay: PublicJob['pay'], t: TFn): string {
  const minor = 100;
  const symbol = pay.currency === 'INR' ? '₹' : pay.currency === 'USD' ? '$' : pay.currency + ' ';
  // 'en-IN' grouping for lakh/crore display, language-independent — see PR 1.
  const lo = (pay.amount / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const hi = pay.amountMax
    ? (pay.amountMax / minor).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : null;
  const periodKey =
    pay.period === 'hour'
      ? 'common.pay_period.suffix_hour'
      : pay.period === 'day'
        ? 'common.pay_period.suffix_day'
        : pay.period === 'week'
          ? 'common.pay_period.suffix_week'
          : pay.period === 'month'
            ? 'common.pay_period.suffix_month'
            : 'common.pay_period.suffix_fixed';
  return hi
    ? `${symbol}${lo} – ${symbol}${hi}${t(periodKey)}`
    : `${symbol}${lo}${t(periodKey)}`;
}

function formatType(type: PublicJob['type'], t: TFn): string {
  return t(`common.job_type.${type}`);
}

function formatScheduleTime(schedule: PublicJob['schedule'], t: TFn): string | null {
  if (!schedule) return null;
  const start = schedule.startTime;
  const end = schedule.endTime;
  if (start && end) {
    // AM/PM token kept English-only — universally recognizable, and Indic
    // locales for 12-hour clocks don't have a clean colloquial equivalent
    // most readers prefer over "AM"/"PM".
    return `${prettyTime(start)} – ${prettyTime(end)}`;
  }
  if (schedule.hoursPerDay != null) {
    return t('job_detail.schedule_hours', { n: schedule.hoursPerDay });
  }
  return null;
}

function prettyTime(timeStr: string): string {
  // Server stores HH:mm in 24-hour. Convert to friendly 12-hour for the UI.
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = mStr ?? '00';
  if (!Number.isFinite(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function requirementLabel(skill: string, t: TFn): string {
  // Skills come in lowercase from the form. Display them as "X: Required"
  // via the locale-aware suffix key so non-English readings stay natural.
  const trimmed = skill.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'driving' || lower === 'license' || lower === 'driving_license') {
    return t('home.job_card.driving_license_required');
  }
  if (lower.includes('required') || lower.includes('needed')) {
    return capitalize(trimmed);
  }
  return t('home.job_card.skill_required_suffix', { skill: capitalize(trimmed) });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Public export wrapped in seeker theme ───────────────────────────────────

export function JobDetailScreen() {
  return (
    <SeekerThemeOverride>
      <JobDetailScreenInner />
    </SeekerThemeOverride>
  );
}
