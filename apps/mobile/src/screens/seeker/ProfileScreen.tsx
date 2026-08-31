/**
 * ProfileScreen — seeker profile, premium edition.
 *
 * Layout, top to bottom, with intentional breathing room:
 *   1. Tall blue gradient hero — 110px avatar with a soft glow ring,
 *      name, verified badge, rating, edit-photo camera dot. Pulled-up
 *      stats strip sits over the hero's lower edge.
 *
 *   2. Stats strip — three small floating tiles (real counts):
 *        Applications · Saved jobs · Profile completion %
 *
 *   3. Expected salary — gradient-tinted card with big amount.
 *
 *   4. Skills — chips with brand-tinted background.
 *
 *   5. Menu — four collapsible groups (Grow your career / Find work
 *      buddies / Your rights & safety / Resume & account). Jobs, money
 *      and community actions now live in their own bottom-tab
 *      destinations, so they no longer clutter this list.
 *
 *   6. Sign out — its own danger-tinted button.
 *
 * Every count and field is real — no fake numbers. Empty values show
 * tasteful CTAs (e.g. "Add what you'd like to earn") instead of zeros.
 */

import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { spacing, radii, blue } from '@doondo/tokens';
import {
  Screen,
  Text,
  Button,
  Avatar,
  AccountSwitcherSheet,
  AccountSwitcherPill,
  LanguageToggle,
  CraftShowcase,
} from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { profileViewsApi } from '@/api/profileViews.api';
import { skillSuggestionsApi } from '@/api/skillSuggestions.api';
import { hiringRequestsApi } from '@/api/hiringRequests.api';
import { useTranslate } from '@/i18n/useTranslate';
import { ProfileCompletionMeter } from './ProfileCompletionMeter';
import { computeCompleteness } from '@/lib/profileCompleteness';
import { useUnratedApplications } from '@/hooks/useRatings';
import { pickProfilePhoto } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import { prettifySkill } from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicUser } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [photoError, setPhotoError] = useState<string | null>(null);

  /**
   * The account-switcher PILL itself lives in the new AccountSwitcherPill
   * component below. It decides between quick-switch, opening the sheet,
   * and the "Add Employer" signup based on how many accounts are on
   * device. We only own this sheet's visibility so the pill can ask
   * us to open it when there are 3+ accounts.
   */
  const [switcherVisible, setSwitcherVisible] = useState(false);
  function onAddEmployerFromSheet() {
    navigation.navigate('AddAccountSignup', { role: 'employer' });
  }

  // Real counts for the stats strip and menu subscripts.
  const applicationsQuery = useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => applicationsApi.listMine({ limit: 50 }),
    staleTime: 60_000,
    enabled: Boolean(user),
  });
  const savedQuery = useQuery({
    queryKey: ['jobs', 'saved'],
    queryFn: () => jobsApi.listSaved(),
    staleTime: 60_000,
    enabled: Boolean(user),
  });
  const applicationsCount = applicationsQuery.data?.applications.length ?? 0;
  const savedCount = savedQuery.data?.jobs.length ?? 0;
  // Single source of truth for completion. The hero bar previously read the
  // backend `user.profileCompletion` field while the meter below computed
  // its own score via computeCompleteness() — so the screen showed two
  // different numbers (e.g. 100% in the hero, 85% in the meter). Both now
  // use the same computed score, so they always agree.
  const profileCompletion = computeCompleteness(user).score;

  // Pending ratings — surfaces a "Rate now" banner above the stats
  // strip when the seeker has hires they haven't rated yet. Closes the
  // last gap in the rating loop.
  const unratedQuery = useUnratedApplications();
  const unrated = unratedQuery.data?.unrated ?? [];
  const pendingRatingsCount = unrated.length;

  // Does anything render between the hero and the stats strip? The strip's
  // `marginTop: -spacing['2xl']` pull-up only makes sense when it's
  // directly under the hero. If a banner or streak chip is in the way the
  // pull-up clips that element's bottom row (e.g. the streak chips lose
  // their "day" / "start today" caption — see #profile-screen-overlap-bug).
  const hasStreaks = Boolean(
    user &&
      ((user.streaks?.apply?.totalDays ?? 0) > 0 ||
        (user.streaks?.course?.totalDays ?? 0) > 0 ||
        (user.streaks?.shift?.totalDays ?? 0) > 0),
  );
  const hasOverlayAboveStats =
    profileCompletion < 50 || pendingRatingsCount > 0 || hasStreaks;

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => meApi.updateProfile({ photoUrl: dataUrl }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
      setPhotoError(null);
    },
    onError: (err) => {
      haptic('error');
      setPhotoError(err instanceof Error ? err.message : t('profile_screen.update_photo_failed'));
    },
  });

  async function onChangePhoto() {
    setPhotoError(null);
    try {
      const picked = await pickProfilePhoto();
      if (!picked) return;
      photoMutation.mutate(picked.dataUrl);
    } catch (err) {
      haptic('error');
      setPhotoError(
        err instanceof Error
          ? err.message
          : t('profile_screen.could_not_prepare_photo'),
      );
    }
  }

  if (!user) return null;

  function goEdit(section: 'basics' | 'location' | 'skills' | 'preferences' | 'resume') {
    haptic('selection');
    navigation.navigate('EditProfile', { section });
  }

  function openSalaryEdit() {
    haptic('selection');
    navigation.navigate('EditExpectedSalary' as never);
  }

  function openApplications() {
    haptic('selection');
    navigation.navigate('MyApplications');
  }
  function openSavedJobs() {
    haptic('selection');
    navigation.navigate('MyJobs');
  }
  function openDownloads() {
    haptic('selection');
    navigation.navigate('DownloadCenter');
  }
  function openSettings() {
    haptic('selection');
    navigation.navigate('Settings');
  }
  function confirmSignOut() {
    haptic('warning');
    Alert.alert(t('profile_screen.signout.confirm_title'), t('profile_screen.signout.confirm_body'), [
      { text: t('profile_screen.signout.cancel'), style: 'cancel' },
      { text: t('profile_screen.signout.confirm'), style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['7xl'] + spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Tall hero ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={[blue[700], blue[600], blue[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + spacing.xl,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing['3xl'] + spacing.lg, // extra room for stats strip overlap
            alignItems: 'center',
          }}
        >
          {/* ─── Top-left account switcher ───────────────────────────────
              Smart pill. Three modes:
                · 1 account on device  → "Shree ▾" → tap = Add Employer
                · 2 accounts (typical) → "↺ Acme Corp 🏢" → tap = QUICK
                  SWITCH (no sheet). Long-press still opens the sheet.
                · 3+ accounts          → "Shree ▾" → tap opens the sheet.
              Anchored absolutely so the centered avatar layout below it
              doesn't have to be reshaped. */}
          <AccountSwitcherPill
            variant="onDark"
            style={{
              position: 'absolute',
              top: insets.top + spacing.sm,
              left: spacing.lg,
            }}
            onAddAccount={() =>
              navigation.navigate('AddAccountSignup', { role: 'employer' })
            }
            onOpenSheet={() => setSwitcherVisible(true)}
          />

          {/* Top-right language toggle — mirrors the account switcher
              pill on the left. `onDark` so the globe button reads on the
              blue gradient hero. */}
          <View
            style={{
              position: 'absolute',
              top: insets.top + spacing.sm,
              right: spacing.lg,
            }}
          >
            <LanguageToggle variant="onDark" />
          </View>

          {/* Avatar with halo glow + camera affordance */}
          <Pressable
            onPress={onChangePhoto}
            disabled={photoMutation.isPending}
            style={{ marginBottom: spacing.lg }}
          >
            <View
              style={{
                borderRadius: 999,
                padding: 6,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.45)',
              }}
            >
              <View
                style={{
                  borderRadius: 999,
                  padding: 3,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                }}
              >
                <Avatar name={user.name} photoUrl={user.photoUrl} size={110} />
              </View>

              {/* Camera dot — bottom-right */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.06)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.18,
                  shadowRadius: 4,
                }}
              >
                <Feather name="camera" size={16} color={theme.brand.accent} />
              </View>
            </View>
          </Pressable>

          <Text
            style={{
              fontSize: 26,
              lineHeight: 30,
              fontWeight: '700',
              color: '#FFFFFF',
              letterSpacing: -0.3,
              marginBottom: spacing.xs,
            }}
            numberOfLines={1}
          >
            {user.name}
          </Text>

          {/* Verified + rating row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {user.isVerified && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: radii.pill,
                  backgroundColor: 'rgba(16, 185, 129, 0.95)',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                  {t('profile_screen.verified_worker')}
                </Text>
              </View>
            )}
            {user.rating && user.rating.count > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: radii.pill,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                }}
              >
                <Feather name="star" size={13} color="#FCD34D" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                  {user.rating.avg.toFixed(1)}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {t('profile_screen.rated_count', { count: user.rating.count })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Member-since — small trust signal */}
          <Text
            style={{
              color: 'rgba(255,255,255,0.62)',
              fontSize: 11,
              marginTop: spacing.sm,
              fontWeight: '500',
              letterSpacing: 0.3,
            }}
          >
            {t('profile_screen.member_since', { when: formatMemberSince(user.createdAt) })}
          </Text>

          {/* Profile completion bar */}
          <View style={{ width: '100%', marginTop: spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 0.4,
                }}
              >
                {t('profile_screen.profile_completion_label')}
              </Text>
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                {profileCompletion}%
              </Text>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: 'rgba(255,255,255,0.18)',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${profileCompletion}%`,
                  height: '100%',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 3,
                }}
              />
            </View>
          </View>

          {photoError && (
            <Text
              style={{
                color: '#FECACA',
                fontSize: 12,
                marginTop: spacing.sm,
                textAlign: 'center',
              }}
            >
              {photoError}
            </Text>
          )}
        </LinearGradient>

        {/* ─── One-photo profile banner ──────────────────────────────
            For seekers whose profile is still <50% complete, surface
            the photo-to-profile flow as the highest-leverage next
            step. We hide it once the profile is healthy so the
            full-completion case stays clean.
        ──────────────────────────────────────────────────────────── */}
        {profileCompletion < 50 && (
          <View
            style={{
              paddingHorizontal: spacing.xl,
              marginTop: -spacing['2xl'],
              marginBottom: spacing.md,
            }}
          >
            <Pressable
              onPress={() => {
                haptic('selection');
                navigation.navigate('ProfileFromPhoto');
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: theme.brand.accent,
                opacity: pressed ? 0.9 : 1,
                shadowColor: theme.brand.accent,
                shadowOpacity: 0.25,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 4,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(255,253,247,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="camera" size={22} color="#FFFDF7" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFDF7' }}>
                  {t('streak_strip.banner_title')}
                </Text>
                <Text variant="footnote" style={{ color: 'rgba(255,253,247,0.85)' }}>
                  {t('streak_strip.banner_body')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFDF7' }}>
                {t('streak_strip.banner_cta')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ─── Pending ratings banner ────────────────────────────────
            Shows above the stats strip whenever the seeker has hired
            applications they haven't rated yet. Tapping the banner
            either jumps straight to the leave-rating flow (if there's
            exactly one) or routes to My Applications where each row
            has its own rate prompt.
        ──────────────────────────────────────────────────────────── */}
        {pendingRatingsCount > 0 && (
          <View
            style={{
              paddingHorizontal: spacing.xl,
              marginTop: -spacing['2xl'],
              marginBottom: spacing.md,
            }}
          >
            <Pressable
              onPress={() => {
                haptic('selection');
                if (pendingRatingsCount === 1 && unrated[0]) {
                  navigation.navigate('LeaveRating', {
                    applicationId: unrated[0].applicationId,
                    revieweeName: unrated[0].otherPartyName,
                    jobTitle: unrated[0].jobTitle,
                  });
                } else {
                  navigation.navigate('MyApplications');
                }
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radii.lg,
                backgroundColor: theme.bg.surface,
                borderWidth: 0.5,
                borderColor: theme.brand.accentBorder,
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 14,
                elevation: 3,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: theme.brand.accentSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="star" size={18} color={theme.brand.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: theme.text.primary,
                  }}
                >
                  {pendingRatingsCount === 1
                    ? t('profile_screen.ratings_banner.title_one')
                    : t('profile_screen.ratings_banner.title_other', { count: pendingRatingsCount })}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text.secondary,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {pendingRatingsCount === 1 && unrated[0]
                    ? t('profile_screen.ratings_banner.body_one', {
                        name: unrated[0].otherPartyName,
                        job: unrated[0].jobTitle,
                      })
                    : t('profile_screen.ratings_banner.body_other')}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.brand.accent,
                }}
              >
                {t('profile_screen.ratings_banner.cta')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ─── Streak strip ───────────────────────────────────────────
            Three small chips showing apply / course / shift streaks.
            Active streaks (current > 0 and within the last day) get a
            flame icon; the rest stay calm. Tap → MyApplications,
            Courses, or MyJobs respectively. We hide the whole strip
            for users who have no streaks yet — empty state would just
            be visual noise on a fresh profile. */}
        {user && (user.streaks?.apply?.totalDays > 0 ||
          user.streaks?.course?.totalDays > 0 ||
          user.streaks?.shift?.totalDays > 0) && (
          <View
            style={{
              paddingHorizontal: spacing.xl,
              marginTop: spacing.md,
              marginBottom: spacing.md,
              flexDirection: 'row',
              gap: spacing.sm,
            }}
          >
            <StreakChip
              label={t('streak_strip.apply')}
              current={user.streaks?.apply?.current ?? 0}
              longest={user.streaks?.apply?.longest ?? 0}
              onPress={() => navigation.navigate('MyApplications')}
            />
            <StreakChip
              label={t('streak_strip.learn')}
              current={user.streaks?.course?.current ?? 0}
              longest={user.streaks?.course?.longest ?? 0}
              onPress={() => navigation.navigate('Courses')}
            />
            <StreakChip
              label={t('streak_strip.show_up')}
              current={user.streaks?.shift?.current ?? 0}
              longest={user.streaks?.shift?.longest ?? 0}
              onPress={() => navigation.navigate('MyApplications')}
            />
          </View>
        )}

        {/* ─── Stats strip ─────────────────────────────────────────────
            Only overlaps the hero with a negative top margin when NOTHING
            sits between it and the hero. The photo banner, the pending-
            ratings banner, and the streak strip each "claim" the pull-up
            slot when they render; if the stats strip also pulled up it
            would clip whichever element is above (this was eating the
            streak chips' caption row — "day" / "start today" — when any
            streak had activity). When something IS above, the stats strip
            stacks below it normally; the element above retains the
            visual link to the hero. */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            marginTop: hasOverlayAboveStats ? 0 : -spacing['2xl'],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              backgroundColor: theme.bg.surface,
              borderRadius: radii.lg,
              padding: spacing.md,
              borderWidth: 0.5,
              borderColor: theme.border.subtle,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.1,
              shadowRadius: 16,
              elevation: 4,
            }}
          >
            <StatTile
              label={t('profile_screen.stats.applications')}
              value={String(applicationsCount)}
              onPress={openApplications}
            />
            <Divider vertical color={theme.border.subtle} />
            <StatTile
              label={t('profile_screen.stats.saved_jobs')}
              value={String(savedCount)}
              onPress={openSavedJobs}
            />
            <Divider vertical color={theme.border.subtle} />
            {/* Rating, not a second completion % — the hero already
                shows completion, so this tile carries a distinct,
                motivating metric instead (see spec §7). */}
            <StatTile
              label={t('profile_screen.stats.rating')}
              value={
                user.rating && user.rating.count > 0
                  ? user.rating.avg.toFixed(1)
                  : '—'
              }
              onPress={() => {
                haptic('selection');
                navigation.navigate('Ratings');
              }}
            />
          </View>
        </View>

        {/* ─── Body sections ─────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.lg }}>
          {/* Expected salary */}
          <SectionLabel>{t('profile.sections.expected_salary')}</SectionLabel>
          <View
            style={{
              ...cardBase(theme),
              padding: spacing.lg,
              backgroundColor: theme.brand.accentSubtle,
              borderColor: theme.brand.accentBorder,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.text.secondary,
                    fontWeight: '600',
                    letterSpacing: 0.4,
                  }}
                >
                  {t('profile_screen.salary.eyebrow')}
                </Text>
                {user.expectedSalary ? (
                  <View style={{ marginTop: 4 }}>
                    <Text
                      style={{
                        fontSize: 34,
                        lineHeight: 38,
                        fontWeight: '700',
                        color: theme.brand.accent,
                        letterSpacing: -0.5,
                      }}
                    >
                      {formatSalary(user.expectedSalary)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.text.secondary,
                        marginTop: 2,
                        fontWeight: '500',
                      }}
                    >
                      {periodLabel(user.expectedSalary.period, t)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 6 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        color: theme.text.primary,
                        fontWeight: '600',
                      }}
                    >
                      {t('profile_screen.salary.empty_title')}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.text.secondary,
                        marginTop: 2,
                      }}
                    >
                      {t('profile_screen.salary.empty_subtitle')}
                    </Text>
                  </View>
                )}
              </View>
              {/* The blue fill sits on a static inner View — leaving
                  `backgroundColor` on the Pressable style function let RN
                  drop it on some builds, leaving white "Edit" text with no
                  visible button behind it. */}
              <Pressable
                onPress={openSalaryEdit}
                accessibilityRole="button"
                accessibilityLabel={t('profile_screen.edit_salary_a11y')}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <View
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: radii.pill,
                    backgroundColor: theme.brand.primary,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    {t('profile_screen.salary.edit')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Skills */}
          <SectionLabel>{t('profile.sections.skills')}</SectionLabel>
          <View style={{ ...cardBase(theme), padding: spacing.lg }}>
            {user.skills.length === 0 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
                  {t('profile_screen.skills_card.empty_title')}
                </Text>
                <Text style={{ fontSize: 13, color: theme.text.secondary }}>
                  {t('profile_screen.skills_card.empty_subtitle')}
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label={t('profile_screen.skills_card.empty_cta')}
                    variant="primary"
                    onPress={() => goEdit('skills')}
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {user.skills.map((s) => (
                    <View
                      key={s}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: radii.pill,
                        backgroundColor: theme.brand.accentSubtle,
                        borderWidth: 0.5,
                        borderColor: theme.brand.accentBorder,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: theme.brand.accent,
                        }}
                      >
                        {capitalize(s)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={() => goEdit('skills')}
                  hitSlop={6}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: theme.brand.accent,
                    }}
                  >
                    {t('profile_screen.skills_card.add_or_edit')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Completion meter — self-hides at 100% */}
          <ProfileCompletionMeter user={user ?? null} />

          <SectionLabel>CRAFT SHOWCASE</SectionLabel>
          <CraftShowcase
            title="Craft showcase"
            subtitle={
              user.workPhotos.length > 0
                ? 'Lead with proof, not promises. Employers can scan your best work in seconds.'
                : 'Add real work photos so your profile feels like a premium portfolio, not a plain listing.'
            }
            photos={user.workPhotos}
            skills={user.skills}
            emptyTitle="No craft showcase yet"
            emptyBody="Your best photos can do what a resume cannot: prove quality at a glance."
            emptyCtaLabel="Build it now"
            onEmptyPress={() => {
              haptic('selection');
              navigation.navigate('ResumeBuilder');
            }}
          />

          {/* Profile-views motivator — small banner above ACTIVITY */}
          <ProfileViewsBanner />

          {/* Skill suggestions — "Add cooking → +30% job matches" rail. */}
          <SkillSuggestionsRail onEdit={() => goEdit('skills')} />

          {/* Hire offers — permanent doorway to the hiring-requests inbox.
              That screen used to be reachable only from a push
              notification; this row guarantees it can always be found. */}
          <HiringRequestsRow />

          {/* Menu — collapsible groups. Replaces the old single 19-row
              "ACTIVITY" list; jobs / money / community actions moved to
              their own bottom-tab destinations. */}
          <CollapsibleGroup
            glyph="trending-up"
            iconColor="#7C3AED"
            tint="#DDD6FE"
            title={t('profile_groups.grow')}
            defaultOpen
          >
            <MenuRow
              icon="book-open"
              iconColor="#7C3AED"
              tint="#DDD6FE"
              label={t('profile.menu.training')}
              subtitle={t('profile.menu.training_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('Courses');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="check-square"
              iconColor="#D97706"
              tint="#FEF3C7"
              label={t('profile.menu.skill_tests')}
              subtitle={t('profile.menu.skill_tests_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('SkillTests');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="credit-card"
              iconColor="#0D9488"
              tint="#CCFBF1"
              label={t('skill_passport.title')}
              subtitle={t('skill_passport.tagline')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('SkillPassport');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="bar-chart-2"
              iconColor="#4F46E5"
              tint="#C7D2FE"
              label={t('career_path.title')}
              subtitle={t('career_path.tagline')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('CareerPath');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="message-circle"
              iconColor="#4F46E5"
              tint="#E0E7FF"
              label={t('profile_screen.menu_extra.interview_prep')}
              subtitle={t('profile_screen.menu_extra.interview_prep_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('InterviewPrep');
              }}
            />
          </CollapsibleGroup>

          {/* Find work buddies — surfaces the contacts-match invite flow
              and the trade-mentor finder. Both screens were previously
              orphaned (built + routed, but no entry point); this group
              is their home. */}
          <CollapsibleGroup
            glyph="users"
            iconColor="#059669"
            tint="#D1FAE5"
            title={t('profile_groups.connect')}
          >
            <MenuRow
              icon="user-plus"
              iconColor={theme.brand.primary}
              tint="#DBEAFE"
              label={t('profile_screen.menu_extra.find_friends')}
              subtitle={t('profile_screen.menu_extra.find_friends_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('FindFriends');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="users"
              iconColor="#D97706"
              tint="#FEF3C7"
              label={t('profile_screen.menu_extra.trade_buddies')}
              subtitle={t('profile_screen.menu_extra.trade_buddies_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('Mentors');
              }}
            />
          </CollapsibleGroup>

          <CollapsibleGroup
            glyph="shield"
            iconColor="#DC2626"
            tint="#FEE2E2"
            title={t('profile_groups.rights')}
          >
            <MenuRow
              icon="file-text"
              iconColor="#D97706"
              tint="#FDE68A"
              label={t('constitution.title')}
              subtitle={t('constitution.tagline')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('Constitution');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="file"
              iconColor="#16A34A"
              tint="#BBF7D0"
              label={t('payslip.title')}
              subtitle={t('payslip.tagline')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('PayslipExplainer');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="heart"
              iconColor="#DB2777"
              tint="#FBCFE8"
              label={t('women.menu_label')}
              subtitle={t('women.menu_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('WomenHub');
              }}
            />
          </CollapsibleGroup>

          <CollapsibleGroup
            glyph="settings"
            iconColor="#4F46E5"
            tint="#E0E7FF"
            title={t('profile_groups.account')}
          >
            <MenuRow
              icon="star"
              iconColor={theme.brand.primary}
              tint="#DBEAFE"
              label={t('tabs.my_job')}
              subtitle={t('profile.menu.my_job_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('MyJob');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="file-text"
              iconColor="#7C3AED"
              tint="#DDD6FE"
              label={user.workHistory?.length ? t('profile_screen.menu_extra.my_resume') : t('profile_screen.menu_extra.build_resume')}
              subtitle={
                user.workHistory?.length
                  ? t(
                      user.workHistory.length === 1
                        ? 'profile_screen.menu_extra.my_resume_subtitle_one'
                        : 'profile_screen.menu_extra.my_resume_subtitle_other',
                      { count: user.workHistory.length },
                    )
                  : t('profile_screen.menu_extra.build_resume_subtitle')
              }
              onPress={() => {
                haptic('selection');
                navigation.navigate(
                  user.workHistory?.length ? 'ResumePreview' : 'ResumeBuilder',
                );
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="video"
              iconColor="#D97706"
              tint="#FEF3C7"
              label={t('reels.menu_label')}
              subtitle={t('reels.menu_subtitle')}
              onPress={() => {
                haptic('selection');
                navigation.navigate('RecordReel');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="edit-2"
              iconColor="#4F46E5"
              tint="#E0E7FF"
              label={t('profile.menu.edit_profile')}
              subtitle={t('profile.menu.edit_profile_subtitle')}
              onPress={() => goEdit('basics')}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="download"
              iconColor="#DB2777"
              tint="#FCE7F3"
              label={t('profile.menu.downloads')}
              subtitle={t('profile.menu.downloads_subtitle')}
              onPress={openDownloads}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="settings"
              iconColor="#475569"
              tint="#F1F5F9"
              label={t('profile.menu.settings')}
              subtitle={t('profile.menu.settings_subtitle')}
              onPress={openSettings}
            />
          </CollapsibleGroup>

          {/* Sign out */}
          <Pressable
            onPress={confirmSignOut}
            style={({ pressed }) => ({
              marginTop: spacing.md,
              padding: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: 'rgba(215, 85, 85, 0.45)',
              alignItems: 'center',
              backgroundColor: pressed ? 'rgba(215, 85, 85, 0.10)' : 'transparent',
            })}
          >
            <Text
              style={{ fontSize: 15, fontWeight: '600', color: theme.status.danger }}
            >
              {t('profile_screen.signout.button')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Account switcher bottom sheet — driven by the top-left pill. */}
      <AccountSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        onAddEmployer={onAddEmployerFromSheet}
      />
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/**
 * "N employers viewed your profile this week" — a motivation banner that
 * surfaces above the menu. Hidden entirely when nobody has viewed yet,
 * so an empty banner doesn't demoralise. When views > 0 we render a
 * warm gradient-ish card with the count + a hint line.
 *
 * Counter is collapsed per (viewer, day) on the backend, so a single
 * employer hammering refresh shows as one view, not ten.
 */
function ProfileViewsBanner() {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['profile-views', 'me'],
    queryFn: () => profileViewsApi.summarize(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
  });
  const n = query.data?.viewersLast7Days ?? 0;
  if (!query.data || n === 0) return null;
  const subtitle =
    n >= 5
      ? t('profile_screen.views_banner.subtitle_engaged')
      : t('profile_screen.views_banner.subtitle_add_more');
  return (
    <View
      style={{
        marginTop: spacing.lg,
        borderRadius: 16,
        padding: spacing.lg,
        backgroundColor: '#EFF6FF',
        borderWidth: 0.5,
        borderColor: '#BFDBFE',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#DBEAFE',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="eye" size={20} color={theme.brand.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E3A8A' }}>
          {t(
            n === 1
              ? 'profile_screen.views_banner.title_one'
              : 'profile_screen.views_banner.title_other',
            { n },
          )}
        </Text>
        <Text style={{ fontSize: 12, color: '#1E40AF', marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/**
 * Horizontal rail of "Add X → +N% matches" cards driven off the seeker's
 * resume + nearby job demand. Hidden when the engine has nothing useful
 * to suggest (empty network, no skills set, or no gap data).
 *
 * Tapping a suggestion deep-links into the skills editor with the
 * suggested skill pre-selected (best-effort — the editor handles the
 * fallback if the param isn't recognised).
 */
function SkillSuggestionsRail({ onEdit }: { onEdit: () => void }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['skill-suggestions', 'me'],
    queryFn: () => skillSuggestionsApi.list(),
    staleTime: 30 * 60 * 1000,
  });
  const suggestions = query.data?.suggestions ?? [];
  if (suggestions.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionLabel>{t('profile.sections.skills_gap')}</SectionLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {suggestions.map((s) => (
          <Pressable
            key={s.skill}
            onPress={() => {
              haptic('selection');
              onEdit();
            }}
            style={({ pressed }) => ({
              padding: spacing.md,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: '#A7F3D0',
              backgroundColor: '#ECFDF5',
              width: 200,
              opacity: pressed ? 0.85 : 1,
              gap: 4,
            })}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: '#047857' }}>
              {t('profile_screen.suggestions.eyebrow', { n: s.upliftPercent })}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#064E3B' }}>
              {prettifySkill(s.skill)}
            </Text>
            <Text style={{ fontSize: 12, color: '#065F46' }}>
              {t(
                s.jobsNeedingIt === 1
                  ? 'profile_screen.suggestions.jobs_need_one'
                  : 'profile_screen.suggestions.jobs_need_other',
                { count: s.jobsNeedingIt },
              )}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.brand.accent, marginTop: 4 }}>
              {t('profile_screen.suggestions.add_to_skills')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * HiringRequestsRow — a permanent, always-visible doorway to the worker's
 * hire-offer inbox (the HiringRequests screen). That screen was
 * previously reachable only from a push notification, so a worker who
 * dismissed the notification lost their offers; this row fixes that.
 *
 * A count badge appears when offers are still pending a reply. The
 * query shares its cache key with the Jobs-tab banner, so opening
 * either screen warms both.
 */
function HiringRequestsRow() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['hiringRequests', 'received'],
    queryFn: () => hiringRequestsApi.received(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const pending = (query.data?.requests ?? []).filter(
    (r) => r.status === 'pending',
  ).length;
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        navigation.navigate('HiringRequests');
      }}
      accessibilityRole="button"
      accessibilityLabel={t('profile_screen.menu_extra.hiring_requests')}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => ({ ...cardBase(theme), opacity: pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md + 2,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: '#DBEAFE',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <Feather name="mail" size={22} color={theme.brand.primary} />
        </View>
        <View style={{ flex: 1, paddingRight: spacing.sm }}>
          <Text
            style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
            numberOfLines={1}
          >
            {t('profile_screen.menu_extra.hiring_requests')}
          </Text>
          <Text
            style={{ fontSize: 12, color: theme.text.tertiary, marginTop: 2 }}
            numberOfLines={1}
          >
            {t('profile_screen.menu_extra.hiring_requests_subtitle')}
          </Text>
        </View>
        {pending > 0 ? (
          <View
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              paddingHorizontal: 7,
              backgroundColor: theme.brand.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
              {pending}
            </Text>
          </View>
        ) : null}
        <Feather name="chevron-right" size={20} color={theme.text.tertiary} />
      </View>
    </Pressable>
  );
}

/**
 * StreakChip — one of three tiles on the Profile streak strip.
 *
 * The chip lights up with a flame icon and brand-hero color when the
 * current streak is active (> 0). Otherwise it shows the longest
 * streak as a softer hint ("Best 5") to motivate restarts. Tap routes
 * to the relevant activity surface so the worker can take action.
 */
function StreakChip({
  label,
  current,
  longest,
  onPress,
}: {
  label: string;
  current: number;
  longest: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
  const active = current > 0;
  const unit = (n: number) =>
    n === 1 ? t('streak_strip.unit_day') : t('streak_strip.unit_days');
  const a11yLabel = active
    ? t('streak_strip.a11y_active', { label, n: current, unit: unit(current) })
    : longest > 0
      ? t('streak_strip.a11y_best', { label, n: longest, unit: unit(longest) })
      : t('streak_strip.a11y_start', { label });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => ({
        flex: 1,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: active ? theme.brand.primaryBorder : theme.border.default,
        backgroundColor: active ? theme.brand.primarySubtle : theme.bg.surface,
        opacity: pressed ? 0.85 : 1,
        gap: 4,
        alignItems: 'flex-start',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {active && <Feather name="zap" size={14} color={theme.brand.accent} />}
        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: active ? theme.brand.primary : theme.text.primary,
          }}
        >
          {active ? current : longest > 0 ? longest : 0}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.6,
          color: theme.text.secondary,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: theme.text.tertiary,
          fontWeight: '500',
        }}
      >
        {active
          ? unit(current)
          : longest > 0
            ? t('streak_strip.best', { n: longest })
            : t('streak_strip.start_today')}
      </Text>
    </Pressable>
  );
}

/**
 * CollapsibleGroup — a titled, expandable card for the Profile menu.
 *
 * Replaces the old single 19-row "ACTIVITY" list. Each group shows a
 * tinted icon + title + chevron; tapping the header expands or collapses
 * its rows. `defaultOpen` controls the initial state — the first group
 * opens on mount, the rest stay closed, so the screen lands calm and
 * the worker scans three headers instead of nineteen rows.
 */
function CollapsibleGroup({
  glyph,
  iconColor,
  tint,
  title,
  defaultOpen,
  children,
}: {
  glyph: FeatherIconName;
  iconColor: string;
  tint: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <View style={cardBase(theme)}>
      <Pressable
        onPress={() => {
          haptic('selection');
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md + 2,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: tint,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: spacing.md,
            }}
          >
            <Feather name={glyph} size={20} color={iconColor} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: '700',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Feather
            name={open ? 'chevron-down' : 'chevron-right'}
            size={18}
            color={theme.text.tertiary}
          />
        </View>
      </Pressable>
      {open ? (
        <View>
          <View style={{ height: 0.5, backgroundColor: theme.border.subtle }} />
          {children}
        </View>
      ) : null}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '600',
        letterSpacing: 1.6,
        color: theme.text.tertiary,
        marginTop: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

function StatTile({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.xs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 20,
          lineHeight: 24,
          fontWeight: '700',
          color: theme.brand.accent,
          letterSpacing: -0.3,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: theme.text.secondary,
          fontWeight: '500',
          marginTop: 2,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MenuRow({
  icon,
  iconColor,
  tint,
  label,
  subtitle,
  onPress,
}: {
  icon: FeatherIconName;
  iconColor: string;
  tint: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {/*
        IMPORTANT: keep the layout `flexDirection: 'row'` on a real <View>
        wrapper rather than on the Pressable's function-style. RN treats
        the Pressable's style function differently across versions and on
        some builds it was collapsing the children into a column —
        causing the chevron to wrap below the subtitle line.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md + 2,
        }}
      >
        {/* Icon tile — fixed-width column, doesn't flex */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <Feather name={icon} size={20} color={iconColor} />
        </View>

        {/* Label + optional subtitle — flexes to fill */}
        <View style={{ flex: 1, paddingRight: spacing.sm }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: theme.text.primary,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          {subtitle ? (
            <Text
              style={{
                fontSize: 12,
                color: theme.text.tertiary,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Chevron — fixed-width column at the right, vertically centered */}
        <View
          style={{
            width: 20,
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <Feather name="chevron-right" size={18} color={theme.text.tertiary} />
        </View>
      </View>
    </Pressable>
  );
}

function Divider({ color, vertical }: { color: string; vertical?: boolean }) {
  if (vertical) {
    return <View style={{ width: 0.5, backgroundColor: color, alignSelf: 'stretch' }} />;
  }
  return (
    <View
      style={{
        height: 0.5,
        backgroundColor: color,
        marginLeft: spacing.lg + 44 + spacing.md,
      }}
    />
  );
}

function cardBase(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    backgroundColor: theme.bg.surface,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  } as const;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatSalary(s: NonNullable<PublicUser['expectedSalary']>): string {
  const symbol = s.currency === 'INR' ? '₹' : s.currency === 'USD' ? '$' : '';
  // 'en-IN' for lakh/crore grouping regardless of UI language.
  const rupees = (s.amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${symbol}${rupees}`;
}

function periodLabel(
  period: NonNullable<PublicUser['expectedSalary']>['period'],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t(`profile_screen.salary.period_${period}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMemberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}
