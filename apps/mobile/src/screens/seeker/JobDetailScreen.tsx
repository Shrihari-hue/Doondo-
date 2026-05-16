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
import { Alert, Linking, Pressable, ScrollView, Share, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { contactApi } from '@/api/contact.api';
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
        setApplyError("You've already shown interest in this job.");
        setAppliedNow(true);
      } else if (err instanceof ApiError && err.code === 'JOB_NOT_OPEN') {
        setApplyError('This job is no longer accepting applications.');
      } else {
        setApplyError(err instanceof Error ? err.message : 'Something went wrong.');
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
    // Rich, WhatsApp-friendly message — blue-collar networks share
    // job leads on WhatsApp constantly, so the body must read cleanly
    // on a single-line preview. Order: who's hiring, what role, pay,
    // where, and a tappable Doondo link.
    const lines: string[] = [];
    lines.push(`💼 ${job.title}`);
    if (employerName && employerName !== 'Doondo Employer') {
      lines.push(`at ${employerName}`);
    }
    lines.push('');
    lines.push(`💰 ${formatPay(job.pay)}`);
    const where = [job.location.area, job.location.city]
      .filter(Boolean)
      .join(', ');
    if (where) lines.push(`📍 ${where}`);
    if (job.urgent) lines.push(`⚡ Urgent — start soon`);
    lines.push('');
    lines.push(`See and apply on Doondo:`);
    lines.push(`https://doondo.app/jobs/${job.id}`);
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

          {/* Pay transparency — "Typical pay for X in Y: ₹450–600 / day" */}
          <PayTransparencyLine job={job} />
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
          {job.audioDescriptionUrl ? (
            <AudioDescriptionPill
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
            <View style={{ gap: spacing.sm, alignItems: 'center' }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">
                {isTodayMode ? 'Interest sent' : 'Application sent'}
              </Text>
              <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                {isTodayMode
                  ? 'You can call the employer now — they\'re expecting to hear from you.'
                  : 'Track its status in the Applications tab.'}
              </Text>
              <CallEmployerButton jobId={route.params.jobId} />
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
            CTA branches on `fromMode`:
              - 'today'                  → "I'm interested" one-tap
              - 'career' | 'this_week'   → "Apply Now" full flow
            The Career path is unchanged from before Phase 2 so all
            existing deep-links and the Jobs tab keep working exactly
            as they did. Hardcoded colors so the button is always
            visible regardless of theme resolution.
          */}
          {isTodayMode ? (
            <Pressable
              onPress={() => {
                if (appliedNow || interestMutation.isPending) return;
                haptic('light');
                interestMutation.mutate();
              }}
              disabled={appliedNow || interestMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="I'm interested"
              style={({ pressed }) => ({
                backgroundColor: '#2563EB',
                paddingVertical: 14,
                borderRadius: radii.lg,
                alignItems: 'center',
                justifyContent: 'center',
                opacity:
                  appliedNow || interestMutation.isPending
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
                  ? "✓ Interest sent"
                  : interestMutation.isPending
                    ? 'Sending…'
                    : "✋ I'm interested"}
              </Text>
            </Pressable>
          ) : (
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
          )}
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
          <Pressable
            onPress={onShare}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share this job"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#EFF6FF', // blue-50
              borderWidth: 0.5,
              borderColor: '#BFDBFE', // blue-200
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 16, color: '#2563EB', fontWeight: '700' }}>
              ↗
            </Text>
          </Pressable>
        )}
        {!onShare && !onDownloadToggle && <View style={{ width: 40 }} />}
      </View>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

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
function CallEmployerButton({ jobId }: { jobId: string }) {
  const mutation = useMutation({
    mutationFn: () => contactApi.revealEmployer(jobId),
    onSuccess: (data) => {
      const phone = data.contact.phone;
      if (!phone) {
        haptic('error');
        Alert.alert(
          "Couldn't call",
          'The employer hasn\'t added a phone number yet. Try messaging them in chat.',
        );
        return;
      }
      haptic('selection');
      const clean = phone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert("Couldn't open dialer", `Their number is ${phone}`);
      });
    },
    onError: (err) => {
      haptic('error');
      const msg =
        err instanceof ApiError ? err.message : "Couldn't reveal contact.";
      Alert.alert('Not available yet', msg);
    },
  });

  return (
    <Pressable
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      accessibilityRole="button"
      accessibilityLabel="Call the employer"
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
        {mutation.isPending ? 'Opening dialer…' : '📞 Call employer'}
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
  uri,
  durationSeconds,
}: {
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
          borderColor: '#BFDBFE',
        }}
      >
        <Text style={{ fontSize: 14 }}>🎙</Text>
        <Text style={{ fontSize: 12, color: '#1E40AF', flex: 1 }}>
          Voice description ({formatSeconds(durationSeconds)}) — playback not
          supported on this build.
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={supported !== true}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause voice description' : 'Play voice description'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: '#EFF6FF',
        borderWidth: 0.5,
        borderColor: '#BFDBFE',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: '#2563EB',
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
          ? `Playing… ${formatSeconds(elapsed)} / ${formatSeconds(durationSeconds)}`
          : `Listen to job description (${formatSeconds(durationSeconds)})`}
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
function PayTransparencyLine({ job }: { job: PublicJob }) {
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
  const periodSuffix = formatPeriodShort(job.pay.period);
  const offerAmount = Math.round(job.pay.amount / 100);

  // Soft hint when this employer is significantly below the typical band.
  const isLowOffer = offerAmount < p25 * 0.85;
  // Soft hint when this employer is at or above the upper quartile.
  const isStrongOffer = offerAmount >= p75;

  let trailingNote: string | null = null;
  if (isLowOffer) {
    trailingNote = '• Below typical range';
  } else if (isStrongOffer) {
    trailingNote = '• Above typical range';
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
        Typical pay for {prettyType(job.type)} in {job.location.city}: ₹
        {p25.toLocaleString()}–{p75.toLocaleString()}
        {periodSuffix}
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

function formatPeriodShort(period: PublicJob['pay']['period']): string {
  switch (period) {
    case 'hour':
      return ' / hr';
    case 'day':
      return ' / day';
    case 'week':
      return ' / wk';
    case 'month':
      return ' / mo';
    case 'fixed':
      return ' (one-time)';
  }
}

function prettyType(t: PublicJob['type']): string {
  switch (t) {
    case 'full_time':
      return 'full-time roles';
    case 'part_time':
      return 'part-time roles';
    case 'gig':
      return 'gigs';
    case 'shift':
      return 'shift work';
    case 'contract':
      return 'contracts';
  }
}

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
