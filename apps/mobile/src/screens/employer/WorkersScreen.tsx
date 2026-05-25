/**
 * WorkersScreen — the employer's Workers tab (Phase E1).
 *
 * Two segments, mirroring the spec's §6.3:
 *   - Find workers — outbound discovery launch points: the available-
 *     workers map/list, Hire Reels, inbound interest, and sent requests.
 *   - My workforce — the people this employer has hired (a real, if
 *     initially thin, screen — the home for the old WorkforceScreen stub).
 *
 * Visual refresh: a light, illustrated hero (worker characters + a
 * location pin), colour-coded launcher tiles, and a sun/moon control so
 * the employer can flip between the dark and light palettes in place.
 * Every surface is theme-driven, so the screen reads correctly in both.
 */

import { useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

const HERO_IMAGE = require('../../../assets/images/workers-hero.png');

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Segment = 'find' | 'workforce';
type TileTone = 'blue' | 'purple' | 'amber' | 'green';

/**
 * Launcher-tile tints. Intentionally OFF the coral brand palette — these
 * five-ish colours add wayfinding variety, the same way the seeker home
 * category tiles do. Each tone carries a light and a dark variant so the
 * tile stays legible whichever palette is active.
 */
const TILE_TINT: Record<TileTone, { light: string; dark: string }> = {
  blue: { light: '#DBEAFE', dark: 'rgba(59,130,246,0.22)' },
  purple: { light: '#EAE4FD', dark: 'rgba(139,109,232,0.24)' },
  amber: { light: '#FFE7CC', dark: 'rgba(239,138,60,0.22)' },
  green: { light: '#D6F5E3', dark: 'rgba(34,197,138,0.22)' },
};

const LAUNCHERS: {
  tone: TileTone;
  glyph: string;
  title: string;
  subtitle: string;
  route: keyof AppStackParamList;
}[] = [
  {
    tone: 'blue',
    glyph: '📡',
    title: 'Available now',
    subtitle:
      'Workers broadcasting that they’re free nearby — browse them as a list or on a map.',
    route: 'AvailableWorkers',
  },
  {
    tone: 'purple',
    glyph: '🎬',
    title: 'Hire Reels',
    subtitle: 'Swipe through 30-second worker intro videos.',
    route: 'ReelFeed',
  },
  {
    tone: 'amber',
    glyph: '🙋',
    title: 'Interested in you',
    subtitle: 'Workers who asked to work for you — invite them to a job.',
    route: 'InterestedWorkers',
  },
  {
    tone: 'green',
    glyph: '📤',
    title: 'Requests sent',
    subtitle: 'Hiring requests you’ve sent, and how workers responded.',
    route: 'SentHiringRequests',
  },
];

export function WorkersScreen() {
  const { theme, scheme, setScheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('find');

  const isDark = scheme === 'dark';

  const hiredQuery = useQuery({
    queryKey: ['applicants', 'employer', 'hired'],
    queryFn: () =>
      applicationsApi.listForEmployer({ status: 'hired', limit: 100 }),
    staleTime: 30_000,
    enabled: segment === 'workforce',
  });

  const hired = hiredQuery.data?.applications ?? [];

  return (
    <Screen edges={[]}>
      {/* ── Illustrated hero ─────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        {/* top row — palette toggle */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => {
              haptic('selection');
              setScheme(isDark ? 'light' : 'dark');
            }}
            accessibilityRole="button"
            accessibilityLabel={
              isDark ? 'Switch to light theme' : 'Switch to dark theme'
            }
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </Pressable>
        </View>

        {/* title + illustration */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: -spacing.xs,
          }}
        >
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            <Text
              style={{
                fontSize: 30,
                fontWeight: '800',
                letterSpacing: -0.6,
                color: theme.text.primary,
              }}
            >
              Workers
            </Text>
            <Text
              style={{
                fontSize: 13.5,
                lineHeight: 19,
                color: theme.text.secondary,
                marginTop: 4,
              }}
            >
              Find people to hire and manage the team you’ve built.
            </Text>
          </View>
          <Image
            source={HERO_IMAGE}
            resizeMode="contain"
            style={{ width: 152, height: 124 }}
            accessibilityIgnoresInvertColors
          />
        </View>
      </View>

      {/* ── Segmented toggle ─────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'center',
          marginTop: spacing.xs,
          backgroundColor: theme.bg.surface,
          borderRadius: radii.pill,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
          padding: 3,
        }}
      >
        <SegTab
          label="Find workers"
          active={segment === 'find'}
          onPress={() => setSegment('find')}
        />
        <SegTab
          label="My workforce"
          active={segment === 'workforce'}
          onPress={() => setSegment('workforce')}
        />
      </View>

      {segment === 'find' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.sm,
          }}
        >
          {LAUNCHERS.map((item) => (
            <LauncherCard
              key={item.route}
              glyph={item.glyph}
              title={item.title}
              subtitle={item.subtitle}
              tileColor={isDark ? TILE_TINT[item.tone].dark : TILE_TINT[item.tone].light}
              isDark={isDark}
              onPress={() => navigation.navigate(item.route as never)}
            />
          ))}
        </ScrollView>
      ) : hiredQuery.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : hiredQuery.isError ? (
        <EmptyState
          title="Could not load your workforce"
          message="Check your connection and try again."
          cta={{ label: 'Retry', onPress: () => void hiredQuery.refetch() }}
        />
      ) : hired.length === 0 ? (
        <EmptyState
          glyph="👷"
          eyebrow="NO HIRES YET"
          title="Your workforce is empty"
          message="Workers you hire will appear here so you can find them again and re-hire in one tap."
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.sm,
          }}
          refreshControl={
            <RefreshControl
              refreshing={hiredQuery.isRefetching}
              onRefresh={() => void hiredQuery.refetch()}
              tintColor={theme.brand.hero}
            />
          }
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.4,
              color: theme.text.tertiary,
              marginBottom: spacing.xs,
            }}
          >
            {`HIRED · ${hired.length}`}
          </Text>
          {hired.map((entry) => (
            <HiredRow
              key={entry.id}
              entry={entry}
              onPress={() => {
                haptic('selection');
                navigation.navigate('ApplicantDetail', {
                  applicationId: entry.id,
                });
              }}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function SegTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      style={{
        paddingVertical: 7,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.pill,
        backgroundColor: active ? blue[600] : 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: active ? '#FFFFFF' : theme.text.secondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LauncherCard({
  glyph,
  title,
  subtitle,
  tileColor,
  isDark,
  onPress,
}: {
  glyph: string;
  title: string;
  subtitle: string;
  tileColor: string;
  isDark: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.lg,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
        shadowColor: '#0B1B3A',
        shadowOpacity: isDark ? 0 : 0.07,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: isDark ? 0 : 2,
      })}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          backgroundColor: tileColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 24 }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{ fontSize: 15.5, fontWeight: '700', color: theme.text.primary }}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 12.5, color: theme.text.secondary, lineHeight: 17 }}
        >
          {subtitle}
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}

function HiredRow({
  entry,
  onPress,
}: {
  entry: ApplicantEntry;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const name = entry.seeker?.name ?? 'Worker';
  const jobTitle = entry.job?.title ?? 'a job';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Avatar
        name={name}
        photoUrl={entry.seeker?.photoUrl ?? null}
        size={44}
        premium={entry.seeker?.isVerified}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
          numberOfLines={1}
        >
          {name}
          {entry.seeker?.isVerified ? '  ✓' : ''}
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.text.tertiary }}
          numberOfLines={1}
        >
          Hired for “{jobTitle}”
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}
