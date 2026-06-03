/**
 * MyApplicationsScreen — seeker's application timeline.
 *
 * Lists every job the seeker has applied to, newest first. Each card
 * shows: job title, employer name, status pill, applied date, and a
 * subtle right-chevron that opens the job detail (so the seeker can
 * see the full posting and current state in one tap).
 *
 * Status pills are color-tinted per status:
 *   pending      → neutral
 *   viewed       → info blue
 *   shortlisted  → success green
 *   rejected     → danger
 *   hired        → success-strong (also gets an interview card if one is scheduled)
 *   withdrawn    → muted
 *
 * No fake data. Empty state when there are no applications yet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Alert, FlatList, Linking, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, ErrorPanel, HireCelebration, HireShareCardPoster, TextField } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { sosApi } from '@/api/sos.api';
import { homeSafeApi } from '@/api/homeSafe.api';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { addEventToCalendar } from '@/lib/calendar';
import { saveHireShareCardToPhotos, shareHireShareCard } from '@/lib/hireShareCard';
import { getHireStartInfo } from '@/lib/hireStart';
import { openSmsComposer } from '@/lib/sos';
import { useUnratedApplications } from '@/hooks/useRatings';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { useLocale } from '@/i18n/LanguageProvider';
import { useAuthStore } from '@/stores/auth.store';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { ApplicationStatus, PublicApplication } from '@/api/types';
import type { UnratedApp } from '@/api/ratings.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;
type ShareTone = 'proud' | 'professional' | 'family';

function MyApplicationsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const { locale } = useLocale();
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 30_000,
  });

  // "Reached home safe?" prompts opened when the worker checked out.
  const homeSafeQuery = useQuery({
    queryKey: ['home-safe', 'pending'],
    queryFn: () => homeSafeApi.pending(),
    staleTime: 30_000,
  });
  const homeSafeChecks = homeSafeQuery.data ?? [];

  async function confirmHomeSafe(id: string) {
    haptic('selection');
    try {
      await homeSafeApi.confirm(id);
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['home-safe', 'pending'] });
    } catch {
      haptic('error');
    }
  }

  // Pending ratings the seeker can leave. Indexed by applicationId for
  // O(1) lookup as we render each row.
  const unratedQuery = useUnratedApplications();
  const unratedByAppId = new Map<string, UnratedApp>();
  for (const u of unratedQuery.data?.unrated ?? []) {
    unratedByAppId.set(u.applicationId, u);
  }

  const applications = query.data?.applications ?? [];
  const [celebrationApp, setCelebrationApp] = useState<PublicApplication | null>(null);
  const [celebratedIds, setCelebratedIds] = useState<string[]>([]);
  const hireShareCardRef = useRef<View>(null);
  const [shareVariant, setShareVariant] = useState<'story' | 'square'>('story');
  const [shareTone, setShareTone] = useState<ShareTone>('proud');
  const celebrationStartInfo = useMemo(
    () => (celebrationApp ? getHireStartInfo(celebrationApp, locale, t) : null),
    [celebrationApp, locale, t],
  );

  // Pipeline filter — defaults to "Open" (anything not terminal) since
  // that's what seekers want to see day-to-day. Counts drive the chip
  // labels so the screen reads as a real status dashboard.
  const [filter, setFilter] = useState<
    'open' | 'all' | ApplicationStatus
  >('open');

  const counts = useMemo(() => {
    const c: Record<ApplicationStatus, number> = {
      pending: 0,
      viewed: 0,
      shortlisted: 0,
      rejected: 0,
      hired: 0,
      withdrawn: 0,
    };
    for (const a of applications) c[a.status]++;
    return {
      ...c,
      open: c.pending + c.viewed + c.shortlisted,
      all: applications.length,
    };
  }, [applications]);

  const filtered = useMemo(() => {
    if (filter === 'all') return applications;
    if (filter === 'open') {
      return applications.filter((a) =>
        ['pending', 'viewed', 'shortlisted'].includes(a.status),
      );
    }
    return applications.filter((a) => a.status === filter);
  }, [applications, filter]);

  // Whether someone has an interview scheduled — surfaced as a callout
  // because it's the highest-value status to know about at a glance.
  const interviewCount = applications.filter(
    (a) => a.interview && a.interview.status === 'scheduled',
  ).length;

  useEffect(() => {
    if (celebrationApp) return;
    const newestUncelebratedHire = applications
      .filter((a) => {
        if (a.status !== 'hired' || !a.timeline.hiredAt) return false;
        if (celebratedIds.includes(a.id)) return false;
        const hiredAt = new Date(a.timeline.hiredAt).getTime();
        return Number.isFinite(hiredAt) && Date.now() - hiredAt < 7 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const at = new Date(a.timeline.hiredAt ?? 0).getTime();
        const bt = new Date(b.timeline.hiredAt ?? 0).getTime();
        return bt - at;
      })[0];

    if (newestUncelebratedHire) {
      setCelebratedIds((cur) => [...cur, newestUncelebratedHire.id]);
      setCelebrationApp(newestUncelebratedHire);
    }
  }, [applications, celebratedIds, celebrationApp]);

  function openJob(jobId: string) {
    haptic('selection');
    navigation.navigate('JobDetail', { jobId });
  }

  return (
    <Screen edges={[]}>
      {celebrationApp ? (
        <>
          {currentUser ? (
            <HireShareCardPoster
              ref={hireShareCardRef}
              user={currentUser}
              application={celebrationApp}
              variant={shareVariant}
              tone={shareTone}
            />
          ) : null}
          <HireCelebration
            title={
              celebrationApp.job?.title
                ? t('hire_share.celebration_title_with_role', {
                    role: celebrationApp.job.title,
                  })
                : t('hire_share.celebration_title')
            }
            subtitle={t('hire_share.celebration_subtitle')}
            details={[
              celebrationApp.job?.employer?.companyName ??
                celebrationApp.job?.employer?.name ??
                t('hire_share.employer_confirmed'),
              celebrationApp.job?.location?.area ??
                celebrationApp.job?.location?.city ??
                t('hire_share.work_details_ready'),
              ...(celebrationStartInfo ? [celebrationStartInfo.relative] : []),
            ]}
            primaryLabel={primaryCelebrationAction(celebrationApp).label}
            onPrimary={() => {
              void primaryCelebrationAction(celebrationApp).run({
                openJob,
                clear: () => setCelebrationApp(null),
                t,
              });
            }}
            secondaryLabel={secondaryCelebrationAction(celebrationApp)?.label}
            onSecondary={
              secondaryCelebrationAction(celebrationApp)
                ? () => {
                    void secondaryCelebrationAction(celebrationApp)!.run({
                      openJob,
                      clear: () => setCelebrationApp(null),
                      t,
                      shareCardRef: hireShareCardRef,
                      setShareVariant,
                      setShareTone,
                      queryClient,
                      userName: currentUser?.name ?? null,
                    });
                  }
                : undefined
            }
            onClose={() => setCelebrationApp(null)}
          />
        </>
      ) : null}

      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
        </Pressable>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: theme.text.primary,
            flex: 1,
          }}
        >
          {t('applications.title')}
        </Text>
      </View>

      {/* Pipeline summary line — what's actually moving right now. */}
      {applications.length > 0 ? (
        <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.sm }}>
          <Text
            style={{
              fontSize: 13,
              color: theme.text.secondary,
              lineHeight: 19,
            }}
          >
            {t(
              interviewCount === 1
                ? 'applications.pipeline_summary_one'
                : 'applications.pipeline_summary_other',
              {
                open: counts.open,
                shortlisted: counts.shortlisted,
                interviewCount,
                hired: counts.hired,
              },
            )}
          </Text>
        </View>
      ) : null}

      {/* Status filter chips */}
      {applications.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            gap: spacing.xs,
            paddingBottom: spacing.sm,
          }}
        >
          {(
            [
              { key: 'open', labelKey: 'applications.filters.open', count: counts.open },
              { key: 'shortlisted', labelKey: 'applications.filters.shortlisted', count: counts.shortlisted },
              { key: 'hired', labelKey: 'applications.filters.hired', count: counts.hired },
              { key: 'rejected', labelKey: 'applications.filters.rejected', count: counts.rejected },
              { key: 'all', labelKey: 'applications.filters.all', count: counts.all },
            ] as const
          ).map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  haptic('selection');
                  setFilter(f.key);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm - 2,
                  borderRadius: radii.pill,
                  backgroundColor: active ? '#2563EB' : theme.bg.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: theme.border.default,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: active ? '#FFFFFF' : theme.text.primary,
                  }}
                >
                  {t(f.labelKey)}
                  {f.count > 0 ? ` · ${f.count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : query.isError ? (
        <ErrorPanel error={query.error} onRetry={() => void query.refetch()} />
      ) : applications.length === 0 ? (
        <EmptyState
          glyph="✉"
          eyebrow={t('applications.empty.eyebrow')}
          title={t('applications.empty.title')}
          message={t('applications.empty.message')}
          cta={{
            label: t('applications.empty.cta'),
            onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
          }}
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['5xl'],
            gap: spacing.md,
          }}
          data={filtered}
          keyExtractor={(a) => a.id}
          ListHeaderComponent={
            homeSafeChecks.length > 0 ? (
              <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
                {homeSafeChecks.map((c) => (
                  <View
                    key={c.id}
                    style={{
                      backgroundColor: theme.bg.surface,
                      borderRadius: radii.lg,
                      borderWidth: 1,
                      borderColor: theme.brand.hero,
                      padding: spacing.lg,
                      gap: spacing.sm,
                    }}
                  >
                    <Text variant="body" weight="semibold">
                      {t('home_safe.title')}
                    </Text>
                    <Text variant="footnote" tone="secondary">
                      {c.jobTitle
                        ? t('home_safe.body_job', { title: c.jobTitle })
                        : t('home_safe.body')}
                    </Text>
                    <Pressable
                      onPress={() => void confirmHomeSafe(c.id)}
                      accessibilityRole="button"
                      style={{
                        marginTop: spacing.xs,
                        alignSelf: 'flex-start',
                        paddingHorizontal: spacing.lg,
                        paddingVertical: 10,
                        borderRadius: radii.pill,
                        backgroundColor: theme.brand.hero,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                        {t('home_safe.confirm')}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
                void homeSafeQuery.refetch();
              }}
              tintColor={theme.brand.hero}
            />
          }
          renderItem={({ item }) => {
            const unrated = unratedByAppId.get(item.id);
            return (
            <Pressable onPress={() => openJob(item.jobId)}>
              <View
                style={{
                  backgroundColor: theme.bg.surface,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  padding: spacing.lg,
                  gap: spacing.sm,
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 12,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: theme.text.primary,
                      }}
                      numberOfLines={1}
                    >
                      {item.job?.title ?? t('applications.fallback.job_application')}
                    </Text>
                    <Text
                      style={{ fontSize: 13, color: theme.text.secondary }}
                      numberOfLines={1}
                    >
                      {item.job?.employer?.companyName ?? item.job?.employer?.name ?? t('applications.fallback.employer')}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
                      {t('applications.applied_when', { when: formatRelative(item.timeline.appliedAt, t) })}
                    </Text>
                  </View>
                  <StatusPill t={t} status={item.status} />
                </View>

                {/* Time-boxed offer awaiting the worker's response. */}
                {item.offer?.status === 'pending' ? (
                  <OfferResponseCard application={item} />
                ) : null}

                {/* Hired: the whole working relationship — shift tools,
                    payment, briefing, dispute, call — lives in the "My Job"
                    hub. Link there rather than duplicate it here. */}
                {item.status === 'hired' && item.job?.employer?.id ? (
                  <Pressable
                    onPress={() => {
                      haptic('selection');
                      navigation.navigate('MyEmployerJob', {
                        employerId: item.job!.employer!.id,
                        employerName: item.job!.employer!.name ?? '',
                      });
                    }}
                    accessibilityRole="button"
                    style={{
                      marginTop: spacing.sm,
                      paddingVertical: 12,
                      borderRadius: radii.pill,
                      borderWidth: 0.5,
                      borderColor: theme.brand.hero,
                      alignItems: 'center',
                    }}
                  >
                    <Text variant="footnote" weight="medium" style={{ color: theme.brand.hero }}>
                      {t('applications.open_my_job')}
                    </Text>
                  </Pressable>
                ) : null}

                {/* Interview card — shown whenever there's a scheduled
                    interview (not just hired). Adds a "Starting in X"
                    countdown when the start time is within 90 minutes
                    so the seeker sees the same urgency the push gives.
                    Stays subtle once they're inside the room. */}
                {item.interview && item.interview.status === 'scheduled' && (
                  <InterviewCard
                    t={t}
                    interview={item.interview}
                    jobTitle={item.job?.title ?? t('applications.fallback.job_application')}
                  />
                )}

                {/* Anti-ghost callout — the sweep marks pending applications
                    with no employer response after 72h. We surface this as
                    a small banner so the seeker knows to move on instead
                    of waiting indefinitely. Only shown while the row is
                    still pending (a later employer response retires the
                    pill via the status change). */}
                {item.flaggedAsGhostedAt && item.status === 'pending' && (
                  <View
                    style={{
                      padding: spacing.sm,
                      borderRadius: radii.md,
                      backgroundColor: theme.status.warningSubtle,
                      borderWidth: 0.5,
                      borderColor: theme.status.warningBorder,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.xs,
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>👻</Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: '600',
                        color: theme.status.warning,
                      }}
                    >
                      {t('skill_gap_card.ghosted')}
                    </Text>
                  </View>
                )}

                {/* Skill-gap CTA — on rejected applications where the
                    server computed missing skills at the moment of
                    rejection, show "What can I learn?" with a tap that
                    fetches the recommended course and opens it. */}
                {item.status === 'rejected' &&
                  Array.isArray(item.rejectionReasons) &&
                  item.rejectionReasons.length > 0 && (
                    <SkillGapInlineCard
                      applicationId={item.id}
                      missingSkill={item.rejectionReasons[0]!}
                    />
                  )}

                {/* Rate-now prompt — only when the application is hired
                    AND the seeker hasn't yet rated. Tap pushes the
                    LeaveRating modal with the employer pre-filled. */}
                {unrated && (
                  <Pressable
                    onPress={() => {
                      haptic('selection');
                      navigation.navigate('LeaveRating', {
                        applicationId: unrated.applicationId,
                        revieweeName: unrated.otherPartyName,
                        jobTitle: unrated.jobTitle,
                      });
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.sm,
                      borderRadius: radii.md,
                      backgroundColor: theme.brand.heroSubtle,
                      borderWidth: 0.5,
                      borderColor: theme.brand.heroBorder,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 16, lineHeight: 18 }}>⭐</Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: '600',
                        color: theme.brand.hero,
                      }}
                    >
                      {t('applications.rate_now_title', { name: unrated.otherPartyName })}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.brand.hero,
                        fontWeight: '600',
                      }}
                    >
                      {t('applications.rate_now_cta')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

function buildHireShareText(
  application: PublicApplication,
  t: TFn,
  tone: ShareTone = 'proud',
  userName?: string | null,
): string {
  const jobTitle = application.job?.title ?? t('hire_share.fallback_role_caption');
  const employer =
    application.job?.employer?.companyName ??
    application.job?.employer?.name ??
    t('hire_share.fallback_employer_caption');
  const area =
    application.job?.location?.area ?? application.job?.location?.city ?? null;
  if (tone === 'professional') {
    return area
      ? t('hire_share.share_caption_professional_with_area', {
          name: userName ?? t('hire_share.notify_family_name_fallback'),
          role: jobTitle,
          employer,
          area,
        })
      : t('hire_share.share_caption_professional', {
          name: userName ?? t('hire_share.notify_family_name_fallback'),
          role: jobTitle,
          employer,
        });
  }
  if (tone === 'family') {
    return area
      ? t('hire_share.share_caption_family_with_area', {
          name: userName ?? t('hire_share.notify_family_name_fallback'),
          role: jobTitle,
          employer,
          area,
        })
      : t('hire_share.share_caption_family', {
          name: userName ?? t('hire_share.notify_family_name_fallback'),
          role: jobTitle,
          employer,
        });
  }
  return area
    ? t('hire_share.share_caption_with_area', { role: jobTitle, employer, area })
    : t('hire_share.share_caption', { role: jobTitle, employer });
}

type CelebrationActionContext = {
  openJob: (jobId: string) => void;
  clear: () => void;
  t: TFn;
  shareCardRef?: RefObject<View | null>;
  setShareVariant?: (variant: 'story' | 'square') => void;
  setShareTone?: (tone: ShareTone) => void;
  queryClient?: ReturnType<typeof useQueryClient>;
  userName?: string | null;
};

type CelebrationAction = {
  label: string;
  run: (ctx: CelebrationActionContext) => Promise<void>;
};

function primaryCelebrationAction(application: PublicApplication): CelebrationAction {
  const coords = application.job?.location?.coordinates ?? null;
  if (coords) {
    return {
      label: 'Open route',
      run: async ({ clear }) => {
        const [lng, lat] = coords;
        clear();
        await Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
      },
    };
  }
  return {
    label: 'View job',
    run: async ({ clear, openJob }) => {
      const jobId = application.jobId;
      clear();
      openJob(jobId);
    },
  };
}

function secondaryCelebrationAction(
  application: PublicApplication,
): CelebrationAction | null {
  if (application.interview && application.interview.status === 'scheduled') {
    return {
      label: 'Add to calendar',
      run: async ({ t }) => {
        const interview = application.interview!;
        const extraNote = interview.meetingLink
          ? `\n\nMeeting link: ${interview.meetingLink}`
          : '';
        await addEventToCalendar({
          title: application.job?.title ?? t('applications.fallback.job_application'),
          startDate: new Date(interview.scheduledFor),
          location:
            interview.location ??
            application.job?.location?.address ??
            null,
          notes: `${interview.notes ?? ''}${extraNote}`.trim() || null,
        });
      },
    };
  }

  return {
    label: 'Share this win',
    run: async (ctx) => {
      if (!ctx.shareCardRef?.current) {
        await Share.share({
          title: ctx.t('hire_share.share_title'),
          message: buildHireShareText(application, ctx.t, 'proud', ctx.userName),
        });
        return;
      }
      const choice = await chooseShareVariant(ctx.t);
      if (!choice) return;
      const variant =
        choice.kind === 'square'
          ? 'square'
          : choice.kind === 'save'
            ? choice.variant
            : 'story';
      const tone = await chooseShareTone(ctx.t);
      if (!tone) return;
      ctx.setShareVariant?.(variant);
      ctx.setShareTone?.(tone);
      await new Promise((resolve) => setTimeout(resolve, 80));

      if (choice.kind === 'save') {
        const saved = await saveHireShareCardToPhotos({
          targetRef: ctx.shareCardRef,
        });
        if (saved.ok) {
          showTrustCirclePrompt(
            application,
            ctx,
            ctx.t('hire_share.save_success_title'),
            ctx.t('hire_share.save_success_body'),
          );
          return;
        }
        Alert.alert(
          ctx.t(
            saved.reason === 'denied'
              ? 'hire_share.save_permission_title'
              : 'hire_share.save_error_title',
          ),
          ctx.t(
            saved.reason === 'denied'
              ? 'hire_share.save_permission_body'
              : 'hire_share.save_error_body',
          ),
        );
        return;
      }

      const result = await shareHireShareCard({
        targetRef: ctx.shareCardRef,
        caption: buildHireShareText(application, ctx.t, tone, ctx.userName),
        dialogTitle:
          variant === 'story'
            ? ctx.t('hire_share.share_variant_story')
            : ctx.t('hire_share.share_variant_square'),
      });
      if (result.ok) {
        showTrustCirclePrompt(
          application,
          ctx,
          ctx.t('hire_share.caption_copied_title'),
          ctx.t('hire_share.caption_copied_body'),
        );
        return;
      }
      if (!result.ok) {
        await Share.share({
          title: ctx.t('hire_share.share_title'),
          message: buildHireShareText(application, ctx.t, tone, ctx.userName),
        });
      }
    },
  };
}

function showTrustCirclePrompt(
  application: PublicApplication,
  ctx: CelebrationActionContext,
  title: string,
  message: string,
) {
  Alert.alert(title, message, [
    {
      text: ctx.t('common.cancel'),
      style: 'cancel',
    },
    {
      text: ctx.t('hire_share.notify_family'),
      onPress: () => {
        void notifyTrustCircle(application, ctx);
      },
    },
  ]);
}

async function notifyTrustCircle(
  application: PublicApplication,
  ctx: CelebrationActionContext,
) {
  if (!ctx.queryClient) {
    Alert.alert(
      ctx.t('hire_share.notify_family_error_title'),
      ctx.t('hire_share.notify_family_error_body'),
    );
    return;
  }

  try {
    const trustCircle = await ctx.queryClient.fetchQuery({
      queryKey: ['trustCircle'],
      queryFn: () => sosApi.getTrustCircle(),
      staleTime: 30_000,
    });

    const contacts = [...(trustCircle.trustCircle ?? [])]
      .sort((a, b) => {
        const aRank = a.relationship?.toLowerCase() === 'family' ? 0 : 1;
        const bRank = b.relationship?.toLowerCase() === 'family' ? 0 : 1;
        return aRank - bRank;
      })
      .map((contact) => contact.phone)
      .filter(Boolean);

    if (contacts.length === 0) {
      Alert.alert(
        ctx.t('hire_share.notify_family_empty_title'),
        ctx.t('hire_share.notify_family_empty_body'),
      );
      return;
    }

    const result = await openSmsComposer({
      phones: contacts,
      body: buildTrustCircleMessage(application, ctx.t, ctx.userName),
    });

    if (!result.opened) {
      Alert.alert(
        ctx.t('hire_share.notify_family_error_title'),
        ctx.t('hire_share.notify_family_error_body'),
      );
    }
  } catch {
    Alert.alert(
      ctx.t('hire_share.notify_family_error_title'),
      ctx.t('hire_share.notify_family_error_body'),
    );
  }
}

function buildTrustCircleMessage(
  application: PublicApplication,
  t: TFn,
  userName?: string | null,
): string {
  const role = application.job?.title ?? t('hire_share.fallback_role_caption');
  const employer =
    application.job?.employer?.companyName ??
    application.job?.employer?.name ??
    t('hire_share.fallback_employer_caption');
  const area = application.job?.location?.area ?? application.job?.location?.city ?? null;
  return area
    ? t('hire_share.notify_family_message_with_area', {
        name: userName ?? t('hire_share.notify_family_name_fallback'),
        role,
        employer,
        area,
      })
    : t('hire_share.notify_family_message', {
        name: userName ?? t('hire_share.notify_family_name_fallback'),
        role,
        employer,
      });
}

function chooseShareVariant(
  t: TFn,
): Promise<{ kind: 'story' | 'square' } | { kind: 'save'; variant: 'story' | 'square' } | null> {
  return new Promise((resolve) => {
    Alert.alert(
      t('hire_share.share_variant_title'),
      t('hire_share.share_variant_body'),
      [
        {
          text: t('hire_share.share_variant_story'),
          onPress: () => resolve({ kind: 'story' }),
        },
        {
          text: t('hire_share.share_variant_square'),
          onPress: () => resolve({ kind: 'square' }),
        },
        {
          text: t('hire_share.save_to_photos'),
          onPress: () => {
            void chooseSaveFormat(t).then((choice) => resolve(choice));
          },
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

function chooseSaveFormat(
  t: TFn,
): Promise<{ kind: 'save'; variant: 'story' | 'square' } | null> {
  return new Promise((resolve) => {
    Alert.alert(
      t('hire_share.save_variant_title'),
      t('hire_share.save_variant_body'),
      [
        {
          text: t('hire_share.share_variant_story'),
          onPress: () => resolve({ kind: 'save', variant: 'story' }),
        },
        {
          text: t('hire_share.share_variant_square'),
          onPress: () => resolve({ kind: 'save', variant: 'square' }),
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

function chooseShareTone(
  t: TFn,
): Promise<ShareTone | null> {
  return new Promise((resolve) => {
    Alert.alert(
      t('hire_share.share_tone_title'),
      t('hire_share.share_tone_body'),
      [
        {
          text: t('hire_share.share_tone_proud'),
          onPress: () => resolve('proud'),
        },
        {
          text: t('hire_share.share_tone_professional'),
          onPress: () => resolve('professional'),
        },
        {
          text: t('hire_share.share_tone_family'),
          onPress: () => resolve('family'),
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function StatusPill({ t, status }: { t: TFn; status: ApplicationStatus }) {
  const { theme } = useTheme();
  const meta = statusMeta(status, theme, t);
  return (
    <View
      style={{
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radii.pill,
        backgroundColor: meta.bg,
        borderWidth: 0.5,
        borderColor: meta.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: meta.fg,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function statusMeta(
  status: ApplicationStatus,
  theme: ReturnType<typeof useTheme>['theme'],
  t: TFn,
) {
  // Labels come from applications.status.* — colors stay local since they're
  // theme-driven rather than translatable content.
  const label = t(`applications.status.${status}`);
  switch (status) {
    case 'pending':
      return {
        label,
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.secondary,
      };
    case 'viewed':
      return {
        label,
        bg: theme.status.infoSubtle,
        border: theme.status.infoBorder,
        fg: theme.status.info,
      };
    case 'shortlisted':
      return {
        label,
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'rejected':
      return {
        label,
        bg: theme.status.dangerSubtle,
        border: theme.status.dangerBorder,
        fg: theme.status.danger,
      };
    case 'hired':
      return {
        label,
        bg: theme.status.successSubtle,
        border: theme.status.successBorder,
        fg: theme.status.success,
      };
    case 'withdrawn':
      return {
        label,
        bg: theme.bg.muted,
        border: theme.border.default,
        fg: theme.text.tertiary,
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string, t: TFn): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return t('applications.time.just_now');
  if (diffMin < 60) return t('applications.time.min_ago', { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t('applications.time.hr_ago', { n: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7)
    return t(
      diffDay === 1 ? 'applications.time.day_ago_one' : 'applications.time.day_ago_other',
      { n: diffDay },
    );
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatInterviewWhen(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} at ${new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

/**
 * Interview card on a single application row.
 *
 * Visual logic:
 *   - When start time is within 90 minutes → "Starting in X min" pill on
 *     the hero card. Uses the warning tone so it reads as urgent without
 *     being alarming.
 *   - Otherwise → the calm success-tinted "Interview scheduled at …" card.
 *   - The mode + location/link line is always shown so the worker can
 *     glance and know where to go.
 *
 * Updates itself every minute so the countdown stays fresh while the
 * screen is open. Uses a single setInterval, cleared on unmount.
 */
function InterviewCard({
  t,
  interview,
  jobTitle,
}: {
  t: TFn;
  interview: NonNullable<PublicApplication['interview']>;
  jobTitle: string;
}) {
  const { theme } = useTheme();
  const [now, setNow] = useState(Date.now());
  // 'idle' | 'adding' | 'added' | 'failed' — drives the calendar button copy.
  const [calState, setCalState] = useState<'idle' | 'adding' | 'added' | 'failed'>(
    'idle',
  );

  // Tick once a minute. Within 90 min we re-render so the countdown
  // stays current; outside that window the rerender is a no-op visually.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const scheduled = new Date(interview.scheduledFor).getTime();
  const minutesUntil = Math.round((scheduled - now) / 60_000);
  const soon = minutesUntil >= 0 && minutesUntil <= 90;

  const modeLabel =
    interview.mode === 'in_person'
      ? t('interview_card.mode_in_person')
      : interview.mode === 'video'
        ? t('interview_card.mode_video')
        : t('interview_card.mode_phone');
  const where =
    interview.mode === 'in_person' && interview.location
      ? interview.location
      : interview.mode === 'video' && interview.meetingLink
        ? interview.meetingLink
        : null;

  async function onAddToCalendar() {
    if (calState === 'adding' || calState === 'added') return;
    haptic('selection');
    setCalState('adding');
    const result = await addEventToCalendar({
      title: `Interview — ${jobTitle}`,
      startDate: new Date(interview.scheduledFor),
      location: interview.location ?? undefined,
      notes:
        `${modeLabel} interview` +
        (interview.meetingLink ? `\nMeeting link: ${interview.meetingLink}` : '') +
        (interview.notes ? `\n\n${interview.notes}` : ''),
    });
    if (result.ok) {
      haptic('success');
      setCalState('added');
    } else {
      haptic('error');
      setCalState('failed');
      Alert.alert(
        t('interview_card.cal_fail_title'),
        result.reason === 'permission_denied'
          ? t('interview_card.cal_fail_permission')
          : result.reason === 'no_calendar'
            ? t('interview_card.cal_fail_no_calendar')
            : t('interview_card.cal_fail_generic'),
      );
    }
  }

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: soon
          ? theme.status.warningSubtle
          : theme.status.successSubtle,
        borderWidth: 0.5,
        borderColor: soon
          ? theme.status.warningBorder
          : theme.status.successBorder,
        gap: spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text style={{ fontSize: 14 }}>{soon ? '⏰' : '📅'}</Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: soon ? theme.status.warning : theme.status.success,
            flex: 1,
          }}
        >
          {soon
            ? minutesUntil <= 1
              ? t('interview_card.starting_now')
              : t('interview_card.starting_in', { n: minutesUntil })
            : t('applications.interview_scheduled', {
                when: formatInterviewWhen(interview.scheduledFor),
              })}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          color: theme.text.secondary,
        }}
        numberOfLines={2}
      >
        {modeLabel}
        {where ? ` · ${where}` : ''}
      </Text>

      {/* Add-to-calendar — drops a device calendar event with a 60-min
          alarm. Hidden once the interview has already started. */}
      {minutesUntil > 0 && (
        <Pressable
          onPress={onAddToCalendar}
          disabled={calState === 'adding' || calState === 'added'}
          accessibilityRole="button"
          accessibilityLabel={
            calState === 'added'
              ? t('interview_card.a11y_added')
              : t('interview_card.a11y_add')
          }
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            marginTop: 4,
            paddingVertical: 6,
            paddingHorizontal: spacing.sm,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor:
              calState === 'added'
                ? theme.status.successBorder
                : theme.border.default,
            backgroundColor: theme.bg.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 12 }}>{calState === 'added' ? '✓' : '📆'}</Text>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color:
                calState === 'added'
                  ? theme.status.success
                  : theme.text.secondary,
            }}
          >
            {calState === 'adding'
              ? t('interview_card.adding')
              : calState === 'added'
                ? t('interview_card.added')
                : t('interview_card.add_to_calendar')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Shift check-in card on the hired-application row.
 *
 * Reads the application's check-in history (cached) and decides
 * which action to offer next:
 *   - No prior check-in today → primary "Check in" button (warning tone).
 *   - Last event was check-in → "Check out" button + the check-in time.
 *   - Last event was check-out → "Check in again" (rare — same day re-entry).
 *
 * On tap:
 *   1. Capture a selfie via the front camera (compressed by selfie.ts).
 *   2. Get device coords (best-effort; fall back to last known).
 *   3. Post to /applications/:id/check-in or /check-out.
 *   4. Refresh the query so the card updates and the employer's row
 *      gets the new state on their next fetch.
 *
 * Errors are surfaced inline so the seeker can retry without re-reading
 * the doc.
 */




/**
 * Offer-response card. When an employer has extended a time-boxed offer,
 * the worker sees the countdown and accepts (→ hired) or declines right
 * here. Accepting late is impossible — the server rejects an expired
 * offer — so the countdown is honest urgency, not decoration.
 */
function OfferResponseCard({ application }: { application: PublicApplication }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [countering, setCountering] = useState(false);
  const [counterRupees, setCounterRupees] = useState('');

  const offeredRupees =
    application.offer.wageAmount != null
      ? Math.round(application.offer.wageAmount / 100).toLocaleString('en-IN')
      : null;

  const expiresAt = application.offer.expiresAt;
  const whenLabel = expiresAt
    ? (() => {
        const ms = new Date(expiresAt).getTime() - Date.now();
        if (ms <= 0) return t('offer_response.expiring');
        const h = Math.floor(ms / 3_600_000);
        return h >= 1
          ? t('offer_response.expires_h', { h })
          : t('offer_response.expires_m', { m: Math.max(1, Math.round(ms / 60_000)) });
      })()
    : '';

  async function respond(action: 'accept' | 'decline' | 'counter', counterAmount?: number) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.respondToOffer(application.id, action, counterAmount);
      haptic(action === 'decline' ? 'warning' : 'success');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.brand.hero,
        backgroundColor: theme.brand.heroSubtle,
        gap: spacing.sm,
      }}
    >
      <Text variant="bodyLarge" weight="semibold">
        {offeredRupees
          ? t('offer_response.title_wage', { wage: offeredRupees })
          : t('offer_response.title')}
      </Text>
      <Text variant="footnote" tone="secondary">
        {whenLabel}
      </Text>

      {countering ? (
        <View style={{ gap: spacing.sm }}>
          <TextField
            value={counterRupees}
            onChangeText={(v) => setCounterRupees(v.replace(/[^0-9]/g, ''))}
            placeholder={t('offer_response.counter_placeholder')}
            keyboardType="number-pad"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() =>
                counterRupees ? void respond('counter', Number(counterRupees) * 100) : undefined
              }
              disabled={busy || !counterRupees}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: radii.pill,
                backgroundColor: theme.brand.hero,
                alignItems: 'center',
                opacity: busy || !counterRupees ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                {t('offer_response.counter_send')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCountering(false)}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: theme.text.secondary, fontWeight: '600', fontSize: 13 }}>
                {t('offer_response.counter_cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Pressable
            onPress={() => void respond('accept')}
            disabled={busy}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: radii.pill,
              backgroundColor: '#10B981',
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
              {t('offer_response.accept')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setCountering(true)}
            disabled={busy}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 10,
              borderRadius: radii.pill,
              borderWidth: 0.5,
              borderColor: theme.brand.hero,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.brand.hero, fontWeight: '700', fontSize: 13 }}>
              {t('offer_response.counter')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void respond('decline')}
            disabled={busy}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 10,
              borderRadius: radii.pill,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.text.secondary, fontWeight: '600', fontSize: 13 }}>
              {t('offer_response.decline')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}



/**
 * Inline "what can I learn?" CTA for rejected applications.
 *
 * Renders compact by default. On press, fetches the skill-gap result
 * once and either navigates straight to the recommended course or
 * falls back to the full Courses catalog if nothing in the catalogue
 * matches the gap.
 *
 * Kept in this file rather than promoted to /components because it
 * leans on the local nav type and the screen-specific theme; there's
 * no other place it makes sense to render it yet.
 */
function SkillGapInlineCard({
  applicationId,
  missingSkill,
}: {
  applicationId: string;
  missingSkill: string;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    if (loading) return;
    haptic('selection');
    setLoading(true);
    setError(null);
    try {
      const res = await applicationsApi.skillGap(applicationId);
      if (res.recommendedCourse) {
        navigation.navigate('CourseDetail', {
          courseId: res.recommendedCourse.id,
        });
      } else {
        // No catalogue match — open the full courses screen so the
        // seeker can browse rather than dead-end.
        navigation.navigate('Courses');
      }
    } catch (err) {
      setError(
        friendlyErrorMessage(err, t('skill_gap_card.error')),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: theme.status.infoSubtle,
        borderWidth: 0.5,
        borderColor: theme.status.infoBorder,
        opacity: pressed || loading ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 16 }}>📚</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: theme.status.info,
          }}
          numberOfLines={2}
        >
          {error
            ? error
            : t('skill_gap_card.missing', { skill: missingSkill })}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.status.info,
        }}
      >
        {loading ? '…' : t('skill_gap_card.open')}
      </Text>
    </Pressable>
  );
}

export function MyApplicationsScreen() {
  return (
    <SeekerThemeOverride>
      <MyApplicationsInner />
    </SeekerThemeOverride>
  );
}
