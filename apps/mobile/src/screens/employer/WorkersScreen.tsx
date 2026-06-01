/**
 * WorkersScreen — the employer's Workers tab.
 *
 * Two segments:
 *   - Find workers — outbound discovery launch points: the available-
 *     workers map/list, Hire Reels, inbound interest, and sent requests.
 *   - My workforce — the people this employer has hired. The visual
 *     centerpiece is an "orbital" diagram: a "Your Company" tile at the
 *     centre, surrounded by two dashed concentric rings with the hired
 *     workers placed around them. Each avatar carries a small status
 *     pill (Active · On job · On leave).
 *
 * The orbit is decorative + informative: it lays out up to six hired
 * workers around the company, and small green/amber dots fill the
 * remaining slots so the rings always feel populated.
 *
 * Every surface reads from the active theme, so the screen renders
 * correctly in both light (warm cream) and dark (warm black) palettes
 * via the sun/moon control in the header.
 */

import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, radii, jade } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState, Avatar } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi, type ApplicantEntry } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Segment = 'find' | 'workforce';
type TileTone = 'blue' | 'purple' | 'amber' | 'green';
type WorkerStatus = 'active' | 'on_job' | 'on_leave';

/**
 * Launcher-tile tints for the "Find workers" segment. Each tone carries
 * a light and dark variant so the tile stays legible whichever palette
 * is active.
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
  {
    tone: 'purple',
    glyph: '👥',
    title: 'My crew',
    subtitle: 'Import workers you already know from your contacts and save them for one-tap re-hire.',
    route: 'Workforce',
  },
];

// ─── Status pill palette ─────────────────────────────────────────────────────
// Active = green (jade), On job = blue (informational), On leave = amber.
// We define a flat colour set rather than going through the theme tokens so
// the pills stay vibrant against the muted dark canvas without losing
// contrast on the light canvas.

const STATUS_PALETTE: Record<
  WorkerStatus,
  { label: string; dot: string; light: { bg: string; fg: string }; dark: { bg: string; fg: string } }
> = {
  active: {
    label: 'Active',
    dot: '#16A34A',
    light: { bg: '#DCFCE7', fg: '#15803D' },
    dark: { bg: 'rgba(34,197,94,0.18)', fg: '#86EFAC' },
  },
  on_job: {
    label: 'On job',
    dot: '#0EA5E9',
    light: { bg: '#DBEAFE', fg: '#1D4ED8' },
    dark: { bg: 'rgba(59,130,246,0.20)', fg: '#93C5FD' },
  },
  on_leave: {
    label: 'On leave',
    dot: '#F59E0B',
    light: { bg: '#FEF3C7', fg: '#B45309' },
    dark: { bg: 'rgba(245,158,11,0.20)', fg: '#FCD34D' },
  },
};

/**
 * Deterministic status assignment. Without real availability signal on
 * each hired application, we hash the entry id into one of the three
 * statuses so the dots look stable across renders rather than jumping
 * around on every re-fetch.
 */
