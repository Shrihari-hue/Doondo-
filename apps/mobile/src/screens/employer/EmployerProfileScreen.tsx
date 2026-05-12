/**
 * EmployerProfileScreen — mirrors the seeker Profile shape.
 *
 * Identity header with avatar (tap to change photo), profile completion
 * card with the same 3D orb (color blends from coral → champagne with %),
 * sectioned cards for Business basics, Compliance (GSTIN), Location.
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
import { ProfileCompletionOrb } from '../seeker/ProfileCompletionOrb';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

export function EmployerProfileScreen() {
  const { user, logout } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const [photoError, setPhotoError] = useState<string | null>(null);

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => meApi.updateProfile({ photoUrl: dataUrl }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
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
    section: 'business_basics' | 'business_location' | 'basics' | 'location',
  ) => {
    haptic('selection');
    navigation.navigate('EditProfile', { section });
  };

  const businessTypeLabel = (
    {
      individual: 'Individual',
      shop: 'Shop',
      restaurant: 'Restaurant',
      salon: 'Salon',
      agency: 'Agency',
      startup: 'Startup',
      enterprise: 'Enterprise',
      other: 'Other',
    } as Record<string, string>
  )[user.businessType ?? ''] ?? null;

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
        {/* Identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
            <Avatar
              name={user.companyName ?? user.name}
              photoUrl={user.photoUrl}
              size={84}
              premium={user.isVerified}
            />
          </Pressable>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
              EMPLOYER
            </Text>
            <Text variant="display" weight="medium" display>
              {user.companyName ?? user.name}
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

        {/* Completion */}
        <Card premium={user.profileCompletion === 100}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <ProfileCompletionOrb completion={user.profileCompletion} size={110} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text
                variant="footnote"
                weight="medium"
                tone="secondary"
                style={{ letterSpacing: 1.0 }}
              >
                BUSINESS PROFILE
              </Text>
              <Text variant="display" weight="medium" display>
                {user.profileCompletion}%
              </Text>
              <Text variant="footnote" tone="secondary">
                {user.profileCompletion < 100
                  ? 'Complete your profile so seekers trust your posts.'
                  : 'Your business profile is complete.'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Business basics */}
        <SectionCard
          label="BUSINESS"
          title={user.companyName ?? 'Add your business name'}
          subtitle={businessTypeLabel ?? 'Tap to set business type'}
          onPress={() => goEdit('business_basics')}
        />

        {/* Compliance */}
        <SectionCard
          label="COMPLIANCE"
          title={user.gstin ?? 'GSTIN not set'}
          subtitle={user.gstin ? 'GST registration on file' : 'Add to verify your business'}
          onPress={() => goEdit('business_basics')}
        />

        {/* Business Location */}
        <SectionCard
          label="LOCATION"
          title={
            user.employerLocation?.city
              ? `${
                  user.employerLocation.area
                    ? user.employerLocation.area + ', '
                    : ''
                }${user.employerLocation.city}`
              : 'Set your business address'
          }
          subtitle={
            user.employerLocation?.coordinates
              ? 'GPS set'
              : 'So seekers know where you operate from'
          }
          onPress={() => goEdit('business_location')}
        />

        {/* Recovery phone — shown only for accounts that signed up before
            phone became required. Same OTP step the verification flow uses,
            but doesn't gate on selfie or GSTIN. */}
        {!user.phone ? (
          <Pressable
            onPress={() => {
              haptic('selection');
              navigation.navigate('AddRecoveryPhone');
            }}
          >
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View style={{ gap: 2, flex: 1 }}>
                  <Text variant="bodyLarge" weight="medium">
                    Add recovery phone
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    Needed to reset your password if you ever forget it.
                  </Text>
                </View>
                <Pill label="Add" tone="hero" />
              </View>
            </Card>
          </Pressable>
        ) : null}

        {/* Verification — tap to enter the OTP+selfie flow.
            Employers also need a valid GSTIN on file before the flow finalises. */}
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
                  {employerVerificationCopy(user)}
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
          <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
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

function employerVerificationCopy(user: {
  isVerified: boolean;
  verificationStatus: string;
  phoneVerified: boolean;
  gstin: string | null;
}): string {
  if (user.isVerified) return 'Your business carries the gold ★ everywhere.';
  if (user.verificationStatus === 'pending' && user.phoneVerified) {
    return user.gstin
      ? 'Phone confirmed — finish with a quick selfie.'
      : 'Add a valid GSTIN, then finish with a selfie.';
  }
  if (user.verificationStatus === 'rejected') {
    return 'Verification didn’t pass. Tap to try again.';
  }
  return 'Confirm your phone + selfie to earn the gold ★.';
}
