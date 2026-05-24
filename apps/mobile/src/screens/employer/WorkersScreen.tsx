/**
 * WorkersScreen — the employer's Workers tab (Phase E1).
 *
 * Two segments, mirroring the spec's §6.3:
 *   - Find workers — outbound discovery launch points: the available-
 *     workers map/list, Hire Reels, inbound interest, and sent requests.
 *   - My workforce — the people this employer has hired (a real, if
 *     initially thin, screen — the home for the old WorkforceScreen stub).
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Segment = 'find' | 'workforce';

export function WorkersScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('find');

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
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#FFFFFF' }}>
          Workers
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: 'rgba(255,255,255,0.85)',
            marginTop: 2,
          }}
        >
          Find people to hire and manage the team you’ve built.
        </Text>
      </LinearGradient>

      {/* Segmented toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'center',
          marginTop: spacing.md,
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
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: insets.bottom + spacing['5xl'],
            gap: spacing.sm,
          }}
        >
          <LauncherCard
            glyph="📡"
            title="Available now"
            subtitle="Workers broadcasting that they’re free nearby — browse them as a list or on a map."
            onPress={() => navigation.navigate('AvailableWorkers')}
          />
          <LauncherCard
            glyph="🎬"
            title="Hire Reels"
            subtitle="Swipe through 30-second worker intro videos."
            onPress={() => navigation.navigate('ReelFeed')}
          />
          <LauncherCard
            glyph="🙋"
            title="Interested in you"
            subtitle="Workers who asked to work for you — invite them to a job."
            onPress={() => navigation.navigate('InterestedWorkers')}
          />
          <LauncherCard
            glyph="📤"
            title="Requests sent"
            subtitle="Hiring requests you’ve sent, and how workers responded."
            onPress={() => navigation.navigate('SentHiringRequests')}
          />
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
          color: active ? '#FFFFFF' : theme.text.tertiary,
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
  onPress,
}: {
  glyph: string;
  title: string;
  subtitle: string;
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
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: theme.bg.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 20 }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: theme.text.primary }}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.text.tertiary, lineHeight: 17 }}
        >
          {subtitle}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
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
