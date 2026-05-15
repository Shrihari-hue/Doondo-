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
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, EmptyState, Avatar, Stars } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { haptic } from '@/lib/haptics';
import { meApi } from '@/api/me.api';
import { ApiError } from '@/api/errors';
import {
  formatRange,
  formatTenure,
  sortWorkHistory,
  tenureMonths,
} from '@/lib/workHistory';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicUser, WorkExperience } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function ResumePreviewInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setStore = useAuthStore.setState;

  const entries = sortWorkHistory(user?.workHistory ?? []);

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
      const msg = err instanceof ApiError ? err.message : 'Try again.';
      Alert.alert("Couldn't delete resume", msg);
    },
  });

  const onShare = async () => {
    if (!user) return;
    haptic('selection');
    try {
      await Share.share({
        title: `${user.name} — Resume`,
        message: buildShareText(user, entries),
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
      'Delete resume?',
      'Your work history will be cleared. You can build it again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
            eyebrow="NO RESUME YET"
            title="Build your resume"
            message="Walk through your last 1–5 jobs and we'll turn it into something you can share with employers."
            cta={{
              label: 'Start the wizard',
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
            My resume
          </Text>
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: blue[600] }}>
              Edit
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
            <ContactRow user={user} />
          </LinearGradient>
        </View>

        {/* Bio */}
        {user.bio ? (
          <Section title="ABOUT ME">
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
          <Section title="SKILLS">
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
        <Section title={`EXPERIENCE · ${entries.length}`}>
          <View style={{ gap: spacing.sm }}>
            {entries.map((e, i) => (
              <WorkRow key={`${e.company}-${e.startDate}-${i}`} entry={e} />
            ))}
          </View>
        </Section>

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
          Generated with Doondo · doondo.app
        </Text>
      </ScrollView>

      {/* Sticky CTAs */}
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
            borderWidth: 1,
            borderColor: theme.border.default,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.status.danger }}>
            Delete
          </Text>
        </Pressable>
        <Pressable
          onPress={onShare}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: spacing.md,
            borderRadius: radii.pill,
            alignItems: 'center',
            backgroundColor: blue[600],
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
            Share resume
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ContactRow({ user }: { user: PublicUser }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {user.phone ? <PillTag label={user.phone} icon="📞" /> : null}
      <PillTag label={user.email} icon="✉" />
      {user.experienceYears != null ? (
        <PillTag
          label={`${user.experienceYears} ${
            user.experienceYears === 1 ? 'yr' : 'yrs'
          } experience`}
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

function WorkRow({ entry }: { entry: WorkExperience }) {
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
              CURRENT
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
function buildShareText(user: PublicUser, entries: WorkExperience[]): string {
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
      `${user.experienceYears} ${
        user.experienceYears === 1 ? 'year' : 'years'
      } of experience`,
    );
  }
  if (user.rating) {
    lines.push(`★ ${user.rating.avg.toFixed(1)} (${user.rating.count} reviews)`);
  }
  if (user.bio) {
    lines.push('');
    lines.push('ABOUT');
    lines.push(user.bio);
  }
  if (user.skills?.length) {
    lines.push('');
    lines.push('SKILLS');
    lines.push(user.skills.join(' · '));
  }
  lines.push('');
  lines.push('EXPERIENCE');
  for (const e of entries) {
    lines.push('');
    lines.push(`${e.role} — ${e.company}`);
    lines.push(formatRange(e));
    if (e.description) lines.push(e.description);
  }
  lines.push('');
  lines.push('—');
  lines.push('Generated with Doondo · doondo.app');
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
