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
        contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
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

        {/* ─── Stats strip ───────────────────────────────────────────── */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            marginTop: -spacing['2xl'],
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
          <SectionLabel>EXPECTED SALARY</SectionLabel>
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
              <Button label="Edit" variant="primary" onPress={openSalaryEdit} />
            </View>
          </View>

          {/* Skills */}
          <SectionLabel>SKILLS</SectionLabel>
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

          {/* Activity menu */}
          <SectionLabel>ACTIVITY</SectionLabel>
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

          {/* Account menu */}
          <SectionLabel>ACCOUNT</SectionLabel>
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
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md + 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}>
          {label}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: 12, color: theme.text.tertiary }} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={{ fontSize: 22, color: theme.text.tertiary }}>›</Text>
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