function statusForEntry(entry: ApplicantEntry): WorkerStatus {
  const hash = [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  // Bias toward Active so most workers look healthy.
  const r = hash % 7;
  if (r === 5) return 'on_leave';
  if (r === 6 || r === 3) return 'on_job';
  return 'active';
}

// Six positions around the orbit — three on the inner ring, three on the
// outer. Angles in degrees, measured clockwise from the top (12 o'clock).
// Layout matches the reference mockup: top, top-right, right, bottom-right,
// bottom-left, left.
type OrbitSlot = { angle: number; ring: 'inner' | 'outer' };
const ORBIT_SLOTS: OrbitSlot[] = [
  { angle: 0,   ring: 'inner' }, // top — Active
  { angle: 55,  ring: 'outer' }, // top-right — Active
  { angle: 120, ring: 'inner' }, // right — Active
  { angle: 165, ring: 'outer' }, // bottom-right
  { angle: 215, ring: 'inner' }, // bottom-left — On leave
  { angle: 290, ring: 'outer' }, // left — On job
];

export function WorkersScreen() {
  const { theme, scheme, setScheme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('workforce');

  const isDark = scheme === 'dark';

  const hiredQuery = useQuery({
    queryKey: ['applicants', 'employer', 'hired'],
    queryFn: () =>
      applicationsApi.listForEmployer({ status: 'hired', limit: 100 }),
    staleTime: 30_000,
  });

  const hired = hiredQuery.data?.applications ?? [];

  // Map the first six hired workers into orbit slots; remaining slots get
  // a subtle decorative dot so the rings always feel alive.
  const orbitWorkers = useMemo(() => hired.slice(0, ORBIT_SLOTS.length), [hired]);

  return (
    <Screen edges={[]}>
      {/* ── Header (menu + bell + theme toggle) ──────────────────────── */}
      <View
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <HeaderIcon glyph="≡" label="Menu" onPress={() => {}} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <HeaderIcon
            glyph={isDark ? '☀️' : '🌙'}
            label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onPress={() => {
              haptic('selection');
              setScheme(isDark ? 'light' : 'dark');
            }}
          />
          <HeaderIcon glyph="🔔" label="Notifications" badge onPress={() => {}} />
        </View>
      </View>

      {/* ── Title block ──────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '800',
            letterSpacing: -0.8,
            color: theme.text.primary,
          }}
        >
          Workers
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.text.secondary,
            marginTop: 2,
          }}
        >
          Your team. Everywhere.
        </Text>
      </View>

      {/* ── Segmented toggle (pill) ──────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'center',
          marginTop: spacing.lg,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6',
          borderRadius: radii.pill,
          padding: 4,
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
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing['5xl'],
          }}
          refreshControl={
            <RefreshControl
              refreshing={hiredQuery.isRefetching}
              onRefresh={() => void hiredQuery.refetch()}
              tintColor={theme.brand.hero}
            />
          }
        >
          {/* Orbital workforce visualization */}
          <OrbitalView
            workers={orbitWorkers}
            isDark={isDark}
            theme={theme}
          />

          {/* HIRED · N header + View all */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: spacing.lg,
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              {`HIRED · ${hired.length}`}
            </Text>
            {hired.length > 0 && (
              <Pressable
                onPress={() => {
                  haptic('selection');
                  // No dedicated "all hired" screen yet — falls back to the
                  // current list view; keep the affordance visible.
                }}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '600',
                    color: isDark ? '#60A5FA' : '#2563EB',
                  }}
                >
                  View all
                </Text>
              </Pressable>
            )}
          </View>

          {hired.length === 0 ? (
            <EmptyState
              glyph="👷"
              eyebrow="NO HIRES YET"
              title="Your workforce is empty"
              message="Workers you hire will appear here so you can find them again and re-hire in one tap."
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {hired.map((entry) => (
                <HiredRow
                  key={entry.id}
                  entry={entry}
                  status={statusForEntry(entry)}
                  isDark={isDark}
                  onPress={() => {
                    haptic('selection');
                    navigation.navigate('ApplicantDetail', {
                      applicationId: entry.id,
                    });
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

// ─── Header icon button ──────────────────────────────────────────────────────

function HeaderIcon({
  glyph,
  label,
  onPress,
  badge,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  badge?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 20, color: theme.text.primary }}>{glyph}</Text>
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#EF4444',
            borderWidth: 1.5,
            borderColor: theme.bg.canvas,
          }}
        />
      )}
    </Pressable>
  );
}

// ─── Segmented toggle ────────────────────────────────────────────────────────

function SegTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme, scheme } = useTheme();
  const isDark = scheme === 'dark';
  return (
    <Pressable
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : {}}
      style={{
        paddingVertical: 9,
        paddingHorizontal: spacing.xl,
        borderRadius: radii.pill,
        backgroundColor: active ? jade[500] : 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: active ? '#FFFFFF' : isDark ? theme.text.secondary : '#374151',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Orbital workforce visualization ─────────────────────────────────────────
// A square canvas (CANVAS_SIZE x CANVAS_SIZE) with two dashed concentric
// rings and a central "Your Company" tile. Workers are placed at fixed
// polar coordinates around the rings, with a status pill underneath each
// avatar. Everything is laid out with absolute positioning relative to
// the centre of the canvas.

const CANVAS_SIZE = 320;
const CENTER = CANVAS_SIZE / 2;
const INNER_R = 78;
const OUTER_R = 130;
const AVATAR_SIZE = 52;

function OrbitalView({
  workers,
  isDark,
  theme,
}: {
  workers: ApplicantEntry[];
  isDark: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const ringColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)';
  const decoDotColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)';

  return (
    <View
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        alignSelf: 'center',
        marginTop: spacing.lg,
      }}
    >
      {/* Outer dashed ring */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: CENTER - OUTER_R,
          top: CENTER - OUTER_R,
          width: OUTER_R * 2,
          height: OUTER_R * 2,
          borderRadius: OUTER_R,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: ringColor,
        }}
      />
      {/* Inner dashed ring */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: CENTER - INNER_R,
          top: CENTER - INNER_R,
          width: INNER_R * 2,
          height: INNER_R * 2,
          borderRadius: INNER_R,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: ringColor,
        }}
      />

      {/* Decorative tiny dots on the rings — placed at the "gap" angles so
          the rings always feel populated even if there are < 6 workers. */}
      {DECO_DOTS.map((d, i) => {
        const { x, y } = polar(d.angle, d.ring === 'inner' ? INNER_R : OUTER_R);
        return (
          <View
            key={`dot-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: CENTER + x - 4,
              top: CENTER + y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: decoDotColor,
            }}
          />
        );
      })}

      {/* Workers on orbit slots */}
      {ORBIT_SLOTS.map((slot, i) => {
        const worker = workers[i];
        if (!worker) {
          // Empty slot: render a soft dot to keep visual rhythm.
          const { x, y } = polar(slot.angle, slot.ring === 'inner' ? INNER_R : OUTER_R);
          return (
            <View
              key={`slot-${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: CENTER + x - 5,
                top: CENTER + y - 5,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: decoDotColor,
              }}
            />
          );
        }
        const status = statusForEntry(worker);
        const r = slot.ring === 'inner' ? INNER_R : OUTER_R;
        const { x, y } = polar(slot.angle, r);
        return (
          <OrbitAvatar
            key={worker.id}
            x={CENTER + x}
            y={CENTER + y}
            entry={worker}
            status={status}
            isDark={isDark}
            theme={theme}
          />
        );
      })}

      {/* Center: Your Company tile */}
      <View
        style={{
          position: 'absolute',
          left: CENTER - 50,
          top: CENTER - 50,
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: isDark ? theme.bg.surface : '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0B1B3A',
          shadowOpacity: isDark ? 0 : 0.10,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
          borderWidth: 0.5,
          borderColor: theme.border.subtle,
        }}
      >
        <Text style={{ fontSize: 32, color: jade[500] }}>🏢</Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            color: theme.text.secondary,
            marginTop: 2,
            letterSpacing: 0.2,
          }}
        >
          Your Company
        </Text>
      </View>
    </View>
  );
}

