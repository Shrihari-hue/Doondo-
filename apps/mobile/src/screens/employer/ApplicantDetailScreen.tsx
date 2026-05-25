/**
 * ApplicantDetailScreen — modal with full applicant context + actions.
 *
 * Shows the seeker's avatar, skills, location, cover note (if any), and
 * the job they applied to. Action row at the bottom drives the state
 * machine: Mark viewed → Shortlist → Hire / Reject. Buttons disable
 * once they're no longer valid.
 *
 * Hire reuses the cinematic ApplyCelebration flow shape — a champagne
 * burst with "You hired {name}." So the human moment is mirrored on
 * both sides of the marketplace.
 */

import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState, TextField, FormError, PaymentConfirmationPanel, CraftShowcase, HireCelebration } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi, type ApplicantEntry, type SchedulePayload } from '@/api/applications.api';
import type { SkillDocument } from '@/api/types';
import { contactApi } from '@/api/contact.api';
import { coursesApi } from '@/api/courses.api';
import { endorsementsApi } from '@/api/endorsements.api';
import { profileViewsApi } from '@/api/profileViews.api';
import { UpiPaymentPanel } from './UpiPaymentPanel';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { useUnratedApplications } from '@/hooks/useRatings';
import { openResume, formatResumeSize } from '@/lib/resume';
import { prettifySkill } from '@/lib/trades';
import { formatRange, formatTenure, sortWorkHistory, tenureMonths } from '@/lib/workHistory';
import type { AppStackParamList } from '@/navigation/types';
import type {
  ApplicationStatus,
  CraftPhoto,
  InterviewMode,
  PublicInterview,
  SeekerConstitution,
  WorkExperience,
} from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList, 'ApplicantDetail'>;
type Route = RouteProp<AppStackParamList, 'ApplicantDetail'>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Localised, uppercase-style status label for the identity eyebrow. */
function statusEyebrow(status: ApplicationStatus, t: TFn): string {
  const key = status === 'pending' ? 'status_new' : `status_${status}`;
  return t(`employer.applicant_detail.${key}`);
}

/** Group the seeker's uploaded skill-proof files by skill. */
function groupSkillDocuments(
  docs: SkillDocument[],
): Array<{ skill: string; docs: SkillDocument[] }> {
  const map = new Map<string, SkillDocument[]>();
  for (const d of docs) {
    const arr = map.get(d.skill) ?? [];
    arr.push(d);
    map.set(d.skill, arr);
  }
  return [...map.entries()].map(([skill, list]) => ({ skill, docs: list }));
}

