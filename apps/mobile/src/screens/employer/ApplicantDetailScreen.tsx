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
import { Alert, Image, Linking, Pressable, ScrollView, View, Dimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Pill, Card, Button, Avatar, SkeletonCard, EmptyState, TextField, FormError, PaymentConfirmationPanel, CraftShowcase, HireCelebration, DisputeSection } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { applicationsApi, type ApplicantEntry, type SchedulePayload } from '@/api/applications.api';
import type { SkillDocument } from '@/api/types';
import { contactApi } from '@/api/contact.api';
import { coursesApi } from '@/api/courses.api';
import { endorsementsApi } from '@/api/endorsements.api';
import { profileViewsApi } from '@/api/profileViews.api';
import { workerNotesApi } from '@/api/workerNotes.api';
import { skillTestsApi } from '@/api/skillTests.api';
import { arrivalLikelihoodApi, type ArrivalBand } from '@/api/arrivalLikelihood.api';
import { workProofApi } from '@/api/workProof.api';
import { moderationApi, type ReportReason } from '@/api/moderation.api';
import { incidentsApi } from '@/api/incidents.api';
import { crewDocumentsApi } from '@/api/crewDocuments.api';
import { maskedCallApi } from '@/api/maskedCall.api';
import { pickChatImage } from '@/lib/chatImage';
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

  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get('window');
  const HERO_HEIGHT = 320;
  const BLUE = '#2563EB';
  const GREEN = '#22C55E';
  const [activeTab, setActiveTab] = useState<'profile' | 'reviews' | 'photos' | 'jobs'>('profile');

  const seeker = applicant.seeker;
  const name = seeker?.name ?? 'Worker';
  const photoUrl = seeker?.photoUrl ?? null;
  const location = [seeker?.location?.area, seeker?.location?.city].filter(Boolean).join(', ') || 'Bengaluru, Karnataka';
  const experience = (seeker as any)?.yearsOfExperience ?? null;
  const rating = (seeker as any)?.rating ?? null;
  const reviewCount = (seeker as any)?.reviewCount ?? 0;
  const jobsDone = (seeker as any)?.jobsCompleted ?? 0;
  const trustScore = (seeker as any)?.trustScore ?? 96;
  const payAmount = applicant.job?.pay?.amount ? Math.round(applicant.job.pay.amount / 100) : 900;
  const payPeriod = applicant.job?.pay?.period ?? 'day';

  return (
    <Screen edges={[]}>
      {showHired && (
        <HireCelebration
          title={`You hired ${name}.`}
          subtitle="Doondo will carry the next-step momentum from here."
          details={[
            applicant.job?.title ?? 'Role confirmed',
            applicant.job?.location?.area ?? applicant.job?.location?.city ?? 'Ready for the next step',
          ]}
          primaryLabel="Back to applicants"
          onPrimary={() => { setShowHired(false); navigation.goBack(); }}
          onClose={() => { setShowHired(false); navigation.goBack(); }}
        />
      )}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Hero photo */}
        <View style={{ height: HERO_HEIGHT }}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ width: screenWidth, height: HERO_HEIGHT }} resizeMode="cover" />
          ) : (
            <View style={{ width: screenWidth, height: HERO_HEIGHT, backgroundColor: '#1F2937' }} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200 }}
          />
          {/* Top bar */}
          <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: 0, right: 0,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="arrow-left" size={20} color="#FFFFFF" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="heart" size={18} color="#FFFFFF" />
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="share-2" size={18} color="#FFFFFF" />
              </View>
            </View>
          </View>
          {/* Available badge */}
          <View style={{ position: 'absolute', top: insets.top + spacing.sm + 46, right: spacing.xl,
            backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Available Today</Text>
          </View>
          {/* Name overlay */}
          <View style={{ position: 'absolute', bottom: spacing.lg, left: spacing.xl, right: spacing.xl, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFFFFF' }}>{name}</Text>
              {seeker?.isVerified && (
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={13} color="#FFFFFF" />
                </View>
              )}
            </View>
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)' }}>
              {seeker?.skills?.[0] ?? applicant.job?.title ?? 'Worker'}
            </Text>
            {rating && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: '#FCD34D', fontSize: 14 }}>{'\u2605'}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>{rating} ({reviewCount} reviews)</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 }}>
              {experience ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{experience}+ Years Experience</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Feather name="map-pin" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{location}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Trust Score */}
        <View style={{ backgroundColor: '#111827', marginHorizontal: spacing.xl, marginTop: -spacing.md,
          borderRadius: 16, padding: spacing.md, flexDirection: 'row', alignItems: 'center' }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' }}>Trust Score</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 2 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '800' }}>{trustScore}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginBottom: 4 }}>/100</Text>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN,
                alignItems: 'center', justifyContent: 'center', marginBottom: 2, marginLeft: 2 }}>
                <Feather name="check" size={14} color="#FFFFFF" />
              </View>
            </View>
            <Text style={{ color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 2 }}>Highly Reliable</Text>
          </View>
        </View>

        {/* Verification badges */}
        <View style={{ flexDirection: 'row', marginHorizontal: spacing.xl, marginTop: spacing.md, gap: spacing.sm }}>
          {(['Aadhaar', 'Police', 'Address', 'Experience'] as const).map((label) => (
            <View key={label} style={{ flex: 1, alignItems: 'center', gap: 4, padding: spacing.sm,
              borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="shield" size={16} color="#16A34A" />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#1F2937', textAlign: 'center' }}>{label}</Text>
              <Text style={{ fontSize: 10, color: '#16A34A', fontWeight: '600' }}>Verified</Text>
            </View>
          ))}
        </View>

        {/* Salary */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginHorizontal: spacing.xl, marginTop: spacing.md, padding: spacing.md,
          borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>
              {'₹'}{payAmount.toLocaleString('en-IN')} / {payPeriod}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Expected Salary</Text>
          </View>
          <Pressable style={{ paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: BLUE }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BLUE }}>Negotiate</Text>
          </Pressable>
        </View>

        {/* Hire Now + Chat */}
        <View style={{ flexDirection: 'row', marginHorizontal: spacing.xl, marginTop: spacing.sm, gap: spacing.sm }}>
          <Pressable
            onPress={() => { haptic('success'); transition.mutate('hired'); }}
            disabled={transition.isPending || applicant.status === 'hired'}
            style={({ pressed }) => ({
              flex: 2, backgroundColor: applicant.status === 'hired' ? '#86EFAC' : BLUE,
              borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
              {applicant.status === 'hired' ? '\u2713 Hired' : transition.isPending ? 'Hiring\u2026' : 'Hire Now'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => ({
              flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
              borderWidth: 1.5, borderColor: BLUE, opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: BLUE, fontSize: 16, fontWeight: '700' }}>Chat</Text>
          </Pressable>
        </View>

        {/* Rate banner */}
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
              flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              marginHorizontal: spacing.xl, marginTop: spacing.md,
              padding: spacing.md, borderRadius: 12,
              backgroundColor: theme.brand.heroSubtle, borderWidth: 0.5, borderColor: theme.brand.heroBorder,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 20 }}>{'\u2B50'}</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyLarge" weight="medium" tone="hero">{t('employer.applicant_detail.rate_worker')}</Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>{t('employer.applicant_detail.rate_worker_hint')}</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.brand.hero }}>{t('employer.applicant_detail.rate_cta') + ' \u203A'}</Text>
          </Pressable>
        )}

        {/* Tabs */}
        <View style={{ flexDirection: 'row', marginTop: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
          {(['profile', 'reviews', 'photos', 'jobs'] as const).map((tab) => (
            <Pressable key={tab} onPress={() => { haptic('selection'); setActiveTab(tab); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
                borderBottomWidth: 2, borderBottomColor: activeTab === tab ? BLUE : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: activeTab === tab ? '700' : '500',
                color: activeTab === tab ? BLUE : '#6B7280', textTransform: 'capitalize' }}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing['2xl'] }}>
            <View style={{ gap: spacing.md }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>
                About {name.split(' ')[0]}
              </Text>
              {applicant.coverNote ? (
                <Text style={{ fontSize: 14, color: '#4B5563', lineHeight: 22 }}>{applicant.coverNote}</Text>
              ) : null}
              <View style={{ gap: spacing.sm }}>
                {experience ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Feather name="briefcase" size={16} color="#6B7280" />
                    <Text style={{ fontSize: 14, color: '#374151' }}>{experience}+ Years Experience</Text>
                  </View>
                ) : null}
                {jobsDone > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Feather name="check-circle" size={16} color="#6B7280" />
                    <Text style={{ fontSize: 14, color: '#374151' }}>{jobsDone}+ Jobs Completed</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Feather name="map-pin" size={16} color="#6B7280" />
                  <Text style={{ fontSize: 14, color: '#374151' }}>{location}</Text>
                </View>
              </View>
            </View>

            {(seeker?.skills.length ?? 0) > 0 && (
              <View style={{ gap: spacing.md }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Skills</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {seeker!.skills.map((s) => (
                    <View key={s} style={{ paddingHorizontal: spacing.md, paddingVertical: 6,
                      borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }}>
                      <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>{prettifySkill(s)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <WorkHistorySection history={seeker?.workHistory ?? []} />

            {(seeker?.skillDocuments?.length ?? 0) > 0 && (
              <View style={{ gap: spacing.md }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Documents</Text>
                {groupSkillDocuments(seeker!.skillDocuments!).map((group) =>
                  group.docs.map((d) => (
                    <Pressable key={d.id}
                      onPress={() => void Linking.openURL(d.url).catch(() => undefined)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                        paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                      <Feather name="file-text" size={18} color="#6B7280" />
                      <Text style={{ flex: 1, fontSize: 14, color: '#1F2937' }}>{d.extracted?.title || d.fileName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '600' }}>Verified</Text>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#16A34A',
                          alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="check" size={11} color="#FFFFFF" />
                        </View>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            )}

            <WorkPhotosCarousel photos={seeker?.workPhotos ?? []} seekerId={seeker?.id ?? null}
              applicationId={applicant.id} skills={seeker?.skills ?? []} canVerify={applicant.status === 'hired'} />
            {seeker?.constitution ? <ConstitutionPanel constitution={seeker.constitution} t={t} /> : null}
            {seeker?.id ? <ApplicantBadgesSection seekerId={seeker.id} /> : null}
            {seeker?.id && applicant.status === 'hired' ? (
              <EndorsementsSection seekerId={seeker.id} seekerSkills={seeker.skills ?? []} applicationId={applicant.id} />
            ) : null}
            <ResumeRow seeker={seeker ?? null} />
            {applicant.tailoredResume ? (
              <Card>
                <View style={{ gap: spacing.sm }}>
                  <Text variant="body" style={{ lineHeight: 22 }}>{applicant.tailoredResume.summary}</Text>
                  {applicant.tailoredResume.pitch ? (
                    <Text variant="footnote" tone="secondary" style={{ lineHeight: 19 }}>{applicant.tailoredResume.pitch}</Text>
                  ) : null}
                </View>
              </Card>
            ) : null}
          </View>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <View style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.lg }}>
            {rating ? (
              <>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#1F2937' }}>{rating}</Text>
                <Text style={{ color: '#FCD34D', fontSize: 28 }}>
                  {'\u2605'.repeat(Math.min(5, Math.round(Number(rating))))}
                </Text>
                <Text style={{ fontSize: 13, color: '#6B7280' }}>({reviewCount} reviews)</Text>
              </>
            ) : (
              <Text style={{ fontSize: 14, color: '#6B7280' }}>No reviews yet</Text>
            )}
          </View>
        )}

        {/* Photos tab */}
        {activeTab === 'photos' && (
          <View style={{ padding: spacing.xl }}>
            <WorkPhotosCarousel photos={seeker?.workPhotos ?? []} seekerId={seeker?.id ?? null}
              applicationId={applicant.id} skills={seeker?.skills ?? []} canVerify={applicant.status === 'hired'} />
            {(seeker?.workPhotos?.length ?? 0) === 0 && (
              <Text style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14, marginTop: spacing.xl }}>
                No photos uploaded
              </Text>
            )}
          </View>
        )}

        {/* Jobs tab */}
        {activeTab === 'jobs' && applicant.job && (
          <View style={{ padding: spacing.xl }}>
            <Card>
              <View style={{ gap: spacing.xs }}>
                <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
                  {t('employer.applicant_detail.applied_to')}
                </Text>
                <Text variant="bodyLarge" weight="medium">{applicant.job.title}</Text>
              </View>
            </Card>
          </View>
        )}

        {/* Business logic sections */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing['2xl'] }}>
          {applicant.status !== 'rejected' && applicant.status !== 'withdrawn' ? (
            <ArrivalLikelihoodCard applicationId={applicant.id} />
          ) : null}
          {applicant.status !== 'rejected' && applicant.status !== 'withdrawn' ? (
            <OfferCard applicant={applicant} />
          ) : null}
          <InterviewPanel applicationId={applicant.id} interview={applicant.interview ?? null} />
          {applicant.status === 'hired' ? <EmployerShiftCard applicant={applicant} /> : null}
          {applicant.status === 'hired' ? <WorkProofReviewCard applicationId={applicant.id} /> : null}
          {applicant.status === 'hired' ? <CallViaDoondoButton applicationId={applicant.id} /> : null}
          {applicant.status === 'hired' ? <DisputeSection applicationId={applicant.id} /> : null}
          <PaymentConfirmationPanel application={applicant} role="employer"
            invalidateQueryKeys={[['applicants', 'detail', applicant.id], ['applicants', 'employer']]} />
          {applicant.status === 'hired' && seeker?.id && (
            <UpiPaymentPanel seekerId={seeker.id}
              seekerName={seeker.name ?? t('employer.applicant_detail.applicant_fallback')}
              applicationId={applicant.id} />
          )}
          {seeker?.id ? <WorkerNoteCard workerId={seeker.id} /> : null}
          {seeker?.id ? <IncidentLogCard workerId={seeker.id} applicationId={applicant.id} /> : null}
          {seeker?.id ? <CrewDocumentsCard workerId={seeker.id} /> : null}
          <ActionPanel applicant={applicant} onAction={(next) => transition.mutate(next)} pending={transition.isPending} />
          {seeker?.id ? <ModerationActions workerId={seeker.id} workerName={seeker.name ?? ''} /> : null}
        </View>
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

// ─── Private worker note ───────────────────────────────────────────────────

/**
 * A private, employer-only note about this worker — "great with
 * customers, bring back for weekends" / "late twice." Never shown to the
 * worker, never affects their score. Loads the saved note, lets the
 * employer edit + save, and shows when it was last updated. Self-managed
 * (own query + mutation) so the host screen only has to drop it in.
 */
function WorkerNoteCard({ workerId }: { workerId: string }) {
  const t = useTranslate();
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['worker-note', workerId],
    queryFn: () => workerNotesApi.get(workerId),
  });

  // Seed the editor once the saved note loads (only while the employer
  // hasn't started typing, so a refetch never clobbers an in-progress edit).
  useEffect(() => {
    if (query.data && !dirty) {
      setText(query.data.note);
      setSavedAt(query.data.updatedAt);
    }
  }, [query.data, dirty]);

  const mutation = useMutation({
    mutationFn: () => workerNotesApi.save(workerId, text.trim()),
    onSuccess: (data) => {
      haptic('success');
      setDirty(false);
      setSavedAt(data.updatedAt);
    },
    onError: () => haptic('error'),
  });

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('employer.worker_note.label')}
        </Text>
        <TextField
          value={text}
          onChangeText={(v) => {
            setText(v);
            setDirty(true);
          }}
          placeholder={t('employer.worker_note.placeholder')}
          helper={t('employer.worker_note.private_hint')}
          multiline
          numberOfLines={3}
        />
        <Button
          label={
            mutation.isPending
              ? t('employer.worker_note.saving')
              : dirty
                ? t('employer.worker_note.save')
                : savedAt
                  ? t('employer.worker_note.saved')
                  : t('employer.worker_note.save')
          }
          variant="secondary"
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending || !dirty}
        />
      </View>
    </Card>
  );
}

// ─── Auto-expiring offer ───────────────────────────────────────────────────

/** "expires in 5h" / "expires in 30m" from an ISO deadline. */
function expiresInLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expiring';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `expires in ${h}h`;
  return `expires in ${Math.max(1, Math.round(ms / 60_000))}m`;
}

/**
 * Employer offer control. When no offer is out, shows quick "Offer · 24h /
 * 48h" buttons; once pending, shows the countdown; once resolved, shows
 * the outcome. The expiry itself is handled server-side by the sweep.
 */
function OfferCard({ applicant }: { applicant: ApplicantEntry }) {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const offer = applicant.offer;

  async function makeOffer(ttlHours: number) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.makeOffer(applicant.id, ttlHours);
      haptic('success');
      await queryClient.invalidateQueries({
        queryKey: ['applicants', 'detail', applicant.id],
      });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  async function respondCounter(accept: boolean) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.respondToCounter(applicant.id, accept);
      haptic(accept ? 'success' : 'warning');
      await queryClient.invalidateQueries({
        queryKey: ['applicants', 'detail', applicant.id],
      });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  const counterRupees =
    offer.counterWageAmount != null
      ? Math.round(offer.counterWageAmount / 100).toLocaleString('en-IN')
      : '';

  const statusLine =
    offer.status === 'pending'
      ? t('employer.offer.pending', {
          when: offer.expiresAt ? expiresInLabel(offer.expiresAt) : '',
        })
      : offer.status === 'countered'
        ? t('employer.offer.countered', { wage: counterRupees })
        : offer.status === 'accepted'
          ? t('employer.offer.accepted')
          : offer.status === 'declined'
            ? t('employer.offer.declined')
            : offer.status === 'expired'
              ? t('employer.offer.expired')
              : null;
  const tone =
    offer.status === 'accepted'
      ? 'success'
      : offer.status === 'declined' || offer.status === 'expired'
        ? 'warning'
        : 'secondary';

  // Once hired there's nothing to offer; only show the (accepted) status.
  const canOffer =
    offer.status === 'none' || offer.status === 'declined' || offer.status === 'expired';

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('employer.offer.label')}
        </Text>
        {statusLine ? (
          <Text variant="bodyLarge" weight="medium" tone={tone}>
            {statusLine}
          </Text>
        ) : null}
        {offer.status === 'countered' && applicant.status !== 'hired' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={t('employer.offer.accept_counter', { wage: counterRupees })}
              onPress={() => void respondCounter(true)}
              disabled={busy}
            />
            <Button
              label={t('employer.offer.decline_counter')}
              variant="secondary"
              onPress={() => void respondCounter(false)}
              disabled={busy}
            />
          </View>
        ) : applicant.status !== 'hired' && canOffer ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={t('employer.offer.make_24h')}
              onPress={() => void makeOffer(24)}
              disabled={busy}
            />
            <Button
              label={t('employer.offer.make_48h')}
              variant="secondary"
              onPress={() => void makeOffer(48)}
              disabled={busy}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ─── Arrival likelihood ────────────────────────────────────────────────────

/**
 * "Will they show up?" card. Pulls the heuristic arrival-likelihood score
 * for this applicant and shows the band + the transparent factors behind
 * it (distance, shift time, rating). Helps the employer line up backfill
 * when the odds are poorer — never hides anyone.
 */
function ArrivalLikelihoodCard({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['arrival-likelihood', applicationId],
    queryFn: () => arrivalLikelihoodApi.get(applicationId),
  });
  if (query.isLoading || query.isError || !query.data) return null;

  const { band, score, factors } = query.data;
  const bandTone: Record<ArrivalBand, 'success' | 'warning' | 'danger'> = {
    high: 'success',
    medium: 'warning',
    low: 'danger',
  };
  const tone = bandTone[band];

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text
            variant="footnote"
            weight="medium"
            tone="secondary"
            style={{ letterSpacing: 1.0, flex: 1 }}
          >
            {t('employer.arrival.label')}
          </Text>
          <Pill label={t(`employer.arrival.band_${band}`)} tone={tone === 'danger' ? 'warning' : tone} />
        </View>
        <Text variant="footnote" tone="tertiary">
          {t('employer.arrival.score', { score })}
        </Text>
        <View style={{ gap: 2 }}>
          {factors.map((f, i) => (
            <Text key={i} variant="footnote" tone="secondary">
              {f.effect > 0 ? '↑' : f.effect < 0 ? '↓' : '•'} {f.label}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}

// ─── Self-qualifying skill check ───────────────────────────────────────────

/**
 * Shows whether this applicant passed the skill check the employer
 * attached to the job. Reads the worker's passed-test slugs (the same
 * endpoint the seeker profile uses) and checks membership — no new
 * backend needed. Lets the employer make the first cut on a demonstrated
 * skill, not just a claimed one.
 */
function SkillCheckBadge({ seekerId, testId }: { seekerId: string; testId: string }) {
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['passed-tests', seekerId],
    queryFn: () => skillTestsApi.passedForSeeker(seekerId),
  });
  if (query.isLoading || query.isError) return null;
  const passed = query.data?.passedTestIds.includes(testId) ?? false;
  return (
    <Card>
      <View style={{ gap: spacing.xs }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('employer.skill_check.label')}
        </Text>
        <Pill
          label={passed ? t('employer.skill_check.passed') : t('employer.skill_check.not_passed')}
          tone={passed ? 'success' : 'neutral'}
          leading={passed ? '✓' : undefined}
        />
      </View>
    </Card>
  );
}

// ─── Incident log ──────────────────────────────────────────────────────────

/**
 * Private, timestamped incident log for a worker — "arrived 40 min late",
 * "broke a plate". Append-only, employer-only, with an optional photo.
 * Builds an honest reliability history without the heat of a star rating.
 */
function IncidentLogCard({
  workerId,
  applicationId,
}: {
  workerId: string;
  applicationId: string;
}) {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['incidents', workerId],
    queryFn: () => incidentsApi.list(workerId),
  });
  const incidents = query.data?.incidents ?? [];

  async function attachPhoto() {
    try {
      const img = await pickChatImage({ source: 'camera' });
      if (img) setPhoto(img.dataUrl);
    } catch {
      /* cancelled / unavailable */
    }
  }

  async function logIt() {
    const text = note.trim();
    if (busy || !text) return;
    setBusy(true);
    try {
      await incidentsApi.log({
        workerId,
        applicationId,
        note: text,
        ...(photo ? { photoDataUrl: photo } : {}),
      });
      haptic('success');
      setNote('');
      setPhoto(null);
      await queryClient.invalidateQueries({ queryKey: ['incidents', workerId] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('employer.incident.label')}
        </Text>

        {incidents.length > 0 ? (
          <View style={{ gap: spacing.xs }}>
            {incidents.slice(0, 5).map((inc) => (
              <View key={inc.id} style={{ gap: 2 }}>
                <Text variant="footnote">
                  {inc.photoUrl ? '📷 ' : ''}
                  {inc.note}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {new Date(inc.createdAt).toLocaleString('en-IN')}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="footnote" tone="tertiary">
            {t('employer.incident.empty')}
          </Text>
        )}

        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={t('employer.incident.placeholder')}
          multiline
          numberOfLines={2}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={photo ? t('employer.incident.photo_added') : t('employer.incident.add_photo')}
            variant="secondary"
            onPress={() => void attachPhoto()}
            disabled={busy}
          />
          <Button
            label={busy ? t('employer.incident.logging') : t('employer.incident.log')}
            onPress={() => void logIt()}
            disabled={busy || !note.trim()}
          />
        </View>
      </View>
    </Card>
  );
}

// ─── Crew documents ────────────────────────────────────────────────────────

/**
 * Tracks a worker's credential expiries (driving licence, electrical cert).
 * Add a label + expiry date (YYYY-MM-DD); the card flags anything within
 * 30 days or already expired so a lapse never surfaces on shift day.
 */
function CrewDocumentsCard({ workerId }: { workerId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['crew-documents', workerId],
    queryFn: () => crewDocumentsApi.list(workerId),
  });
  const docs = query.data?.documents ?? [];

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) && !Number.isNaN(Date.parse(expiry));

  async function add() {
    if (busy || !label.trim() || !validDate) return;
    setBusy(true);
    try {
      await crewDocumentsApi.add({ workerId, label: label.trim(), expiresAt: expiry });
      haptic('success');
      setLabel('');
      setExpiry('');
      await queryClient.invalidateQueries({ queryKey: ['crew-documents', workerId] });
      await queryClient.invalidateQueries({ queryKey: ['crew-documents', 'expiring'] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await crewDocumentsApi.remove(id);
      haptic('selection');
      await queryClient.invalidateQueries({ queryKey: ['crew-documents', workerId] });
    } catch {
      haptic('error');
    }
  }

  const soon = Date.now() + 30 * 86_400_000;

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('employer.documents.label')}
        </Text>
        {docs.map((d) => {
          const exp = new Date(d.expiresAt).getTime();
          const tone = exp < Date.now() ? 'danger' : exp < soon ? 'warning' : 'secondary';
          return (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="medium" numberOfLines={1}>
                  {d.label}
                </Text>
                <Text variant="caption" tone={tone}>
                  {t('employer.documents.expires', {
                    date: new Date(d.expiresAt).toLocaleDateString('en-IN'),
                  })}
                </Text>
              </View>
              <Pressable onPress={() => void remove(d.id)} hitSlop={8}>
                <Text variant="footnote" tone="tertiary">
                  {t('employer.documents.remove')}
                </Text>
              </Pressable>
            </View>
          );
        })}
        <TextField
          value={label}
          onChangeText={setLabel}
          placeholder={t('employer.documents.label_ph')}
        />
        <TextField
          value={expiry}
          onChangeText={setExpiry}
          placeholder={t('employer.documents.expiry_ph')}
          keyboardType="numbers-and-punctuation"
        />
        <Button
          label={busy ? t('employer.documents.adding') : t('employer.documents.add')}
          variant="secondary"
          onPress={() => void add()}
          disabled={busy || !label.trim() || !validDate}
        />
      </View>
    </Card>
  );
}

// ─── Block / report ────────────────────────────────────────────────────────

/**
 * Low-emphasis safety actions: block a worker from re-applying, or report
 * a fake/scam/abusive profile to the trust-and-safety queue. Confirmation-
 * gated so neither fires by accident.
 */
function ModerationActions({ workerId, workerName }: { workerId: string; workerName: string }) {
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const [busy, setBusy] = useState(false);

  function confirmBlock() {
    Alert.alert(
      t('employer.moderation.block_title', { name: workerName || t('employer.applicant_detail.applicant_fallback') }),
      t('employer.moderation.block_body'),
      [
        { text: t('employer.moderation.cancel'), style: 'cancel' },
        {
          text: t('employer.moderation.block'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await moderationApi.block(workerId);
              haptic('success');
              navigation.goBack();
            } catch {
              haptic('error');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function confirmReport() {
    const reasons: Array<{ key: ReportReason; labelKey: string }> = [
      { key: 'fake_profile', labelKey: 'employer.moderation.reason_fake' },
      { key: 'scam', labelKey: 'employer.moderation.reason_scam' },
      { key: 'abusive', labelKey: 'employer.moderation.reason_abusive' },
    ];
    Alert.alert(t('employer.moderation.report_title'), t('employer.moderation.report_body'), [
      ...reasons.map((r) => ({
        text: t(r.labelKey),
        onPress: async () => {
          setBusy(true);
          try {
            await moderationApi.report(workerId, r.key);
            haptic('success');
            Alert.alert(t('employer.moderation.report_done'));
          } catch {
            haptic('error');
          } finally {
            setBusy(false);
          }
        },
      })),
      { text: t('employer.moderation.cancel'), style: 'cancel' as const },
    ]);
  }

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.md }}>
      <Pressable onPress={confirmReport} disabled={busy} hitSlop={8}>
        <Text variant="footnote" tone="tertiary">
          {t('employer.moderation.report')}
        </Text>
      </Pressable>
      <Pressable onPress={confirmBlock} disabled={busy} hitSlop={8}>
        <Text variant="footnote" tone="danger">
          {t('employer.moderation.block')}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Work proof review ─────────────────────────────────────────────────────

/**
 * Employer's review of the worker's completed-work photo. Shows the photo
 * once submitted with Approve / Reject; the worker can resubmit after a
 * rejection. Sits alongside the pay flow as the quality gate before money
 * moves.
 */
/**
 * "Call via Doondo" — places a privacy-preserving call to the worker. When
 * a telephony provider is configured the dialled number is a masked proxy;
 * otherwise it falls back to the worker's real (already-revealable) number
 * so the call still connects.
 */
function CallViaDoondoButton({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const [busy, setBusy] = useState(false);

  async function call() {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      const res = await maskedCallApi.start(applicationId);
      if (!res.dialNumber) {
        Alert.alert(t('masked_call.no_number'));
        return;
      }
      await Linking.openURL(`tel:${res.dialNumber}`);
    } catch {
      haptic('error');
      Alert.alert(t('masked_call.fail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={() => void call()}
      disabled={busy}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: 12,
        borderRadius: radii.pill,
        borderWidth: 0.5,
        borderColor: theme.brand.hero,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Text variant="body" weight="medium" style={{ color: theme.brand.hero }}>
        {busy ? t('masked_call.connecting') : t('masked_call.cta')}
      </Text>
    </Pressable>
  );
}

function WorkProofReviewCard({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['work-proof', applicationId],
    queryFn: () => workProofApi.get(applicationId),
  });
  const proof = query.data;
  if (query.isLoading || !proof) return null;
  if (proof.status === 'none') {
    return (
      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
            {t('employer.work_proof.label')}
          </Text>
          <Text variant="footnote" tone="tertiary">
            {t('employer.work_proof.awaiting')}
          </Text>
        </View>
      </Card>
    );
  }

  async function review(approve: boolean) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await workProofApi.review(applicationId, approve);
      haptic(approve ? 'success' : 'warning');
      await queryClient.invalidateQueries({ queryKey: ['work-proof', applicationId] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
          {t('employer.work_proof.label')}
        </Text>
        {proof.photoUrl ? (
          <Image
            source={{ uri: proof.photoUrl }}
            style={{ width: '100%', height: 200, borderRadius: radii.md }}
            resizeMode="cover"
          />
        ) : null}
        {proof.status === 'approved' ? (
          <Text variant="body" weight="medium" tone="success">
            {t('employer.work_proof.approved')}
          </Text>
        ) : proof.status === 'rejected' ? (
          <Text variant="body" weight="medium" tone="warning">
            {t('employer.work_proof.rejected')}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={t('employer.work_proof.approve')}
              onPress={() => void review(true)}
              disabled={busy}
            />
            <Button
              label={t('employer.work_proof.reject')}
              variant="secondary"
              onPress={() => void review(false)}
              disabled={busy}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

// ─── Next shift + confirmation ─────────────────────────────────────────────

/** Build a Date for a given hour, tomorrow (or today if still ahead). */
function nextShiftDate(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Employer card for a hired worker: schedule the next shift with one tap
 * and see the night-before confirmation status. Quick-set buttons avoid a
 * date-picker — the common case is "tomorrow morning / evening". Once a
 * shift is set, the worker is pinged the evening before; this card then
 * shows whether they've confirmed, declined, or not yet replied (the cue
 * to line up backfill).
 */
function EmployerShiftCard({ applicant }: { applicant: ApplicantEntry }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [endorsed, setEndorsed] = useState(false);

  // Post-shift one-tap endorsement: endorse the worker's top skill for this
  // job. Reuses the existing endorse API; the fuller controls live below.
  const endorseSkill = applicant.job?.skills?.[0] ?? applicant.seeker?.skills?.[0] ?? null;
  async function endorse() {
    if (busy || !endorseSkill || !applicant.seeker?.id) return;
    setBusy(true);
    haptic('selection');
    try {
      await endorsementsApi.endorse(applicant.seeker.id, {
        trade: endorseSkill,
        applicationId: applicant.id,
      });
      haptic('success');
      setEndorsed(true);
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  const whenLabel = applicant.nextShiftAt
    ? new Date(applicant.nextShiftAt).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  async function setShift(hour: number) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.setNextShift(applicant.id, nextShiftDate(hour).toISOString());
      haptic('success');
      await queryClient.invalidateQueries({
        queryKey: ['applicants', 'detail', applicant.id],
      });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  const status = applicant.shiftConfirmation;
  const statusLine =
    status === 'confirmed'
      ? t('employer.shift_schedule.status_confirmed')
      : status === 'declined'
        ? t('employer.shift_schedule.status_declined')
        : status === 'awaiting'
          ? t('employer.shift_schedule.status_awaiting')
          : null;
  const statusTone: 'success' | 'warning' | 'danger' | 'secondary' =
    status === 'confirmed'
      ? 'success'
      : status === 'declined'
        ? 'danger'
        : status === 'awaiting'
          ? 'warning'
          : 'secondary';

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text
          variant="footnote"
          weight="medium"
          tone="secondary"
          style={{ letterSpacing: 1.0 }}
        >
          {t('employer.shift_schedule.label')}
        </Text>

        {whenLabel ? (
          <Text variant="bodyLarge" weight="medium">
            {whenLabel}
          </Text>
        ) : (
          <Text variant="footnote" tone="tertiary">
            {t('employer.shift_schedule.none')}
          </Text>
        )}

        {statusLine ? (
          <Text variant="footnote" tone={statusTone} weight="medium">
            {statusLine}
          </Text>
        ) : null}

        {applicant.onTheWay.active ? (
          <Text variant="footnote" tone="success" weight="medium">
            {applicant.onTheWay.etaMinutes != null
              ? t('employer.shift_schedule.on_the_way_eta', { eta: applicant.onTheWay.etaMinutes })
              : t('employer.shift_schedule.on_the_way')}
          </Text>
        ) : null}

        {(applicant.job?.prepChecklist?.length ?? 0) > 0 ? (
          <Text
            variant="footnote"
            weight="medium"
            tone={applicant.prepAcknowledgedAt ? 'success' : 'tertiary'}
          >
            {applicant.prepAcknowledgedAt
              ? t('employer.shift_schedule.checklist_ack')
              : t('employer.shift_schedule.checklist_pending')}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={t('employer.shift_schedule.tomorrow_morning')}
            variant="secondary"
            onPress={() => void setShift(8)}
            disabled={busy}
          />
          <Button
            label={t('employer.shift_schedule.tomorrow_evening')}
            variant="secondary"
            onPress={() => void setShift(18)}
            disabled={busy}
          />
        </View>

        {/* Post-shift one-tap endorsement of the worker's top skill. */}
        {endorseSkill ? (
          endorsed ? (
            <Text variant="footnote" tone="success" weight="medium">
              {t('employer.shift_schedule.endorsed', { skill: prettifySkill(endorseSkill) })}
            </Text>
          ) : (
            <Button
              label={t('employer.shift_schedule.endorse', { skill: prettifySkill(endorseSkill) })}
              variant="secondary"
              onPress={() => void endorse()}
              disabled={busy}
            />
          )
        ) : null}
      </View>
    </Card>
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
