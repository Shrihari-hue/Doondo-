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

import { spacing, radii } from '@doondo/tokens';
import {
  Screen,
  Text,
  Card,
  Pill,
  Button,
  Avatar,
  ThemeToggleCard,
  AccountSwitcherSheet,
} from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
import { pickProfilePhoto } from '@/lib/photo';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { ProfileCompletionOrb } from '../seeker/ProfileCompletionOrb';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function EmployerProfileScreen() {
  const { user, logout, savedAccounts } = useAuth();
  const setStore = useAuthStore.setState;
  const navigation = useNavigation<Nav>();
  const t = useTranslate();
  const [photoError, setPhotoError] = useState<string | null>(null);

  /**
   * Account switcher — mirrors the seeker profile pill. If the user only
   * has the employer account on this device, the pill jumps to the
   * "Add Seeker account" signup; otherwise it opens the sheet so they
   * can switch back.
   */
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const hasOtherAccount = savedAccounts.length > 1;
  function onPressSwitcher() {
    haptic('selection');
    if (hasOtherAccount) {
      setSwitcherVisible(true);
    } else {
      navigation.navigate('AddAccountSignup', { role: 'seeker' });
    }
  }
  function onAddFromSheet() {
    // Sheet's footer wording reads "Add another account" when more than
    // one is saved; here we send them into the role they DON'T have.
    const missingRole = savedAccounts.some((a) => a.role === 'seeker')
      ? 'employer'
      : 'seeker';
    navigation.navigate('AddAccountSignup', { role: missingRole });
  }

  const photoMutation = useMutation({
    mutationFn: (dataUrl: string) => meApi.updateProfile({ photoUrl: dataUrl }),
    onSuccess: ({ user: updated }) => {
      haptic('success');
      setStore((s) => ({ ...s, user: updated }));
    },
    onError: (err) => {
      haptic('error');
      setPhotoError(err instanceof Error ? err.message : t('employer.profile.photo_failed'));
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
      individual: t('employer.profile.business_type_individual'),
      shop: t('employer.profile.business_type_shop'),
      restaurant: t('employer.profile.business_type_restaurant'),
      salon: t('employer.profile.business_type_salon'),
      agency: t('employer.profile.business_type_agency'),
      startup: t('employer.profile.business_type_startup'),
      enterprise: t('employer.profile.business_type_enterprise'),
      other: t('employer.profile.business_type_other'),
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
        {/* ─── Top-left account switcher ───────────────────────────────
            Same Instagram-style pill as the seeker profile. We render
            it as the first row of the ScrollView (the employer screen
            has no hero gradient to overlay onto). */}
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            onPress={onPressSwitcher}
            accessibilityRole="button"
            accessibilityLabel={t('employer.profile.switch_a11y')}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radii.pill,
              backgroundColor: 'rgba(15, 23, 42, 0.06)',
              opacity: pressed ? 0.65 : 1,
              maxWidth: '70%',
            })}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '600' }}
              numberOfLines={1}
            >
              {user.companyName ?? user.name}
            </Text>
            <Text
              style={{ fontSize: 11, fontWeight: '700', marginTop: 1 }}
              allowFontScaling={false}
            >
              ▾
            </Text>
          </Pressable>
        </View>

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
              {t('employer.profile.eyebrow')}
            </Text>
            <Text variant="display" weight="medium" display>
              {user.companyName ?? user.name}
            </Text>
            <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
              <Text variant="footnote" tone="hero">
                {photoMutation.isPending
                  ? t('employer.profile.photo_updating')
                  : user.photoUrl
                    ? t('employer.profile.photo_change')
                    : t('employer.profile.photo_add')}
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
                {t('employer.profile.completion_eyebrow')}
              </Text>
              <Text variant="display" weight="medium" display>
                {user.profileCompletion}%
              </Text>
              <Text variant="footnote" tone="secondary">
                {user.profileCompletion < 100
                  ? t('employer.profile.completion_incomplete')
                  : t('employer.profile.completion_complete')}
              </Text>
            </View>
          </View>
        </Card>

        {/* Business basics */}
        <SectionCard
          label={t('employer.profile.section_business')}
          title={user.companyName ?? t('employer.profile.business_empty_title')}
          subtitle={businessTypeLabel ?? t('employer.profile.business_empty_subtitle')}
          onPress={() => goEdit('business_basics')}
          t={t}
        />

        {/* Compliance */}
        <SectionCard
          label={t('employer.profile.section_compliance')}
          title={user.gstin ?? t('employer.profile.gstin_empty_title')}
          subtitle={user.gstin ? t('employer.profile.gstin_set_subtitle') : t('employer.profile.gstin_empty_subtitle')}
          onPress={() => goEdit('business_basics')}
          t={t}
        />

        {/* Business Location */}
        <SectionCard
          label={t('employer.profile.section_location')}
          title={
            user.employerLocation?.city
              ? `${
                  user.employerLocation.area
                    ? user.employerLocation.area + ', '
                    : ''
                }${user.employerLocation.city}`
              : t('employer.profile.location_empty_title')
          }
          subtitle={
            user.employerLocation?.coordinates
              ? t('employer.profile.location_set_subtitle')
              : t('employer.profile.location_empty_subtitle')
          }
          onPress={() => goEdit('business_location')}
          t={t}
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
                    {t('employer.profile.recovery_title')}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {t('employer.profile.recovery_body')}
                  </Text>
                </View>
                <Pill label={t('employer.profile.recovery_pill')} tone="hero" />
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
                  {t('employer.profile.verification_title')}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {employerVerificationCopy(user, t)}
                </Text>
              </View>
              {user.isVerified ? (
                <Pill label={t('employer.profile.verification_verified_pill')} tone="premium" leading="★" />
              ) : user.verificationStatus === 'pending' ? (
                <Pill label={t('employer.profile.verification_continue')} tone="hero" />
              ) : (
                <Pill label={t('employer.profile.verification_verify')} tone="hero" />
              )}
            </View>
          </Card>
        </Pressable>

        <ThemeToggleCard />

        <Button label={t('employer.profile.cta_signout')} variant="secondary" onPress={() => void logout()} />
      </ScrollView>

      {/* Account switcher bottom sheet — same component the seeker
          profile uses, so we get identical behavior across roles. */}
      <AccountSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        onAddEmployer={onAddFromSheet}
      />
    </Screen>
  );
}

function SectionCard({
  label,
  title,
  subtitle,
  onPress,
  t,
}: {
  label: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  t: TFn;
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
              {t('employer.profile.edit')}
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

function employerVerificationCopy(
  user: {
    isVerified: boolean;
    verificationStatus: string;
    phoneVerified: boolean;
    gstin: string | null;
  },
  t: TFn,
): string {
  if (user.isVerified) return t('employer.profile.verification_verified_copy');
  if (user.verificationStatus === 'pending' && user.phoneVerified) {
    return user.gstin
      ? t('employer.profile.verification_pending_with_gstin')
      : t('employer.profile.verification_pending_no_gstin');
  }
  if (user.verificationStatus === 'rejected') {
    return t('employer.profile.verification_rejected');
  }
  return t('employer.profile.verification_default');
}