export function ApplicantDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const t = useTranslate();
  const [showHired, setShowHired] = useState(false);

  // We keep the applicant detail in cache (seeded from list views) when
  // possible, but always refetch to ensure fresh status.
  const query = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      // Reuse the list endpoint — applicant detail isn't a separate route
      // yet (it'd be a one-applicant fetch). The flat /applications/:id
      // endpoint already exists for seeker side, but it filters by
      // seekerId. For Phase 3 v1, we read from the cross-employer list
      // and pluck the matching one.
      const { applications } = await applicationsApi.listForEmployer({ limit: 100 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Applicant not found');
      return found;
    },
  });

  // Record a profile-view impression on the seeker. Idempotent within a
  // UTC day per (seeker, viewer), so re-entering this screen multiple times
  // in a single day doesn't inflate their counter. Fire-and-forget.
  useEffect(() => {
    const seekerId = query.data?.seeker?.id;
    if (!seekerId) return;
    void profileViewsApi.recordView(seekerId).catch(() => undefined);
  }, [query.data?.seeker?.id]);

  // Auto-mark as viewed the first time the employer opens this card.
  useEffect(() => {
    if (query.data && query.data.status === 'pending') {
      void applicationsApi
        .markViewed(query.data.id)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['applicants', 'detail', query.data!.id] }),
        )
        .catch(() => undefined);
    }
  }, [query.data?.id, query.data?.status, queryClient]);

  const transition = useMutation({
    mutationFn: async (next: 'shortlisted' | 'rejected' | 'hired') => {
      const id = query.data!.id;
      if (next === 'shortlisted') return applicationsApi.shortlist(id);
      if (next === 'rejected') return applicationsApi.reject(id);
      return applicationsApi.hire(id);
    },
    onSuccess: (_, variables) => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      if (variables === 'hired') {
        setShowHired(true);
      } else {
        navigation.goBack();
      }
    },
    onError: () => haptic('error'),
  });

  // Pending-rating lookup. This hook MUST run before the loading / error
  // early returns below — calling it later would change the hook count
  // once `query` resolves, which crashes the screen with "rendered more
  // hooks than during the previous render".
  const unratedQuery = useUnratedApplications();

  if (query.isLoading) {
    // Skeleton arrangement that mirrors the loaded layout silhouette —
    // identity header → job-context block → skills/note rows.
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingTop: spacing['3xl'],
            gap: spacing.lg,
          }}
        >
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </ScrollView>
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="✕"
            tone="warning"
            eyebrow={t('employer.applicant_detail.error_eyebrow')}
            title={t('employer.applicant_detail.error_title')}
            message={t('employer.applicant_detail.error_message')}
            cta={{
              label: t('employer.applicant_detail.close'),
              onPress: () => navigation.goBack(),
            }}
          />
        </View>
      </Screen>
    );
  }

  const applicant = query.data;

  // Pending rating — true when this applicant has been hired by us and we
  // haven't left a rating yet. Drives the inline "Rate this worker" banner.
  // The hook itself runs above, before the early returns; here we only
  // read its result.
  const unratedHere = (unratedQuery.data?.unrated ?? []).find(
    (u) => u.applicationId === applicant.id,
  );

  return (
    <Screen>
      {showHired && (
        <HireCelebration
          title={`You hired ${applicant.seeker?.name ?? 'this worker'}.`}
          subtitle="Doondo will carry the next-step momentum from here: trust, shift readiness, and the feeling that this was a real win."
          details={[
            applicant.job?.title ?? 'Role confirmed',
            applicant.job?.location?.area ?? applicant.job?.location?.city ?? 'Ready for the next step',
          ]}
          primaryLabel="Back to applicants"
          onPrimary={() => {
            setShowHired(false);
            navigation.goBack();
          }}
          onClose={() => {
            setShowHired(false);
            navigation.goBack();
          }}
        />
      )}
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['3xl'],
          paddingBottom: spacing['7xl'],
          gap: spacing['2xl'],
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            {`← ${t('employer.applicant_detail.back')}`}
          </Text>
        </Pressable>

        {/* Rate-this-worker banner — only when this applicant is hired
            and we haven't rated yet. Tap pushes the LeaveRating modal. */}
        {unratedHere && (
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('LeaveRating', {
                applicationId: unratedHere.applicationId,
                revieweeName: unratedHere.otherPartyName,
                jobTitle: unratedHere.jobTitle,
              });
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: 12,
              backgroundColor: theme.brand.heroSubtle,
              borderWidth: 0.5,
              borderColor: theme.brand.heroBorder,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 20 }}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">
                {t('employer.applicant_detail.rate_worker')}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {t('employer.applicant_detail.rate_worker_hint')}
              </Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.brand.hero }}>
              {`${t('employer.applicant_detail.rate_cta')} ›`}
            </Text>
          </Pressable>
        )}

        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Avatar
            name={applicant.seeker?.name ?? t('employer.applicant_detail.applicant_fallback')}
            photoUrl={applicant.seeker?.photoUrl}
            size={92}
            premium={applicant.seeker?.isVerified}
          />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              {statusEyebrow(applicant.status, t)}
            </Text>
            <Text variant="display" weight="medium" display>
              {applicant.seeker?.name ?? t('employer.applicant_detail.applicant_fallback')}
            </Text>
            {applicant.teamSizeSnapshot && applicant.teamSizeSnapshot >= 2 ? (
              <>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Pill
                    label={t('employer.applicant_detail.team_of', {
                      n: applicant.teamSizeSnapshot,
                    })}
                    tone="info"
                    leading="👥"
                  />
                </View>
                {applicant.teamMembers && applicant.teamMembers.length > 0 ? (
                  <View style={{ marginTop: spacing.xs, gap: 2 }}>
                    <Text variant="footnote" tone="tertiary" style={{ letterSpacing: 1.0 }}>
                      {t('employer.applicant_detail.teammates')}
                    </Text>
                    {applicant.teamMembers.map((m, i) => (
                      <Text key={`${m.phone}-${i}`} variant="footnote" tone="secondary">
                        {m.name} · {m.phone}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            {applicant.seeker?.location && (
              <Text variant="footnote" tone="secondary">
                {[applicant.seeker.location.area, applicant.seeker.location.city]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Text>
            )}
          </View>
        </View>

        {/* One-tap call — opens the dialer with the seeker's phone.
           Gated by the backend (must have an Application or active
           Availability beacon). Renders right under identity so the
           employer's primary CTA is reachable without scrolling. */}
        {applicant.seeker?.id ? (
          <CallSeekerButton seekerId={applicant.seeker.id} />
        ) : null}

        {/* Job context */}
        {applicant.job && (
          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                {t('employer.applicant_detail.applied_to')}
              </Text>
              <Text variant="bodyLarge" weight="medium">
                {applicant.job.title}
              </Text>
            </View>
          </Card>
        )}

        {/* Skills */}
        {(applicant.seeker?.skills.length ?? 0) > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.applicant_detail.skills')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {applicant.seeker!.skills.map((s) => (
                <Pill key={s} label={prettifySkill(s)} tone="neutral" />
              ))}
            </View>
          </View>
        )}

        {/* Cover note */}
        {applicant.coverNote && (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.applicant_detail.cover_note')}
            </Text>
            <Card>
              {/* Preserve line breaks the seeker wrote in their cover letter. */}
              <Text variant="body" style={{ lineHeight: 22 }}>
                {applicant.coverNote}
              </Text>
            </Card>
          </View>
        )}

        {/* Smart Resume — the worker's resume tailored to THIS job,
            snapshotted at apply time. Hidden when they didn't tailor. */}
        {applicant.tailoredResume ? (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.applicant_detail.tailored_resume')}
            </Text>
            <Card>
              <View style={{ gap: spacing.sm }}>
                <Text variant="body" style={{ lineHeight: 22 }}>
                  {applicant.tailoredResume.summary}
                </Text>
                {applicant.tailoredResume.pitch ? (
                  <Text variant="footnote" tone="secondary" style={{ lineHeight: 19 }}>
                    {applicant.tailoredResume.pitch}
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        ) : null}

        {/* Skills & proof — files the worker uploaded as evidence for
            their skills (certificates, licences, photos). Hidden when
            they've attached none. */}
        {applicant.seeker?.skillDocuments &&
        applicant.seeker.skillDocuments.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {t('employer.applicant_detail.skill_proof')}
            </Text>
            {groupSkillDocuments(applicant.seeker.skillDocuments).map((group) => (
              <Card key={group.skill}>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="footnote" weight="medium">
                    {group.skill.replace(/_/g, ' ')}
                  </Text>
                  {group.docs.map((d) => (
                    <Pressable
                      key={d.id}
                      onPress={() => {
                        void Linking.openURL(d.url).catch(() => undefined);
                      }}
                      accessibilityRole="button"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.xs,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontSize: 15 }}>
                        {d.kind === 'photo' ? '🖼️' : '📄'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="footnote" weight="medium" numberOfLines={1}>
                          {d.extracted?.title || d.fileName}
                        </Text>
                        {d.extracted && (d.extracted.issuer || d.extracted.issuedOn) ? (
                          <Text variant="caption" tone="tertiary" numberOfLines={1}>
                            {[d.extracted.issuer, d.extracted.issuedOn]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="footnote" tone="hero">
                        ›
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Doondo Constitution — the worker's stated work rules. Hidden
            when they've set none. */}
        {applicant.seeker?.constitution ? (
          <ConstitutionPanel constitution={applicant.seeker.constitution} t={t} />
        ) : null}

        {/* Earned course badges — hidden when none. */}
        {applicant.seeker?.id ? (
          <ApplicantBadgesSection seekerId={applicant.seeker.id} />
        ) : null}

        {/* Trade endorsements — verified pills + endorse buttons. Only
           rendered after hire, since that's when the employer can vouch. */}
        {applicant.seeker?.id && applicant.status === 'hired' ? (
          <EndorsementsSection
            seekerId={applicant.seeker.id}
            seekerSkills={applicant.seeker.skills ?? []}
            applicationId={applicant.id}
          />
        ) : null}

        {/* Built work history (from Resume Builder) */}
        <WorkHistorySection
          history={applicant.seeker?.workHistory ?? []}
        />

        {/* Photos of the seeker's work — horizontal carousel. Hidden
           when empty, so it never wastes space on a candidate who
           didn't upload any. Employers who've hired this worker can
           verify each photo individually. */}
        <WorkPhotosCarousel
          photos={applicant.seeker?.workPhotos ?? []}
          seekerId={applicant.seeker?.id ?? null}
          applicationId={applicant.id}
          skills={applicant.seeker?.skills ?? []}
          canVerify={applicant.status === 'hired'}
        />

        {/* Resume */}
        <ResumeRow seeker={applicant.seeker ?? null} />

        {/* Interview scheduling */}
        <InterviewPanel applicationId={applicant.id} interview={applicant.interview ?? null} />

        {/* Payment confirmation — only renders when status === 'hired'. */}
        <PaymentConfirmationPanel
          application={applicant}
          role="employer"
          invalidateQueryKeys={[
            ['applicants', 'detail', applicant.id],
            ['applicants', 'employer'],
          ]}
        />

        {/* UPI pay — gated by hired state too. Distinct from the cash
            confirmation panel above: this one actually initiates a UPI
            deep-link and credits the worker's wallet on confirmation. */}
        {applicant.status === 'hired' && applicant.seeker?.id && (
          <UpiPaymentPanel
            seekerId={applicant.seeker.id}
            seekerName={
              applicant.seeker.name ?? t('employer.applicant_detail.applicant_fallback')
            }
            applicationId={applicant.id}
          />
        )}

        {/* Actions */}
        <ActionPanel applicant={applicant} onAction={(t) => transition.mutate(t)} pending={transition.isPending} />
      </ScrollView>
    </Screen>
  );
}

// ─── One-tap call ───────────────────────────────────────────────────────────

/**
 * Reveal the seeker's phone number and open the device dialer. Backed
 * by GET /seekers/:id/contact which checks for an Application from the
 * seeker to one of this employer's jobs, OR an active Availability
 * beacon — either way the seeker has signalled they're reachable.
 */
function CallSeekerButton({ seekerId }: { seekerId: string }) {
  const t = useTranslate();
  const mutation = useMutation({
    mutationFn: () => contactApi.revealSeeker(seekerId),
    onSuccess: (data) => {
      const phone = data.contact.phone;
      if (!phone) {
        haptic('error');
        Alert.alert(
          t('employer.applicant_detail.call_fail_title'),
          t('employer.applicant_detail.call_fail_no_phone'),
        );
        return;
      }
      haptic('selection');
      const clean = phone.replace(/[^\d+]/g, '');
      Linking.openURL(`tel:${clean}`).catch(() => {
        Alert.alert(
          t('employer.applicant_detail.call_dialer_fail_title'),
          t('employer.applicant_detail.call_dialer_fail_msg', { phone }),
        );
      });
    },
    onError: (err) => {
      haptic('error');
      const msg =
        err instanceof ApiError
          ? err.message
          : t('employer.applicant_detail.call_reveal_fail');
      Alert.alert(t('employer.applicant_detail.call_not_available'), msg);
    },
  });
  return (
    <Pressable
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      accessibilityRole="button"
      accessibilityLabel={t('employer.applicant_detail.call_worker_a11y')}
      style={({ pressed }) => ({
        paddingVertical: 14,
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
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>
        {mutation.isPending
          ? t('employer.applicant_detail.call_opening')
          : t('employer.applicant_detail.call_worker')}
      </Text>
    </Pressable>
  );
}

// ─── Trade endorsements ────────────────────────────────────────────────────

/**
 * Per-trade endorsement controls. Renders existing verified pills
 * (count >= threshold) plus a list of the seeker's declared trades the
 * employer can endorse them on. Tap → endorses; the row dims and shows
 * "Endorsed ✓" until the next refresh.
 */
function EndorsementsSection({
  seekerId,
  seekerSkills,
  applicationId,
}: {
  seekerId: string;
  seekerSkills: string[];
  applicationId: string;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['endorsements', seekerId],
    queryFn: () => endorsementsApi.listForSeeker(seekerId),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (trade: string) =>
      endorsementsApi.endorse(seekerId, { trade, applicationId }),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['endorsements', seekerId] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('employer.applicant_detail.endorse_fail_title'),
        err instanceof ApiError
          ? err.message
          : t('employer.applicant_detail.try_again'),
      );
    },
  });

  const summary = query.data?.endorsements ?? [];
  const tradesWithExisting = new Set(summary.map((s) => s.trade));
  // Catalog of trades to offer: the seeker's declared skills plus any
  // already-endorsed trade (so the employer sees the full picture).
  const candidateTrades = [
    ...new Set([
      ...seekerSkills.map((s) => s.toLowerCase()),
      ...summary.map((s) => s.trade),
    ]),
  ].filter(Boolean);

  if (candidateTrades.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('employer.applicant_detail.endorsements')}
      </Text>
      <Text variant="footnote" tone="secondary">
        {t('employer.applicant_detail.endorsements_intro')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {candidateTrades.map((trade) => {
          const row = summary.find((s) => s.trade === trade);
          const verified = row?.verified ?? false;
          const count = row?.count ?? 0;
          return (
            <Pressable
              key={trade}
              onPress={() => mutation.mutate(trade)}
              disabled={mutation.isPending}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: verified ? '#D1FAE5' : theme.bg.surface,
                borderWidth: 0.5,
                borderColor: verified ? '#86EFAC' : theme.border.default,
                opacity: pressed ? 0.7 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              })}
            >
              {verified ? <Text style={{ fontSize: 12 }}>✓</Text> : null}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: verified ? '#065F46' : theme.text.primary,
                }}
              >
                {prettifySkill(trade)}
                {count > 0 ? ` · ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
        {t('employer.applicant_detail.endorsements_hint')}
      </Text>
    </View>
  );
}

// ─── Doondo Constitution ────────────────────────────────────────────────────

/**
 * Read-only panel of the applicant's work rules — how far they'll
 * travel and their hard boundaries. Lists only the rules the worker
 * actually set; renders nothing when they set none, so it never wastes
 * space on a worker with no stated boundaries.
 */
function ConstitutionPanel({
  constitution,
  t,
}: {
  constitution: SeekerConstitution;
  t: TFn;
}) {
  const { theme } = useTheme();

  const items: string[] = [];
  if (constitution.maxDistanceKm != null) {
    items.push(
      t('constitution.detail_max_distance', { km: constitution.maxDistanceKm }),
    );
  }
  if (constitution.noNightShifts) items.push(t('constitution.detail_no_nights'));
  if (constitution.noSundays) items.push(t('constitution.detail_no_sundays'));
  if (constitution.requiresPpe) items.push(t('constitution.detail_requires_ppe'));
  if (constitution.requiresContract) {
    items.push(t('constitution.detail_requires_contract'));
  }
  if (items.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('constitution.detail_section')}
      </Text>
      <Card>
        <View style={{ gap: spacing.sm }}>
          {items.map((item, i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
            >
              <Text style={{ color: theme.brand.hero, lineHeight: 20 }}>•</Text>
              <Text variant="footnote" style={{ flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

// ─── Earned badges ──────────────────────────────────────────────────────────

/**
 * Loads + renders a strip of completed-course badges for the seeker.
 * Hidden entirely when they haven't finished any course.
 */
function ApplicantBadgesSection({ seekerId }: { seekerId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['seekerBadges', seekerId],
    queryFn: () => coursesApi.seekerBadges(seekerId),
    staleTime: 60_000,
  });
  const badges = query.data?.badges ?? [];
  if (badges.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {`${t('employer.applicant_detail.course_badges')} · ${badges.length}`}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {badges.map((b) => (
          <View
            key={b.id}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
              backgroundColor: '#FEF3C7',
              borderWidth: 0.5,
              borderColor: '#FDE68A',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 14 }}>🏅</Text>
            <Text style={{ fontSize: 12 }}>{b.emoji}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350F' }}>
              {b.title}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Work photos ────────────────────────────────────────────────────────────

/**
 * Horizontal carousel of work-sample photos uploaded by the seeker.
 * Hidden entirely when the candidate hasn't uploaded any so the screen
 * doesn't waste space.
 */
function WorkPhotosCarousel({
  photos,
  seekerId,
  applicationId,
  skills,
  canVerify,
}: {
  photos: CraftPhoto[];
  seekerId: string | null;
  applicationId: string;
  skills: string[];
  canVerify: boolean;
}) {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const verifyQuery = useQuery({
    queryKey: ['photoVerifications', seekerId],
    queryFn: () =>
      seekerId
        ? endorsementsApi.listPhotoVerifications(seekerId)
        : Promise.resolve({ verifications: [] }),
    enabled: !!seekerId,
    staleTime: 60_000,
  });
  const verifyMutation = useMutation({
    mutationFn: (photoIndex: number) => {
      if (!seekerId) throw new Error('Missing seeker id');
      return endorsementsApi.verifyPhoto(seekerId, {
        photoIndex,
        applicationId,
      });
    },
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['photoVerifications', seekerId] });
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('employer.applicant_detail.verify_fail_title'),
        err instanceof ApiError
          ? err.message
          : t('employer.applicant_detail.try_again'),
      );
    },
  });
  if (photos.length === 0) return null;
  const verifyCountByIndex = new Map(
    (verifyQuery.data?.verifications ?? []).map((v) => [v.photoIndex, v.count]),
  );
  return (
    <CraftShowcase
      title={`${t('employer.applicant_detail.work_photos')} · ${photos.length}`}
      subtitle="A premium read of the candidate's real work, so you can judge quality before you judge polish."
      photos={photos}
      skills={skills}
      verificationCounts={verifyCountByIndex}
      onVerifyPhoto={canVerify ? (index) => verifyMutation.mutate(index) : undefined}
      verifyPending={verifyMutation.isPending}
      verifyLabel={t('employer.applicant_detail.verify_photo')}
    />
  );
}

// ─── Work history (Resume Builder) ──────────────────────────────────────────

/**
 * Renders the candidate's built-resume entries. Distinct from the
 * uploaded-PDF Resume card below — a seeker can have both, neither, or
 * only one. We sort newest-first; current jobs always lead.
 */
function WorkHistorySection({ history }: { history: WorkExperience[] }) {
  const { theme } = useTheme();
  const t = useTranslate();
  if (history.length === 0) return null;
  const sorted = sortWorkHistory(history);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {`${t('employer.applicant_detail.work_history')} · ${sorted.length}`}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {sorted.map((e, i) => {
          const months = tenureMonths(e);
          return (
            <Card key={`${e.company}-${e.startDate}-${i}`}>
              <View style={{ gap: spacing.xs }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
                      {e.role}
                    </Text>
                    <Text variant="body" tone="secondary" numberOfLines={1}>
                      {e.company}
                    </Text>
                  </View>
                  {e.current ? (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: radii.pill,
                        backgroundColor: theme.status.successSubtle,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '700',
                          color: theme.status.success,
                        }}
                      >
                        {t('employer.applicant_detail.current')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="footnote" tone="tertiary">
                  {formatRange(e)}
                  {months > 0 ? ` · ${formatTenure(months)}` : ''}
                </Text>
                {e.description ? (
                  <Text variant="body" tone="secondary">
                    {e.description}
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

// ─── Resume row ─────────────────────────────────────────────────────────────

/**
 * Inline resume card. Hidden when the seeker hasn't uploaded one.
 * Tap → write the base64 payload to the OS share sheet so the employer can
 * open it in Files / Drive / Mail / Preview. We can't use Linking.openURL
 * for `data:` URIs — iOS / Android both reject them.
 */
function ResumeRow({
  seeker,
}: {
  seeker: NonNullable<ApplicantEntry['seeker']> | null;
}) {
  const t = useTranslate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!seeker?.resumeUrl) return null;

  const sizeStr = formatResumeSize(seeker.resumeSizeBytes);
  const subtitleParts = [
    seeker.resumeMimeType?.includes('pdf') ? 'PDF' : 'DOC',
    sizeStr,
  ].filter(Boolean);

  async function handleOpen() {
    setError(null);
    setBusy(true);
    try {
      await openResume({
        dataUrl: seeker!.resumeUrl!,
        filename: seeker!.resumeFilename,
        mimeType: seeker!.resumeMimeType,
      });
    } catch (err) {
      haptic('error');
      setError(
        err instanceof Error
          ? err.message
          : t('employer.applicant_detail.resume_open_fail'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('employer.applicant_detail.resume')}
      </Text>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyLarge" weight="medium" numberOfLines={1}>
              {seeker.resumeFilename ?? t('employer.applicant_detail.resume_fallback')}
            </Text>
            {subtitleParts.length > 0 && (
              <Text variant="footnote" tone="secondary">
                {subtitleParts.join(' · ')}
              </Text>
            )}
          </View>
          <Button
            label={
              busy
                ? t('employer.applicant_detail.resume_opening')
                : t('employer.applicant_detail.resume_open')
            }
            variant="secondary"
            onPress={handleOpen}
            disabled={busy}
          />
          <FormError message={error} />
        </View>
      </Card>
    </View>
  );
}

// ─── Interview scheduling panel ─────────────────────────────────────────────

interface InterviewPanelProps {
  applicationId: string;
  interview: PublicInterview | null;
}

const MODE_OPTIONS: Array<{ key: InterviewMode; labelKey: string }> = [
  { key: 'in_person', labelKey: 'employer.applicant_detail.interview_mode_in_person' },
  { key: 'video', labelKey: 'employer.applicant_detail.interview_mode_video' },
  { key: 'phone', labelKey: 'employer.applicant_detail.interview_mode_phone' },
];

/**
 * Inline scheduling card on the applicant detail. Shows the current
 * interview when one exists, or the schedule form when not.
 *
 * Date entry uses a plain TextField that accepts a permissive format
 * (YYYY-MM-DD HH:mm). When time-pickers ship for the seeker screen we
 * swap this out — keeping the API surface flat means the swap is local.
 */
function InterviewPanel({ applicationId, interview }: InterviewPanelProps) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const active = interview && interview.status === 'scheduled' ? interview : null;
  const [editing, setEditing] = useState(false);

  const scheduleMutation = useMutation({
    mutationFn: (body: SchedulePayload) =>
      applicationsApi.scheduleInterview(applicationId, body),
    onSuccess: () => {
      haptic('success');
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
    onError: () => haptic('error'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => applicationsApi.cancelInterview(applicationId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
    onError: () => haptic('error'),
  });

  if (active && !editing) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('employer.applicant_detail.interview')}
        </Text>
        <Card premium>
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyLarge" weight="medium">
              {formatWhen(active.scheduledFor)}
            </Text>
            <Text variant="footnote" tone="secondary">
              {modeLabel(active.mode, t)}
              {active.mode === 'in_person' && active.location ? ` · ${active.location}` : ''}
              {active.mode === 'video' && active.meetingLink ? ` · ${active.meetingLink}` : ''}
            </Text>
            {active.notes ? (
              <Text variant="footnote" tone="tertiary" style={{ marginTop: spacing.xs }}>
                {active.notes}
              </Text>
            ) : null}
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('employer.applicant_detail.interview_reschedule')}
              variant="secondary"
              onPress={() => setEditing(true)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={
                cancelMutation.isPending
                  ? t('employer.applicant_detail.interview_cancelling')
                  : t('employer.applicant_detail.interview_cancel')
              }
              variant="danger"
              onPress={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        variant="footnote"
        weight="medium"
        tone="secondary"
        style={{ letterSpacing: 1.0 }}
      >
        {t('employer.applicant_detail.interview')}
      </Text>
      {!editing ? (
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text variant="body" tone="secondary">
              {t('employer.applicant_detail.interview_intro')}
            </Text>
            <Button
              label={t('employer.applicant_detail.interview_schedule')}
              variant="primary"
              onPress={() => setEditing(true)}
            />
          </View>
        </Card>
      ) : (
        <ScheduleForm
          initial={active}
          submitting={scheduleMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => scheduleMutation.mutate(body)}
        />
      )}
    </View>
  );
}

interface ScheduleFormProps {
  initial: PublicInterview | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: SchedulePayload) => void;
}

function ScheduleForm({ initial, submitting, onCancel, onSubmit }: ScheduleFormProps) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [mode, setMode] = useState<InterviewMode>(initial?.mode ?? 'in_person');
  // ISO entry — permissive: accept "YYYY-MM-DD HH:mm" or full ISO and we'll
  // normalise. Date pickers come later; this keeps the form one screen tall.
  const [whenText, setWhenText] = useState(
    initial ? toLocalEntry(initial.scheduledFor) : '',
  );
  const [location, setLocation] = useState(initial?.location ?? '');
  const [meetingLink, setMeetingLink] = useState(initial?.meetingLink ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const iso = parseLocalEntry(whenText);
    if (!iso) {
      setError(t('employer.applicant_detail.interview_err_format'));
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      setError(t('employer.applicant_detail.interview_err_future'));
      return;
    }
    if (mode === 'in_person' && !location.trim()) {
      setError(t('employer.applicant_detail.interview_err_location'));
      return;
    }
    if (mode === 'video' && !meetingLink.trim()) {
      setError(t('employer.applicant_detail.interview_err_link'));
      return;
    }
    setError(null);
    const body: SchedulePayload = { scheduledFor: iso, mode };
    if (mode === 'in_person' && location.trim()) body.location = location.trim();
    if (mode === 'video' && meetingLink.trim()) body.meetingLink = meetingLink.trim();
    if (notes.trim()) body.notes = notes.trim();
    onSubmit(body);
  }

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <FormError message={error} />

        {/* Mode selector */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary">
            {t('employer.applicant_detail.interview_how')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {MODE_OPTIONS.map((o) => {
              const active = mode === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    haptic('selection');
                    setMode(o.key);
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                    borderRadius: radii.pill,
                    borderWidth: 0.5,
                    borderColor: active ? theme.brand.hero : theme.border.default,
                    backgroundColor: active ? theme.brand.heroSubtle : 'transparent',
                  }}
                >
                  <Text
                    variant="footnote"
                    weight={active ? 'medium' : 'regular'}
                    style={{ color: active ? theme.brand.hero : theme.text.secondary }}
                  >
                    {t(o.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextField
          label={t('employer.applicant_detail.interview_when')}
          value={whenText}
          onChangeText={setWhenText}
          placeholder={t('employer.applicant_detail.interview_when_placeholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {mode === 'in_person' && (
          <TextField
            label={t('employer.applicant_detail.interview_location')}
            value={location}
            onChangeText={setLocation}
            placeholder={t('employer.applicant_detail.interview_location_placeholder')}
          />
        )}
        {mode === 'video' && (
          <TextField
            label={t('employer.applicant_detail.interview_link')}
            value={meetingLink}
            onChangeText={setMeetingLink}
            placeholder={t('employer.applicant_detail.interview_link_placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        )}

        <TextField
          label={t('employer.applicant_detail.interview_note')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('employer.applicant_detail.interview_note_placeholder')}
          multiline
          numberOfLines={3}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('employer.applicant_detail.cancel')}
              variant="ghost"
              onPress={onCancel}
              disabled={submitting}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={
                submitting
                  ? t('employer.applicant_detail.interview_scheduling')
                  : initial
                    ? t('employer.applicant_detail.interview_reschedule')
                    : t('employer.applicant_detail.interview_schedule_short')
              }
              onPress={submit}
              disabled={submitting}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function modeLabel(m: InterviewMode, t: TFn): string {
  if (m === 'in_person') return t('employer.applicant_detail.interview_mode_in_person');
  if (m === 'video') return t('employer.applicant_detail.interview_mode_video_call');
  return t('employer.applicant_detail.interview_mode_phone_call');
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Pretty-print an ISO datetime in local form for the text input. */
function toLocalEntry(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * Parse a permissive local datetime entry into ISO. Accepts:
 *   2026-05-12 15:00
 *   2026-05-12T15:00
 *   2026-05-12 3:00 pm (case-insensitive)
 * Returns null if it can't be parsed.
 */
function parseLocalEntry(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;
  // Normalise: replace 'T' with space, lowercase am/pm.
  let s = cleaned.replace('T', ' ').toLowerCase();
  // Convert "h:mm am/pm" to 24h.
  s = s.replace(
    /(\d{1,2}):(\d{2})\s*(am|pm)/,
    (_m, h: string, mi: string, ampm: string) => {
      const hh = Number(h) % 12 + (ampm === 'pm' ? 12 : 0);
      return `${String(hh).padStart(2, '0')}:${mi}`;
    },
  );
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, da, hh, mi] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(hh), Number(mi), 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function ActionPanel({
  applicant,
  onAction,
  pending,
}: {
  applicant: ApplicantEntry;
  onAction: (t: 'shortlisted' | 'rejected' | 'hired') => void;
  pending: boolean;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const status = applicant.status;
  const terminal = status === 'rejected' || status === 'hired' || status === 'withdrawn';

  if (terminal) {
    return (
      <Card>
        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Text variant="bodyLarge" weight="medium">
            {status === 'hired'
              ? t('employer.applicant_detail.outcome_hired')
              : status === 'rejected'
                ? t('employer.applicant_detail.outcome_rejected')
                : t('employer.applicant_detail.outcome_withdrawn')}
          </Text>
        </View>
      </Card>
    );
  }

  const canShortlist = status === 'pending' || status === 'viewed';
  const canHire = status === 'shortlisted';

  return (
    <View style={{ gap: spacing.sm }}>
      {canHire ? (
        <Button
          label={
            pending
              ? t('employer.applicant_detail.hiring')
              : t('employer.applicant_detail.hire')
          }
          onPress={() => onAction('hired')}
          disabled={pending}
        />
      ) : canShortlist ? (
        <Button
          label={
            pending
              ? t('employer.applicant_detail.saving')
              : t('employer.applicant_detail.shortlist')
          }
          onPress={() => onAction('shortlisted')}
          disabled={pending}
        />
      ) : null}
      <Button
        label={
          pending
            ? t('employer.applicant_detail.saving')
            : t('employer.applicant_detail.decline')
        }
        variant="secondary"
        onPress={() => onAction('rejected')}
        disabled={pending}
      />
    </View>
  );
}
