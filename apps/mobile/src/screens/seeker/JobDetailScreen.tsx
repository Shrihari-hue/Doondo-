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

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import {
  getJobOffline,
  isJobDownloaded,
  removeJobOffline,
  saveJobOffline,
} from '@/lib/downloads';
import { ApplyCelebration } from './apply-moment/ApplyCelebration';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'JobDetail'>;
type Route = RouteProp<AppStackParamList, 'JobDetail'>;

function JobDetailScreenInner() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [appliedNow, setAppliedNow] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);

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

  const applyMutation = useMutation({
    mutationFn: () => applicationsApi.apply(route.params.jobId),
    onSuccess: () => {
      setAppliedNow(true);
      setApplyError(null);
      setShowCelebration(true);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
    onError: (err) => {
      haptic('error');
      if (err instanceof ApiError && err.code === 'APPLICATION_ALREADY_EXISTS') {
        setApplyError('You already applied to this job.');
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.code === 'JOB_NOT_OPEN') {
        setApplyError('This job is no longer accepting applications.');
      } else {
        setApplyError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    },
  });

  // ─── Loading + error ──────────────────────────────────────────────────────

  if (detail.isLoading) {
    return (
      <Screen>
        <Header onClose={() => navigation.goBack()} />
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
        <Header onClose={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow="UNAVAILABLE"
            title="Couldn't load this job"
            message="It may have been removed, or your connection dropped."
            cta={{ label: 'Close', onPress: () => navigation.goBack() }}
          />
        </View>
      </Screen>
    );
  }

  const job = detail.data.job;
  const employerName =
    job.employer?.companyName ?? job.employer?.name ?? 'Doondo Employer';
  const typeLabel = formatType(job.type);
  const distanceLabel =
    job.distanceMeters != null
      ? job.distanceMeters < 1000
        ? `${job.distanceMeters} m away`
        : `${(job.distanceMeters / 1000).toFixed(1)} km away`
      : null;
  const timeLabel = formatScheduleTime(job.schedule);

  async function onShare() {
    haptic('light');
    try {
      await Share.share({
        message: `${job.title} at ${employerName} — ${formatPay(job.pay)}. See on Doondo.`,
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
            {formatPay(job.pay)}
          </Text>
        </View>

        {/* Pills with icon prefix */}
        <View style={{ gap: spacing.sm }}>
          <DetailRow icon="📍" label={job.location.city || job.location.address} />
          {distanceLabel && <DetailRow icon="📍" label={distanceLabel} />}
          {timeLabel && <DetailRow icon="🕐" label={timeLabel} />}
          <DetailRow icon="🕐" label={typeLabel} />
          {job.urgent && (
            <DetailRow icon="⚡" label="Urgent" tone={theme.status.warning} />
          )}
        </View>

        {/* Job Description */}
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodyLarge" weight="medium">
            Job Description
          </Text>
          <Text variant="body" tone="secondary">
            {job.description}
          </Text>
        </View>

        {/* Requirements — derived from job.skills */}
        {job.skills.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodyLarge" weight="medium">
              Requirements
            </Text>
            <View style={{ gap: spacing.xs }}>
              {job.skills.map((s) => (
                <RequirementItem key={s} label={requirementLabel(s)} color={theme.status.success} />
              ))}
            </View>
          </View>
        )}

        {appliedNow && (
          <Card premium>
            <View style={{ gap: spacing.xs, alignItems: 'center' }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">
                Application sent
              </Text>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                Track its status in the Applications tab.
              </Text>
            </View>
          </Card>
        )}

        {applyError && !appliedNow && (
          <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
            {applyError}
          </Text>
        )}
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
            Hardcoded #2563EB / #FFFFFF to bulletproof against any
            theme-token resolution mismatch in production builds — the
            Apply CTA is the single most important button on the screen
            and must never read as invisible-on-white.
          */}
          <Pressable
            onPress={() => {
              if (appliedNow || applyMutation.isPending) return;
              haptic('light');
              applyMutation.mutate();
            }}
            disabled={appliedNow || applyMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Apply Now"
            style={({ pressed }) => ({
              backgroundColor: '#2563EB',
              paddingVertical: 14,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity:
                appliedNow || applyMutation.isPending
                  ? 0.55
                  : pressed
                    ? 0.85
                    : 1,
              shadowColor: '#2563EB',
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            })}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: '700',
                letterSpacing: 0.2,
              }}
            >
              {appliedNow
                ? 'Applied ✓'
                : applyMutation.isPending
                  ? 'Sending…'
                  : 'Apply Now'}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={toggleSave}
          disabled={saved === null}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Unsave job' : 'Save job'}
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
  onClose,
  onShare,
  onDownloadToggle,
  downloaded,
}: {
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
      <Pressable onPress={onClose} hitSlop={12} style={{ width: 40 }}>
        <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
      </Pressable>
      <Text
        variant="bodyLarge"
        weight="medium"
        style={{ flex: 1, textAlign: 'center' }}
      >
        Job Details
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {onDownloadToggle && (
          <Pressable
            onPress={onDownloadToggle}
            hitSlop={12}
            accessibilityLabel={downloaded ? 'Remove from offline' : 'Save for offline'}
          >
            <Text style={{ fontSize: 18, color: downloaded ? theme.brand.hero : theme.text.primary }}>
              {downloaded ? '📥' : '⤓'}
            </Text>
          </Pressable>
        )}
        {onShare && (
          <Pressable onPress={onShare} hitSlop={12}>
            <Text style={{ fontSize: 18, color: theme.text.primary }}>↗</Text>
          </Pressable>
        )}
        {!onShare && !onDownloadToggle && <View style={{ width: 40 }} />}
      </View>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

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
          accessibilityLabel="required"
        >
          ✓
        </Text>
      </View>
      <Text variant="body">{label}</Text>
    </View>
  );
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

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
    ? `${symbol}${lo} – ${symbol}${hi}${periodMap[pay.period]}`
    : `${symbol}${lo}${periodMap[pay.period]}`;
}

function formatType(t: PublicJob['type']): string {
  return ({
    full_time: 'Full Time',
    part_time: 'Part Time',
    gig: 'Gig',
    shift: 'Shift',
    contract: 'Contract',
  } as const)[t];
}

function formatScheduleTime(schedule: PublicJob['schedule']): string | null {
  if (!schedule) return null;
  const start = schedule.startTime;
  const end = schedule.endTime;
  if (start && end) {
    return `${prettyTime(start)} – ${prettyTime(end)}`;
  }
  if (schedule.hoursPerDay != null) {
    return `${schedule.hoursPerDay} hr/day`;
  }
  return null;
}

function prettyTime(t: string): string {
  // Server stores HH:mm in 24-hour. Convert to friendly 12-hour for the UI.
  const [hStr, mStr] = t.split(':');
  const h = Number(hStr);
  const m = mStr ?? '00';
  if (!Number.isFinite(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

function requirementLabel(skill: string): string {
  // Skills come in lowercase from the form. Display them as "X required"
  // to match the mockup ("Bike required", "Smartphone required"). If the
  // skill already says "required" or similar, leave it.
  const trimmed = skill.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower.includes('required') || lower.includes('needed')) {
    return capitalize(trimmed);
  }
  return `${capitalize(trimmed)} required`;
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
