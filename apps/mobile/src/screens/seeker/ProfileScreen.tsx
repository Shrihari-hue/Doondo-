/**
 * ProfileScreen — the seeker's identity hub.
 *
 * Phase 2 v2:
 *   - 3D completion orb in the top banner (Profile X% complete)
 *   - Section cards are pressable; tap → EditProfile modal for that section
 *   - Sign out at the bottom
 *
 * The orb's color and ring fill follow the completion percent, so the
 * card visibly progresses as you fill in your profile.
 */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Card, Pill, Button, Avatar, ThemeToggleCard } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
import { pickProfilePhoto } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import { ProfileCompletionOrb } from './ProfileCompletionOrb';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    const picked = await pickProfilePhoto();
    if (!picked) return;
    photoMutation.mutate(picked.dataUrl);
  }

  if (!user) return null;

  const goEdit = (
    section: 'basics' | 'location' | 'skills' | 'preferences' | 'resume',
  ) => {
    haptic('selection');
    navigation.navigate('EditProfile', { section });
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing['2xl'],
        }}
      >
        {/* Identity header with tappable avatar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
            <Avatar
              name={user.name}
              photoUrl={user.photoUrl}
              size={84}
              premium={user.isVerified}
            />
          </Pressable>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              SEEKER
            </Text>
            <Text variant="display" weight="medium" display>
              {user.name}
            </Text>
            <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
              <Text variant="footnote" tone="hero">
                {photoMutation.isPending
                  ? 'Updating photo…'
                  : user.photoUrl
                    ? 'Change photo'
                    : 'Add photo'}
              </Text>
            </Pressable>
            {photoError && (
              <Text variant="footnote" tone="secondary">
                {photoError}
              </Text>
            )}
          </View>
        </View>
        <Text variant="footnote" tone="secondary">
          {user.email}
        </Text>

        {/* Completion banner — orb + percent + nudge */}
        <Card premium={user.profileCompletion === 100}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
            }}
          >
            <ProfileCompletionOrb completion={user.profileCompletion} size={110} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
                PROFILE
              </Text>
              <Text variant="display" weight="medium" display>
                {user.profileCompletion}%
              </Text>
              <Text variant="footnote" tone="secondary">
                {user.profileCompletion < 100
                  ? 'Complete your profile to get matched faster.'
                  : 'Your profile is complete.'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Basics */}
        <SectionCard
          label="BASICS"
          title={user.bio ? truncate(user.bio, 80) : 'Add a short bio'}
          subtitle={
            user.experienceYears != null
              ? `${user.experienceYears} year${user.experienceYears === 1 ? '' : 's'} experience`
              : 'Tap to add experience'
          }
          onPress={() => goEdit('basics')}
        />

        {/* Location */}
        <SectionCard
          label="LOCATION"
          title={
            user.location?.city
              ? `${user.location.area ? user.location.area + ', ' : ''}${user.location.city}`
              : 'Set your area'
          }
          subtitle={
            user.location?.coordinates ? 'GPS set' : 'So jobs near you show up'
          }
          onPress={() => goEdit('location')}
        />

        {/* Skills */}
        <Pressable onPress={() => goEdit('skills')}>
          <Card>
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text
                  variant="footnote"
                  weight="medium"
                  tone="secondary"
                  style={{ letterSpacing: 1.0 }}
                >
                  SKILLS
                </Text>
                <Text variant="footnote" tone="hero">
                  Edit
                </Text>
              </View>
              {user.skills.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {user.skills.map((s) => (
                    <Pill key={s} label={s} tone="neutral" />
                  ))}
                </View>
              ) : (
                <Text variant="footnote" tone="tertiary">
                  Add skills so employers find you.
                </Text>
              )}
            </View>
          </Card>
        </Pressable>

        {/* Preferences */}
        <SectionCard
          label="WORK PREFERENCES"
          title={
            user.availability
              ? availabilityLabel(user.availability)
              : 'Set your availability'
          }
          subtitle={
            buildPreferencesSummary(user)
          }
          onPress={() => goEdit('preferences')}
        />

        {/* Resume — PDF/DOCX with replace + remove */}
        <SectionCard
          label="RESUME"
          title={
            user.resumeFilename
              ? user.resumeFilename
              : 'Upload your resume'
          }
          subtitle={
            user.resumeUploadedAt
              ? 'Tap to replace or remove'
              : 'PDF or DOCX, up to 900KB. Boosts profile completion.'
          }
          onPress={() => goEdit('resume')}
        />

        {/* Verification — tap to enter the OTP+selfie flow.
            Reads `verificationStatus` so the copy + pill change with state. */}
        <Pressable
          onPress={() => {
            if (user.isVerified) return;
            haptic('selection');
            navigation.navigate('Verification');
          }}
        >
          <Card premium={user.isVerified}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ gap: 2, flex: 1 }}>
                <Text variant="bodyLarge" weight="medium">
                  Verification
                </Text>
                <Text variant="footnote" tone="secondary">
                  {verificationCopy(user)}
                </Text>
              </View>
              {user.isVerified ? (
                <Pill label="Verified" tone="premium" leading="★" />
              ) : user.verificationStatus === 'pending' ? (
                <Pill label="Continue" tone="hero" />
              ) : (
                <Pill label="Verify" tone="hero" />
              )}
            </View>
          </Card>
        </Pressable>

        <ThemeToggleCard />

        <Button label="Sign out" variant="secondary" onPress={() => void logout()} />
      </ScrollView>
    </Screen>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionCard({
  label,
  title,
  subtitle,
  onPress,
}: {
  label: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text
              variant="footnote"
              weight="medium"
              tone="secondary"
              style={{ letterSpacing: 1.0 }}
            >
              {label}
            </Text>
            <Text variant="footnote" tone="hero">
              Edit
            </Text>
          </View>
          <Text variant="bodyLarge" weight="medium">
            {title}
          </Text>
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function availabilityLabel(a: string): string {
  return (
    {
      immediate: 'Available immediately',
      within_1_week: 'Within 1 week',
      within_1_month: 'Within 1 month',
      flexible: 'Flexible',
    } as Record<string, string>
  )[a] ?? a;
}

function typeLabel(t: string): string {
  return (
    {
      full_time: 'Full-time',
      part_time: 'Part-time',
      gig: 'Gig',
      shift: 'Shift',
      contract: 'Contract',
    } as Record<string, string>
  )[t] ?? t;
}

function buildPreferencesSummary(user: {
  preferredJobTypes: string[];
  workType: string | null;
  teamSize: number | null;
}): string {
  const parts: string[] = [];

  if (user.workType === 'team') {
    parts.push(
      user.teamSize != null ? `Team of ${user.teamSize}` : 'Applying as a team',
    );
  } else if (user.workType === 'solo') {
    parts.push('Applying solo');
  }

  if (user.preferredJobTypes.length > 0) {
    parts.push(user.preferredJobTypes.map(typeLabel).join(' · '));
  }

  return parts.join(' • ') || 'Pick the types of work you want';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function verificationCopy(user: {
  isVerified: boolean;
  verificationStatus: string;
  phoneVerified: boolean;
}): string {
  if (user.isVerified) return 'Your profile carries the gold ★ everywhere.';
  if (user.verificationStatus === 'pending' && user.phoneVerified) {
    return 'Phone confirmed — finish with a quick selfie.';
  }
  if (user.verificationStatus === 'rejected') {
    return 'Verification didn’t pass. Tap to try again.';
  }
  return 'Add a phone + selfie to earn the gold ★.';
}
