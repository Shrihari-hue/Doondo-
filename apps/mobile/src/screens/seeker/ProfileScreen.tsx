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
 *   5. Menu — each row gets a colored icon tile + secondary count line.
 *      Card splits visually into two groups: Activity / Account.
 *
 *   6. Sign out — its own danger-tinted button.
 *
 * Every count and field is real — no fake numbers. Empty values show
 * tasteful CTAs (e.g. "Add what you'd like to earn") instead of zeros.
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
import { jobsApi } from '@/api/jobs.api';
import { applicationsApi } from '@/api/applications.api';
import { referralsApi } from '@/api/referrals.api';
import { profileViewsApi } from '@/api/profileViews.api';
import { skillSuggestionsApi } from '@/api/skillSuggestions.api';
import { useTranslate } from '@/i18n/useTranslate';
import { ProfileCompletionMeter } from './ProfileCompletionMeter';
import { useUnratedApplications } from '@/hooks/useRatings';
import { pickProfilePhoto } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicUser } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [photoError, setPhotoError] = useState<string | null>(null);

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
  const profileCompletion = user?.profileCompletion ?? 0;

  // Pending ratings — surfaces a "Rate now" banner above the stats
  // strip when the seeker has hires they haven't rated yet. Closes the
  // last gap in the rating loop.
  const unratedQuery = useUnratedApplications();
  const unrated = unratedQuery.data?.unrated ?? [];
  const pendingRatingsCount = unrated.length;

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => meApi.updateProfile({ photoUrl: dataUrl }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
      setPhotoError(null);
    },
    onError: (err) => {
      haptic('error');
      setPhotoError(err instanceof Error ? err.message : 'Failed to update photo');
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
          : 'Could not prepare that photo — try a different image.',
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

  function openRatings() {
    haptic('selection');
    navigation.navigate('Ratings');
  }
  function openApplications() {
    haptic('selection');
    navigation.navigate('MyApplications');
  }
  function openSavedJobs() {
    haptic('selection');
    navigation.navigate('MyJobs');
  }
  function openEarnings() {
    haptic('selection');
    navigation.navigate('MyEarnings');
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
    Alert.alert('Sign out?', "You'll need to sign in again to use Doondo.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
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
                <Text style={{ fontSize: 16 }}>📷</Text>
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
                  ✓ Verified Worker
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
                <Text style={{ color: '#FCD34D', fontSize: 13, lineHeight: 16 }}>★</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                  {user.rating.avg.toFixed(1)}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  · {user.rating.count} rated
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
            Member since {formatMemberSince(user.createdAt)}
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
                PROFILE COMPLETION
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
                borderColor: theme.brand.heroBorder,
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
                  backgroundColor: theme.brand.heroSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 18 }}>⭐</Text>
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
                    ? 'Rate your last employer'
                    : `${pendingRatingsCount} ratings pending`}
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
                    ? `${unrated[0].otherPartyName} · ${unrated[0].jobTitle}`
                    : 'Help other workers by leaving a review.'}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: theme.brand.hero,
                }}
              >
                Rate ›
              </Text>
            </Pressable>
          </View>
        )}

        {/* ─── Stats strip ─────────────────────────────────────────────
            Only overlaps the hero with a negative top margin when the
            pending-ratings banner ISN'T showing. When the banner is
            there, IT's the element that overlaps; the stats strip then
            stacks below it normally. */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            marginTop: pendingRatingsCount > 0 ? 0 : -spacing['2xl'],
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
              label="Applications"
              value={String(applicationsCount)}
              onPress={openApplications}
            />
            <Divider vertical color={theme.border.subtle} />
            <StatTile
              label="Saved jobs"
              value={String(savedCount)}
              onPress={openSavedJobs}
            />
            <Divider vertical color={theme.border.subtle} />
            <StatTile
              label="Profile"
              value={`${profileCompletion}%`}
              onPress={() => goEdit('basics')}
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
              backgroundColor: theme.brand.heroSubtle,
              borderColor: theme.brand.heroBorder,
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
                  You're looking for
                </Text>
                {user.expectedSalary ? (
                  <View style={{ marginTop: 4 }}>
                    <Text
                      style={{
                        fontSize: 34,
                        lineHeight: 38,
                        fontWeight: '700',
                        color: theme.brand.hero,
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
                      {periodLabel(user.expectedSalary.period)}
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
                      Set your expected salary
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.text.secondary,
                        marginTop: 2,
                      }}
                    >
                      Helps employers match the right roles
                    </Text>
                  </View>
                )}
              </View>
              {/* Hardcoded blue/white so the Edit pen never disappears
                  on a stale build — same pattern used on the Apply CTA. */}
              <Pressable
                onPress={openSalaryEdit}
                accessibilityRole="button"
                accessibilityLabel="Edit expected salary"
                style={({ pressed }) => ({
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: radii.pill,
                  backgroundColor: '#2563EB',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: '700',
                  }}
                >
                  Edit
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Skills */}
          <SectionLabel>{t('profile.sections.skills')}</SectionLabel>
          <View style={{ ...cardBase(theme), padding: spacing.lg }}>
            {user.skills.length === 0 ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
                  Add your skills
                </Text>
                <Text style={{ fontSize: 13, color: theme.text.secondary }}>
                  Employers find you faster when you list what you're good at.
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label="Add skills"
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
                        backgroundColor: theme.brand.heroSubtle,
                        borderWidth: 0.5,
                        borderColor: theme.brand.heroBorder,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: theme.brand.hero,
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
                      color: theme.brand.hero,
                    }}
                  >
                    + Add or edit skills
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Completion meter — self-hides at 100% */}
          <ProfileCompletionMeter user={user ?? null} />

          {/* Profile-views motivator — small banner above ACTIVITY */}
          <ProfileViewsBanner />

          {/* Skill suggestions — "Add cooking → +30% job matches" rail. */}
          <SkillSuggestionsRail onEdit={() => goEdit('skills')} />

          {/* Activity menu */}
          <SectionLabel>{t('profile.sections.activity')}</SectionLabel>
          <View style={cardBase(theme)}>
            <MenuRow
              icon="📋"
              tint="#DBEAFE"
              label="My Applications"
              subtitle={
                applicationsCount === 0
                  ? 'No applications yet'
                  : `${applicationsCount} application${applicationsCount === 1 ? '' : 's'}`
              }
              onPress={openApplications}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="📂"
              tint="#FEF3C7"
              label="My Jobs"
              subtitle={
                savedCount === 0
                  ? 'No saved jobs yet'
                  : `${savedCount} saved`
              }
              onPress={openSavedJobs}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="🔔"
              tint="#FEE2E2"
              label="Job Alerts"
              subtitle="Get notified when matching jobs are posted"
              onPress={() => {
                haptic('selection');
                navigation.navigate('JobAlerts');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="🪙"
              tint="#FDE68A"
              label="Cash advance"
              subtitle="Borrow against confirmed upcoming work (up to ₹5,000)"
              onPress={() => {
                haptic('selection');
                navigation.navigate('Advance');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="🛡"
              tint="#DBEAFE"
              label="Worker insurance"
              subtitle="₹49/month accident cover · opt-in any time"
              onPress={() => {
                haptic('selection');
                navigation.navigate('Insurance');
              }}
            />
            <Divider color={theme.border.subtle} />
            <ReferralMenuRow />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="📚"
              tint="#DDD6FE"
              label="Training & courses"
              subtitle="Earn badges that show on your resume"
              onPress={() => {
                haptic('selection');
                navigation.navigate('Courses');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="🧠"
              tint="#FEF3C7"
              label="Skill tests"
              subtitle="Prove your trade — 5 questions, 4 to pass"
              onPress={() => {
                haptic('selection');
                navigation.navigate('SkillTests');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="💬"
              tint="#E0E7FF"
              label="Interview prep"
              subtitle="Common questions, what to bring, how to talk pay"
              onPress={() => {
                haptic('selection');
                navigation.navigate('InterviewPrep');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="👥"
              tint="#FCE7F3"
              label="Find friends on Doondo"
              subtitle="Match your contacts · invite friends, earn ₹100 per hire"
              onPress={() => {
                haptic('selection');
                navigation.navigate('FindFriends');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="🤝"
              tint="#DBEAFE"
              label="Trade buddies"
              subtitle="Find a mentor in your trade — or mentor others"
              onPress={() => {
                haptic('selection');
                navigation.navigate('Mentors');
              }}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="⭐"
              tint="#FDE68A"
              label="Ratings & Reviews"
              subtitle={
                user.rating && user.rating.count > 0
                  ? `${user.rating.avg.toFixed(1)} from ${user.rating.count} ${
                      user.rating.count === 1 ? 'rating' : 'ratings'
                    }`
                  : 'No ratings yet'
              }
              onPress={openRatings}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="💰"
              tint="#D1FAE5"
              label="My Earnings"
              subtitle="Available with wallet"
              onPress={openEarnings}
            />
          </View>

          {/* Resume menu */}
          <SectionLabel>{t('profile.sections.resume')}</SectionLabel>
          <View style={cardBase(theme)}>
            <MenuRow
              icon="📝"
              tint="#DDD6FE"
              label={user.workHistory?.length ? 'My resume' : 'Build my resume'}
              subtitle={
                user.workHistory?.length
                  ? `${user.workHistory.length} job${user.workHistory.length === 1 ? '' : 's'} · tap to view or share`
                  : 'Walk through your last 1–5 jobs'
              }
              onPress={() => {
                haptic('selection');
                navigation.navigate(
                  user.workHistory?.length ? 'ResumePreview' : 'ResumeBuilder',
                );
              }}
            />
          </View>

          {/* Account menu */}
          <SectionLabel>{t('profile.sections.account')}</SectionLabel>
          <View style={cardBase(theme)}>
            <MenuRow
              icon="✏️"
              tint="#E0E7FF"
              label="Edit Profile Details"
              subtitle="Name, bio, experience, availability"
              onPress={() => goEdit('basics')}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="📥"
              tint="#FCE7F3"
              label="Download Center"
              subtitle="Saved posts and offline content"
              onPress={openDownloads}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="⚙️"
              tint="#F1F5F9"
              label="Settings"
              subtitle="Language, notifications, theme"
              onPress={openSettings}
            />
          </View>

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
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
      ? "You're getting noticed — keep your profile fresh to convert views into hires."
      : 'Add work photos or a skill test to stand out.';
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
        <Text style={{ fontSize: 20 }}>👀</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E3A8A' }}>
          {n} {n === 1 ? 'employer' : 'employers'} viewed your profile this week
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
              ADD SKILL · +{s.upliftPercent}%
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#064E3B' }}>
              {prettifySkill(s.skill)}
            </Text>
            <Text style={{ fontSize: 12, color: '#065F46' }}>
              {s.jobsNeedingIt} {s.jobsNeedingIt === 1 ? 'job needs it' : 'jobs need it'} near you
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.brand.hero, marginTop: 4 }}>
              Add to my skills →
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * MenuRow variant for referral credits. Queries the seeker's referral
 * summary so the subtitle shows actual rupees earned ("Referral credit:
 * ₹300 — 3 hires").
 */
function ReferralMenuRow() {
  const navigation = useNavigation<Nav>();
  const query = useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: () => referralsApi.myReferrals(),
    staleTime: 60_000,
  });
  const summary = query.data?.summary;
  const subtitle =
    summary && summary.totalBonusPaise > 0
      ? `₹${Math.round(summary.totalBonusPaise / 100).toLocaleString()} earned · ${summary.hired} hired`
      : 'Share jobs · earn ₹100 per hire';
  return (
    <MenuRow
      icon="💸"
      tint="#FEF3C7"
      label="Referral credit"
      subtitle={subtitle}
      onPress={() => {
        haptic('selection');
        navigation.navigate('MyEarnings');
      }}
    />
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
          color: theme.brand.hero,
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
  tint,
  label,
  subtitle,
  onPress,
}: {
  icon: string;
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
          <Text style={{ fontSize: 22 }}>{icon}</Text>
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
          <Text
            style={{
              fontSize: 22,
              color: theme.text.tertiary,
              lineHeight: 24,
            }}
            allowFontScaling={false}
          >
            ›
          </Text>
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
  const rupees = (s.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${symbol}${rupees}`;
}

function periodLabel(period: NonNullable<PublicUser['expectedSalary']>['period']): string {
  return ({
    hour: 'Per hour',
    day: 'Per day',
    week: 'Per week',
    month: 'Per month',
    fixed: 'Fixed total',
  } as const)[period];
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
