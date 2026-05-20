/**
 * FirstMatchPreviewScreen — "60-second first match".
 *
 * Shown to seekers right after they pick "I want to find work" (and
 * solo/team), BEFORE they're asked to sign up. The point: get them to
 * a "found something" moment in their first minute with the app so
 * the signup ask feels earned, not arbitrary.
 *
 * What it does:
 *   1. Tries to get the device's coords. Falls back to Bengaluru if
 *      location is denied — same fallback the seeker home screen uses.
 *   2. Hits the public /jobs/preview endpoint for 3 jobs.
 *   3. Renders them as cards. Tap → goes to Signup (apply needs auth);
 *      the "Sign up to apply" CTA at the bottom does the same.
 *
 * Skip path: a small "Skip for now" button up top jumps straight to
 * Signup for users who don't want to see jobs first.
 *
 * Design fits the existing dark-luxe system — uses the brand `hero`
 * for the primary CTA, the existing Pill component for chips, and
 * keeps the page density tight (no scrollbars on small phones).
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import { radii, spacing } from '@doondo/tokens';
import { Screen, Text, Pill } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { getCurrentCoords } from '@/lib/location';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { jobsApi } from '@/api/jobs.api';
import type { PublicJob } from '@/api/types';
import type { AuthStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'FirstMatchPreview'>;
type R = RouteProp<AuthStackParamList, 'FirstMatchPreview'>;

// Same fallback the seeker home uses — central Bengaluru. Better to
// show some real jobs than an empty state when location is denied.
const FALLBACK_COORDS = { lat: 12.9716, lng: 77.5946 } as const;

export function FirstMatchPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { theme } = useTheme();
  const { workType, teamSize } = route.params;

  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const coords = (await getCurrentCoords()) ?? FALLBACK_COORDS;
        const res = await jobsApi.preview({
          lat: coords.lat,
          lng: coords.lng,
          radius: 10_000,
          limit: 3,
        });
        if (cancelled) return;
        setJobs(res.jobs);
      } catch (err) {
        if (cancelled) return;
        // Network or 5xx — show the page anyway with a small inline error.
        // The CTA still works so the seeker isn't blocked.
        setError(
          friendlyErrorMessage(err, "We couldn't load matches. Try again in a moment."),
        );
        setJobs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function goSignup() {
    haptic('medium');
    navigation.navigate(
      'Signup',
      teamSize != null
        ? { role: 'seeker', workType, teamSize }
        : { role: 'seeker', workType },
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing['3xl'],
        }}
      >
        {/* Top bar — back + skip */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.xl,
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityLabel="Back"
            accessibilityRole="button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="chevron-left" size={20} color={theme.text.primary} />
          </Pressable>
          <Pressable
            onPress={goSignup}
            hitSlop={8}
            accessibilityLabel="Skip preview and continue to sign up"
            accessibilityRole="button"
          >
            <Text variant="footnote" weight="medium" tone="secondary">
              Skip for now
            </Text>
          </Pressable>
        </View>

        {/* Header */}
        <View style={{ gap: spacing.xs, marginBottom: spacing.xl }}>
          <Text
            variant="footnote"
            weight="medium"
            style={{
              letterSpacing: 1.2,
              color: theme.brand.hero,
            }}
          >
            FIRST LOOK
          </Text>
          <Text variant="displayLarge" weight="medium" display>
            Jobs hiring near you right now.
          </Text>
          <Text variant="body" tone="secondary">
            A quick preview before you sign up. Tap any card to see details.
          </Text>
        </View>

        {/* Cards */}
        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'] }}>
            <ActivityIndicator />
          </View>
        ) : jobs && jobs.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            {jobs.map((j) => (
              <PreviewCard key={j.id} job={j} onPress={goSignup} />
            ))}
          </View>
        ) : (
          <View
            style={{
              padding: spacing.xl,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              backgroundColor: theme.bg.muted,
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Text variant="body" weight="medium">
              No matches near you in this radius.
            </Text>
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
              Sign up to set your area and we'll find work the moment it shows up.
            </Text>
          </View>
        )}

        {error && jobs?.length === 0 && (
          <Text
            variant="caption"
            tone="secondary"
            style={{ textAlign: 'center', marginTop: spacing.sm }}
          >
            {error}
          </Text>
        )}

        {/* Primary CTA */}
        <Pressable
          onPress={goSignup}
          style={{
            marginTop: spacing.xl,
            backgroundColor: theme.brand.hero,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            borderRadius: radii.lg,
            alignItems: 'center',
          }}
        >
          <Text variant="bodyLarge" weight="medium" style={{ color: '#FFFDF7' }}>
            Sign up to apply
          </Text>
        </Pressable>
        <Text
          variant="caption"
          tone="tertiary"
          style={{ textAlign: 'center', marginTop: spacing.sm }}
        >
          Takes 30 seconds. Phone OTP only.
        </Text>
      </ScrollView>
    </Screen>
  );
}

// ─── Preview card ──────────────────────────────────────────────────────────

interface PreviewCardProps {
  job: PublicJob;
  onPress: () => void;
}

function PreviewCard({ job, onPress }: PreviewCardProps) {
  const { theme } = useTheme();
  const employerLabel = job.employer?.companyName ?? job.employer?.name ?? null;
  const distanceKm =
    typeof job.distanceMeters === 'number'
      ? job.distanceMeters < 1000
        ? `${job.distanceMeters} m away`
        : `${(job.distanceMeters / 1000).toFixed(1)} km away`
      : null;
  const payLabel = formatPay(job.pay);

  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: spacing.lg,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: job.urgent ? theme.brand.hero : theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        {job.urgent && <Pill label="Urgent" tone="hero" />}
        {job.employer?.isVerified && <Pill label="Verified" tone="success" />}
        {job.safeForWomen && <Pill label="Safe for women" tone="success" />}
      </View>

      <Text variant="bodyLarge" weight="medium" numberOfLines={2}>
        {job.title}
      </Text>

      {employerLabel && (
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {employerLabel}
        </Text>
      )}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.md,
          marginTop: spacing.xs,
        }}
      >
        {payLabel && (
          <Text variant="footnote" weight="medium" style={{ color: theme.text.primary }}>
            {payLabel}
          </Text>
        )}
        {distanceKm && (
          <Text variant="footnote" tone="secondary">
            {distanceKm}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function formatPay(pay: PublicJob['pay']): string | null {
  if (!pay || typeof pay.amount !== 'number') return null;
  // Backend stores paise (minor units). Convert to rupees for display.
  const rupees = Math.round(pay.amount / 100);
  const max = pay.amountMax ? Math.round(pay.amountMax / 100) : null;
  const periodLabel =
    pay.period === 'hour'
      ? '/hr'
      : pay.period === 'day'
        ? '/day'
        : pay.period === 'week'
          ? '/wk'
          : pay.period === 'month'
            ? '/mo'
            : '';
  const amountStr = max && max > rupees ? `₹${rupees}–${max}` : `₹${rupees}`;
  return `${amountStr}${periodLabel}`;
}