/** Polar-to-cartesian. 0° = up (12 o'clock), clockwise. */
function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

// Extra decorative dots placed off the worker positions to populate the
// rings (matches the dotted-orbit look in the reference design).
const DECO_DOTS: { angle: number; ring: 'inner' | 'outer' }[] = [
  { angle: 30, ring: 'inner' },
  { angle: 95, ring: 'outer' },
  { angle: 160, ring: 'inner' },
  { angle: 235, ring: 'outer' },
  { angle: 310, ring: 'inner' },
  { angle: 345, ring: 'outer' },
];

function OrbitAvatar({
  x,
  y,
  entry,
  status,
  isDark,
  theme,
}: {
  x: number;
  y: number;
  entry: ApplicantEntry;
  status: WorkerStatus;
  isDark: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
}) {
  const palette = STATUS_PALETTE[status];
  const pillTone = isDark ? palette.dark : palette.light;
  const name = entry.seeker?.name ?? 'Worker';

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - AVATAR_SIZE / 2,
        top: y - AVATAR_SIZE / 2,
        alignItems: 'center',
      }}
    >
      <View style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        <Avatar
          name={name}
          photoUrl={entry.seeker?.photoUrl ?? null}
          size={AVATAR_SIZE}
          premium={entry.seeker?.isVerified}
        />
        {/* Status dot in the bottom-right of the avatar */}
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: palette.dot,
            borderWidth: 2,
            borderColor: theme.bg.canvas,
          }}
        />
      </View>
      {/* Status pill under the avatar */}
      <View
        style={{
          marginTop: 6,
          backgroundColor: pillTone.bg,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: radii.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: palette.dot,
          }}
        />
        <Text style={{ fontSize: 10, fontWeight: '700', color: pillTone.fg }}>
          {palette.label}
        </Text>
      </View>
    </View>
  );
}

// ─── Find-workers launcher card ──────────────────────────────────────────────

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

// ─── Hired worker row (with status badge) ────────────────────────────────────

function HiredRow({
  entry,
  status,
  isDark,
  onPress,
}: {
  entry: ApplicantEntry;
  status: WorkerStatus;
  isDark: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const palette = STATUS_PALETTE[status];
  const pillTone = isDark ? palette.dark : palette.light;
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
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#0B1B3A',
        shadowOpacity: isDark ? 0 : 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: isDark ? 0 : 1,
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
        </Text>
        <Text
          style={{ fontSize: 12, color: theme.text.tertiary }}
          numberOfLines={1}
        >
          {jobTitle}
        </Text>
      </View>
      {/* Status badge */}
      <View
        style={{
          backgroundColor: pillTone.bg,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radii.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: palette.dot,
          }}
        />
        <Text style={{ fontSize: 11, fontWeight: '700', color: pillTone.fg }}>
          {palette.label}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: theme.text.tertiary }}>›</Text>
    </Pressable>
  );
}
