/**
 * ResumePreviewScreen — read-only resume rendered from the seeker's
 * workHistory + profile basics. Reached from the Resume Builder wizard's
 * "Generate resume" CTA, or from the Profile menu when a resume already
 * exists.
 *
 * The preview is intentionally simple — clean typography, a hero card,
 * one card per job. It's designed to look identical when the user shares
 * the plain-text version (via the share sheet) so a recruiter reading
 * the SMS gets the same info as someone looking at the screen.
 *
 * Three actions:
 *   - Share        opens the system Share sheet with a text version
 *   - Edit         pushes the wizard with the entries pre-filled
 *   - Delete       clears workHistory back to []
 */

import { type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { haptic } from '@/lib/haptics';
import { meApi } from '@/api/me.api';
import { alertsApi } from '@/api/alerts.api';
import { coursesApi } from '@/api/courses.api';
import { endorsementsApi } from '@/api/endorsements.api';
import { skillTestsApi } from '@/api/skillTests.api';
import { shareResumePdf } from '@/lib/resumePdf';
import { prettifySkill } from '@/lib/trades';
import { ApiError } from '@/api/errors';
import {
  formatRange,
  formatTenure,
  sortWorkHistory,
  suggestedAlertFromUser,
  tenureMonths,
  type SuggestedAlert,
} from '@/lib/workHistory';
import { useTranslate } from '@/i18n/useTranslate';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicUser, WorkExperience } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function ResumePreviewInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;
  const t = useTranslate();

  const entries = sortWorkHistory(user?.workHistory ?? []);

  // Pull the seeker's alerts so we can decide whether to surface the
  // "Set up a Job Alert" suggestion. Hidden as soon as they have ≥1 alert.
  const alertsQuery = useQuery({
    queryKey: ['alerts', 'me'],
    queryFn: () => alertsApi.list(),
    staleTime: 60_000,
    enabled: !!user,
  });
  const hasAnyAlert = (alertsQuery.data?.alerts.length ?? 0) > 0;
  const suggestion = user ? suggestedAlertFromUser(user) : null;
  const showSuggestion =
    !!suggestion && !alertsQuery.isLoading && !hasAnyAlert;

  const clearHistory = useMutation({
    mutationFn: () => meApi.updateWorkHistory({ entries: [] }),
    onSuccess: ({ user: updated }) => {
      setStore((s) => ({ ...s, user: updated }));
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      haptic('warning');
      navigation.goBack();
    },
    onError: (err) => {
      haptic('error');
      const msg = err instanceof ApiError ? err.message : t('resume_preview.try_again');
      Alert.alert(t('resume_preview.couldnt_delete_title'), msg);
    },
  });

  // Pull earned badges to embed in the PDF. Cached aggressively because
  // the user already saw the same data on screen above; another fetch is
  // wasted on most renders.
  const badgesQuery = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: () => coursesApi.myEnrollments(),
    staleTime: 60_000,
    enabled: !!user,
  });
  const catalogueQuery = useQuery({
    queryKey: ['courses', 'catalogue'],
    queryFn: () => coursesApi.list(),
    staleTime: 60_000,
    enabled: !!user,
  });

  const onShare = async () => {
    if (!user) return;
    haptic('selection');

    // Resolve earned badges to embed in the PDF. Fine if empty.
    const courseById = new Map(
      (catalogueQuery.data?.courses ?? []).map((c) => [c.id, c]),
    );
    const earnedBadges = (badgesQuery.data?.enrollments ?? [])
      .filter((e) => e.completedAt)
      .map((e) => courseById.get(e.courseId))
      .filter((c): c is NonNullable<typeof c> => c != null);

    // Try PDF first — recruiters expect a real file. If expo-print
    // isn't available or the device can't share, fall back silently
    // to the existing plain-text path so the button never feels broken.
    const pdf = await shareResumePdf({ user, badges: earnedBadges });
    if (pdf.ok) return;

    try {
      await Share.share({
        title: `${user.name}${t('resume_preview.share_title_suffix')}`,
        message: buildShareText(user, entries, t),
      });
    } catch {
      // user dismissed
    }
  };

  const onEdit = () => {
    haptic('selection');
    navigation.replace('ResumeBuilder');
  };

  const onDelete = () => {
    Alert.alert(
      t('resume_preview.delete_title'),
      t('resume_preview.delete_body'),
      [
        { text: t('resume_preview.delete_cancel'), style: 'cancel' },
        {
          text: t('resume_preview.delete_confirm'),
          style: 'destructive',
          onPress: () => clearHistory.mutate(),
        },
      ],
    );
  };

  if (!user) {
    return <Screen />;
  }

  if (entries.length === 0) {
    return (
      <Screen edges={[]}>
        <View style={{ flex: 1, paddingTop: insets.top + spacing.md }}>
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
            </Pressable>
          </View>
          <EmptyState
            glyph="📝"
            eyebrow={t('resume_preview.empty_eyebrow')}
            title={t('resume_preview.empty_title')}
            message={t('resume_preview.empty_message')}
            cta={{
              label: t('resume_preview.empty_cta'),
              onPress: () => {
                haptic('selection');
                navigation.replace('ResumeBuilder');
              },
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + spacing['5xl'],
        }}
      >
        {/* Top bar */}
        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            backgroundColor: theme.bg.canvas,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: theme.text.primary,
              flex: 1,
            }}
          >
            {t('resume_preview.topbar_title')}
          </Text>
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: blue[600] }}>
              {t('resume_preview.topbar_edit')}
            </Text>
          </Pressable>
        </View>

        {/* Hero card */}
        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
          <LinearGradient
            colors={[blue[700], blue[600], blue[500]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: radii.xl,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <Avatar
                photoUrl={user.photoUrl ?? null}
                name={user.name}
                size={64}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: '#FFFFFF',
                    letterSpacing: -0.4,
                  }}
                  numberOfLines={1}
                >
                  {user.name}
                </Text>
                {user.location?.city ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                    }}
                    numberOfLines={1}
                  >
                    {user.location.area
                      ? `${user.location.area}, ${user.location.city}`
                      : user.location.city}
                  </Text>
                ) : null}
                {user.rating ? (
                  <View style={{ marginTop: 4 }}>
                    <Stars
                      score={user.rating.avg}
                      count={user.rating.count}
                      compact
                      style={{ color: '#FFFFFF' }}
                    />
                  </View>
                ) : null}
              </View>
            </View>
            <ContactRow user={user} t={t} />
          </LinearGradient>
        </View>

        {/* Alert suggestion — appears once after first save, vanishes
           once the user creates any alert. */}
        {showSuggestion && suggestion ? (
          <View
            style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}
          >
            <SuggestionCard
              t={t}
              suggestion={suggestion}
              onAccept={() => {
                haptic('selection');
                navigation.navigate('JobAlertForm', { suggestion });
              }}
            />
          </View>
        ) : null}

        {/* Bio */}
        {user.bio ? (
          <Section title={t('resume_preview.section_about')}>
            <View style={cardStyle(theme)}>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 21,
                  color: theme.text.secondary,
                }}
              >
                {user.bio}
              </Text>
            </View>
          </Section>
        ) : null}

        {/* Skills */}
        {user.skills?.length ? (
          <Section title={t('resume_preview.section_skills')}>
            <View
              style={[
                cardStyle(theme),
                {
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.xs,
                },
              ]}
            >
              {user.skills.map((s) => (
                <View
                  key={s}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: radii.pill,
                    backgroundColor: theme.bg.subtle,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '500',
                      color: theme.text.primary,
                    }}
                  >
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Work history */}
        <Section title={t('resume_preview.section_experience', { n: entries.length })}>
          <View style={{ gap: spacing.sm }}>
            {entries.map((e, i) => (
              <WorkRow key={`${e.company}-${e.startDate}-${i}`} t={t} entry={e} />
            ))}
          </View>
        </Section>

        {/* Education — shown only when the seeker has added entries. */}
        {user.education && user.education.length > 0 ? (
          <Section title={t('resume_preview.section_education', { n: user.education.length })}>
            <View style={{ gap: spacing.sm }}>
              {user.education.map((e, i) => (
                <View
                  key={`${e.degree}-${e.startYear}-${i}`}
                  style={cardStyle(theme)}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: theme.text.primary,
                    }}
                    numberOfLines={1}
                  >
                    {e.degree}
                    {e.fieldOfStudy ? `, ${e.fieldOfStudy}` : ''}
                  </Text>
                  <Text
                    style={{ fontSize: 13, color: theme.text.secondary, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {e.institution}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}>
                    {e.startYear} — {e.current ? t('resume_preview.education_present') : e.endYear ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Verified-trade pills — surfaced when 3+ employers have
           endorsed the seeker on a trade. Highest trust signal we have. */}
        <VerifiedTradesSection t={t} seekerId={user.id} />

        {/* Tested-trade pills — surfaced when the seeker has passed the
           skill assessment for that trade. Complementary to verified. */}
        <TestedTradesSection t={t} seekerId={user.id} />

        {/* Earned course badges — taps through to Courses. Hidden when
           the seeker hasn't finished any course yet. */}
        <BadgesSection t={t} />

        {/* Work photos — horizontal carousel shown only when there are
           photos. Tap a photo for a fuller view (system image viewer). */}
        {user.workPhotos && user.workPhotos.length > 0 ? (
          <WorkPhotosWithVerifyBadges
            t={t}
            photos={user.workPhotos}
            seekerId={user.id}
          />
        ) : null}

        {/* Footer signature */}
        <Text
          style={{
            fontSize: 10,
            color: theme.text.tertiary,
            textAlign: 'center',
            marginTop: spacing.lg,
            paddingHorizontal: spacing.xl,
          }}
        >
          {t('resume_preview.footer_signature')}
        </Text>
      </ScrollView>

      {/* Sticky CTAs — hardcoded colors so the buttons stay visible on
         every build regardless of theme-token resolution. */}
      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.md,
          borderTopWidth: 0.5,
          borderTopColor: theme.border.subtle,
          backgroundColor: theme.bg.canvas,
          flexDirection: 'row',
          gap: spacing.sm,
        }}
      >
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => ({
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#B91C1C',
            backgroundColor: '#FFFFFF',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#B91C1C' }}>
            {t('resume_preview.cta_delete')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#2563EB',
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#2563EB',
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
            {t('resume_preview.cta_share')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ContactRow({ user, t }: { user: PublicUser; t: TFn }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {user.phone ? <PillTag label={user.phone} icon="📞" /> : null}
      <PillTag label={user.email} icon="✉" />
      {user.experienceYears != null ? (
        <PillTag
          label={t(
            user.experienceYears === 1
              ? 'resume_preview.contact_years_one'
              : 'resume_preview.contact_years_other',
            { n: user.experienceYears },
          )}
          icon="⏱"
        />
      ) : null}
    </View>
  );
}

function PillTag({ label, icon }: { label: string; icon: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radii.pill,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.34)',
      }}
    >
      <Text style={{ fontSize: 11, color: '#FFFFFF' }}>{icon}</Text>
      <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '500' }}>
        {label}
      </Text>
    </View>
  );
}

function SuggestionCard({
  t,
  suggestion,
  onAccept,
}: {
  t: TFn;
  suggestion: SuggestedAlert;
  onAccept: () => void;
}) {
  const { theme } = useTheme();
  // The body sentence carries different shapes depending on whether the
  // seeker has a city in their profile; flatten the role token here so
  // the translation receives one combined string instead of mixed inline
  // markup the language couldn't reorder.
  const role = suggestion.query ?? suggestion.name;
  const body = suggestion.city
    ? t('resume_preview.suggestion_body_with_city', { role, city: suggestion.city })
    : t('resume_preview.suggestion_body_no_city', { role });
  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16 }}>🔔</Text>
        </View>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: theme.text.primary,
            flex: 1,
          }}
        >
          {t('resume_preview.suggestion_title')}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13,
          lineHeight: 19,
          color: theme.text.secondary,
        }}
      >
        {body}
      </Text>
      <Pressable
        onPress={onAccept}
        style={({ pressed }) => ({
          marginTop: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radii.pill,
          backgroundColor: blue[600],
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
          {t('resume_preview.suggestion_cta')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Earned-badge strip — pills derived from completed courses. Each badge
 * is a small 🏅 + course-title pill. Hidden entirely when the seeker
 * hasn't finished any course.
 */
/**
 * Work photos with verified-by-employer badges. Photos with at least
 * one verification get a green "✓ Verified" corner pill, so recruiters
 * and employers reading the resume see the photo trust signal inline
 * with the photo itself.
 */
function WorkPhotosWithVerifyBadges({
  t,
  photos,
  seekerId,
}: {
  t: TFn;
  photos: string[];
  seekerId: string;
}) {
  const { theme } = useTheme();
  const verifyQuery = useQuery({
    queryKey: ['photoVerifications', seekerId],
    queryFn: () => endorsementsApi.listPhotoVerifications(seekerId),
    staleTime: 60_000,
  });
  const counts = new Map(
    (verifyQuery.data?.verifications ?? []).map((v) => [v.photoIndex, v.count]),
  );
  return (
    <Section title={t('resume_preview.section_photos', { n: photos.length })}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: spacing.sm,
          paddingRight: spacing.lg,
        }}
      >
        {photos.map((uri, i) => {
          const count = counts.get(i) ?? 0;
          return (
            <View
              key={`${uri.slice(-20)}-${i}`}
              style={{
                width: 220,
                height: 160,
                borderRadius: radii.lg,
                overflow: 'hidden',
                borderWidth: 0.5,
                borderColor: theme.border.subtle,
                backgroundColor: theme.bg.surface,
              }}
            >
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
              {count > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(16, 185, 129, 0.92)',
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '700' }}
                  >
                    {t('resume_preview.verified_photo_label')}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Section>
  );
}

/**
 * Tested-trade pills — surfaced when the seeker has passed a skill
 * assessment. Smaller trust signal than employer endorsements (one
 * seeker can take the test alone) but a real one — they showed they
 * know the trade fundamentals.
 */
function TestedTradesSection({ t, seekerId }: { t: TFn; seekerId: string }) {
  const passed = useQuery({
    queryKey: ['skillTests', 'passed', seekerId],
    queryFn: () => skillTestsApi.passedForSeeker(seekerId),
    staleTime: 60_000,
  });
  const catalogue = useQuery({
    queryKey: ['skillTests', 'catalogue'],
    queryFn: () => skillTestsApi.list(),
    staleTime: 60_000,
  });
  const testIds = passed.data?.passedTestIds ?? [];
  if (testIds.length === 0) return null;
  const titles = new Map((catalogue.data?.tests ?? []).map((test) => [test.id, test]));
  return (
    <Section title={t('resume_preview.section_tested', { n: testIds.length })}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {testIds.map((id) => {
          const test = titles.get(id);
          return (
            <View
              key={id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
                backgroundColor: '#FEF3C7',
                borderWidth: 0.5,
                borderColor: '#FDE68A',
              }}
            >
              <Text style={{ fontSize: 14 }}>🧠</Text>
              {test ? <Text style={{ fontSize: 12 }}>{test.emoji}</Text> : null}
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350F' }}>
                {t('resume_preview.tested_label', { name: test ? test.title : prettifySkill(id) })}
              </Text>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

/**
 * Verified-trade pills — only shown when at least one trade has crossed
 * the endorsement threshold. Each pill says "✓ Verified electrician"
 * with the endorser count.
 */
function VerifiedTradesSection({ t, seekerId }: { t: TFn; seekerId: string }) {
  const query = useQuery({
    queryKey: ['endorsements', seekerId],
    queryFn: () => endorsementsApi.listForSeeker(seekerId),
    staleTime: 60_000,
  });
  const verified = (query.data?.endorsements ?? []).filter((e) => e.verified);
  if (verified.length === 0) return null;
  return (
    <Section title={t('resume_preview.section_verified', { n: verified.length })}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {verified.map((v) => (
          <View
            key={v.trade}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
              backgroundColor: '#D1FAE5',
              borderWidth: 0.5,
              borderColor: '#86EFAC',
            }}
          >
            <Text style={{ fontSize: 14 }}>✓</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
              {prettifySkill(v.trade)}
              {' · '}
              {t(
                v.count === 1
                  ? 'resume_preview.verified_employer_one'
                  : 'resume_preview.verified_employer_other',
                { count: v.count },
              )}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function BadgesSection({ t }: { t: TFn }) {
  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: () => coursesApi.myEnrollments(),
    staleTime: 60_000,
  });
  const cataloguQuery = useQuery({
    queryKey: ['courses', 'catalogue'],
    queryFn: () => coursesApi.list(),
    staleTime: 60_000,
  });
  const earned = (enrollmentsQuery.data?.enrollments ?? []).filter(
    (e) => e.completedAt,
  );
  if (earned.length === 0) return null;
  const courseById = new Map(
    (cataloguQuery.data?.courses ?? []).map((c) => [c.id, c]),
  );
  return (
    <Section title={t('resume_preview.section_badges', { n: earned.length })}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {earned.map((e) => {
          const c = courseById.get(e.courseId);
          if (!c) return null;
          return (
            <View
              key={e.id}
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
              <Text style={{ fontSize: 12 }}>{c.emoji}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#78350F' }}>
                {c.title}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 1.6,
          color: theme.text.tertiary,
          marginBottom: spacing.sm,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function WorkRow({ t, entry }: { t: TFn; entry: WorkExperience }) {
  const { theme } = useTheme();
  const months = tenureMonths(entry);
  return (
    <View style={cardStyle(theme)}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          marginBottom: spacing.xs,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}
            numberOfLines={1}
          >
            {entry.role}
          </Text>
          <Text
            style={{ fontSize: 13, color: theme.text.secondary, fontWeight: '500' }}
            numberOfLines={1}
          >
            {entry.company}
          </Text>
        </View>
        {entry.current ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: theme.status.successSubtle,
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: '700', color: theme.status.success }}
            >
              {t('resume_preview.current_badge')}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: entry.description ? spacing.sm : 0,
        }}
      >
        <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
          {formatRange(entry)}
        </Text>
        {months > 0 ? (
          <>
            <Text style={{ fontSize: 12, color: theme.text.tertiary }}>·</Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
              {formatTenure(months)}
            </Text>
          </>
        ) : null}
      </View>
      {entry.description ? (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: theme.text.secondary,
          }}
        >
          {entry.description}
        </Text>
      ) : null}
    </View>
  );
}

const cardStyle = (theme: ReturnType<typeof useTheme>['theme']) => ({
  backgroundColor: theme.bg.surface,
  borderRadius: radii.lg,
  borderWidth: 0.5,
  borderColor: theme.border.subtle,
  padding: spacing.md,
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
});

// ─── Share text ──────────────────────────────────────────────────────────────

/**
 * Plain-text version of the resume. Used for the system Share sheet so
 * the recipient (WhatsApp, SMS, email) gets the same info as the
 * on-screen view, no PDF required.
 */
function buildShareText(user: PublicUser, entries: WorkExperience[], t: TFn): string {
  const lines: string[] = [];
  lines.push(user.name.toUpperCase());
  const contact: string[] = [];
  if (user.phone) contact.push(user.phone);
  contact.push(user.email);
  if (user.location?.city) {
    contact.push(
      user.location.area
        ? `${user.location.area}, ${user.location.city}`
        : user.location.city,
    );
  }
  lines.push(contact.join(' · '));
  if (user.experienceYears != null) {
    lines.push(
      t(
        user.experienceYears === 1
          ? 'resume_preview.share_year_one'
          : 'resume_preview.share_year_other',
        { n: user.experienceYears },
      ),
    );
  }
  if (user.rating) {
    lines.push(
      t('resume_preview.share_reviews', {
        avg: user.rating.avg.toFixed(1),
        count: user.rating.count,
      }),
    );
  }
  if (user.bio) {
    lines.push('');
    lines.push(t('resume_preview.share_about'));
    lines.push(user.bio);
  }
  if (user.skills?.length) {
    lines.push('');
    lines.push(t('resume_preview.share_skills'));
    lines.push(user.skills.join(' · '));
  }
  lines.push('');
  lines.push(t('resume_preview.share_experience'));
  for (const e of entries) {
    lines.push('');
    lines.push(`${e.role} — ${e.company}`);
    lines.push(formatRange(e));
    if (e.description) lines.push(e.description);
  }
  lines.push('');
  lines.push('—');
  lines.push(t('resume_preview.footer_signature'));
  return lines.join('\n');
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function ResumePreviewScreen() {
  return (
    <SeekerThemeOverride>
      <ResumePreviewInner />
    </SeekerThemeOverride>
  );
}
