/**
 * ProfileScreen — seeker profile, redesigned to match Phase-2 mockup.
 *
 * Layout, top to bottom:
 *   1. Blue gradient hero card:
 *        - Avatar (tappable to upload photo) with a soft white ring
 *        - Name in white
 *        - "Verified Worker" green badge (only when user.isVerified)
 *        - Rating row: ★ 4.6 · 32 employers rated  (only when rating exists)
 *
 *   2. Expected salary card — real user.expectedSalary, with Edit button
 *      that pushes EditExpectedSalary modal.
 *
 *   3. Skills card — chips from real user.skills + (Edit) inline link.
 *
 *   4. Menu rows:
 *        My Applications, My Jobs, My Earnings, Ratings & Reviews,
 *        Download Center, Settings
 *
 *   5. Sign out — preserved from existing version.
 *
 * Every data point is real. No mock numbers, no placeholder names.
 * If a field is empty we render a tasteful "Add X" CTA instead.
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, Button, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { meApi } from '@/api/me.api';
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
    Alert.alert(
      'My Earnings',
      'Earnings tracking arrives with the wallet feature in Phase 5.',
    );
  }

  function openDownloads() {
    haptic('selection');
    Alert.alert(
      'Download Center',
      'Downloaded job posts and offline content arrive in a later update.',
    );
  }

  function openSettings() {
    haptic('selection');
    Alert.alert(
      'Settings',
      'A full settings screen with account, notifications and language preferences is coming.',
      [
        { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
        { text: 'Close', style: 'cancel' },
      ],
    );
  }

  return (
    <Screen edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing['5xl'],
        }}
      >
        {/* Blue hero card */}
        <LinearGradient
          colors={[blue[600], blue[700]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + spacing.xl,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xl + spacing.lg,
            borderBottomLeftRadius: radii.xl,
            borderBottomRightRadius: radii.xl,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Pressable onPress={onChangePhoto} disabled={photoMutation.isPending}>
              <View
                style={{
                  borderRadius: 999,
                  borderWidth: 3,
                  borderColor: 'rgba(255,255,255,0.65)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                }}
              >
                <Avatar name={user.name} photoUrl={user.photoUrl} size={76} />
              </View>
            </Pressable>
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  fontSize: 22,
                  lineHeight: 26,
                  fontWeight: '700',
                  color: '#FFFFFF',
                }}
                numberOfLines={1}
              >
                {user.name}
              </Text>

              {user.isVerified && (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: '#FCD34D', fontSize: 14, lineHeight: 18 }}>★</Text>
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 13,
                      fontWeight: '600',
                    }}
                  >
                    {user.rating.avg.toFixed(1)}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.7)' }}>|</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13 }}>
                    {user.rating.count} employer{user.rating.count === 1 ? '' : 's'} rated
                  </Text>
                </View>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 13 }}>
                  No ratings yet
                </Text>
              )}
            </View>
          </View>

          {photoError && (
            <Text style={{ color: '#FECACA', fontSize: 12, marginTop: spacing.sm }}>
              {photoError}
            </Text>
          )}
        </LinearGradient>

        {/* Cards section — pulled up to overlap the hero slightly */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: -spacing.lg, gap: spacing.md }}>
          {/* Expected salary */}
          <View style={cardStyle(theme)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.text.secondary,
                    fontWeight: '600',
                  }}
                >
                  Expected salary
                </Text>
                {user.expectedSalary ? (
                  <View style={{ marginTop: 4 }}>
                    <Text
                      style={{
                        fontSize: 28,
                        lineHeight: 32,
                        fontWeight: '700',
                        color: theme.brand.hero,
                      }}
                    >
                      {formatSalary(user.expectedSalary)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.text.tertiary,
                        marginTop: 2,
                      }}
                    >
                      {periodLabel(user.expectedSalary.period)}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.text.secondary,
                      marginTop: 6,
                    }}
                  >
                    Add what you'd like to earn
                  </Text>
                )}
              </View>
              <Button label="Edit" variant="primary" onPress={openSalaryEdit} />
            </View>
          </View>

          {/* Skills */}
          <View style={cardStyle(theme)}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                marginBottom: spacing.sm,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: theme.text.primary,
                }}
              >
                Skills
              </Text>
              <Pressable onPress={() => goEdit('skills')} hitSlop={6}>
                <Text style={{ fontSize: 14, color: theme.brand.hero, fontWeight: '600' }}>
                  (Edit)
                </Text>
              </Pressable>
            </View>
            {user.skills.length === 0 ? (
              <Text style={{ fontSize: 14, color: theme.text.secondary }}>
                Add skills so employers can find you.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {user.skills.map((s) => (
                  <View
                    key={s}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 8,
                      borderRadius: radii.pill,
                      borderWidth: 0.5,
                      borderColor: theme.border.default,
                      backgroundColor: theme.bg.muted,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: theme.text.primary,
                      }}
                    >
                      {capitalize(s)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Edit profile basics shortcut — preserves the existing
              EditProfile flow so name / bio / experience / availability
              are still reachable. Sits below the menu visually but
              groups with the menu row card. */}
          <View style={cardStyle(theme)}>
            <MenuRow icon="📋" label="My Applications" onPress={openApplications} />
            <Divider color={theme.border.subtle} />
            <MenuRow icon="📂" label="My Jobs" onPress={openSavedJobs} />
            <Divider color={theme.border.subtle} />
            <MenuRow icon="💰" label="My Earnings" onPress={openEarnings} />
            <Divider color={theme.border.subtle} />
            <MenuRow icon="⭐" label="Ratings & Reviews" onPress={openRatings} />
            <Divider color={theme.border.subtle} />
            <MenuRow
              icon="✏️"
              label="Edit Profile Details"
              onPress={() => goEdit('basics')}
            />
            <Divider color={theme.border.subtle} />
            <MenuRow icon="📥" label="Download Center" onPress={openDownloads} />
            <Divider color={theme.border.subtle} />
            <MenuRow icon="⚙️" label="Settings" onPress={openSettings} />
          </View>

          {/* Sign out */}
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Sign out" variant="secondary" onPress={() => void logout()} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.6 : 1,
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
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.text.primary }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={{ height: 0.5, backgroundColor: color }} />;
}

function cardStyle(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    backgroundColor: theme.bg.surface,
    borderRadius: radii.lg,
    borderWidth: 0.5,
    borderColor: theme.border.subtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
