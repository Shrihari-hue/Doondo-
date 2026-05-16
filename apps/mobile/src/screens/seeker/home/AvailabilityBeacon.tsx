/**
 * AvailabilityBeacon — the seeker's "I'm available right now" surface.
 *
 * Two exports:
 *   - AvailabilityBeaconChip: the always-visible row that sits at the
 *     top of Home (under the mode toggle). It shows the current beacon
 *     status — "📢 Tell employers I'm available" when there's no live
 *     beacon, or "🟢 Available until 4:30 PM · 12 min left" plus a
 *     Withdraw action when one is active. Tap opens the sheet.
 *   - AvailabilityBeaconSheet: the bottom-sheet picker — duration
 *     (1h / 2h / 4h / 8h) + multi-select trade chips + optional note +
 *     publish CTA.
 *
 * The two render in the Home tree (above the mode-specific content) so
 * existing modes are not touched — they remain functional even if the
 * worker never raises the beacon.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { TRADES } from '@/lib/trades';
import {
  availabilityApi,
  type PublicAvailability,
} from '@/api/availability.api';
import { ApiError } from '@/api/errors';
import type { Coords } from '@/lib/location';
import type { PublicUser } from '@/api/types';

const DURATION_OPTIONS = [
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
  { minutes: 480, label: '8h' },
] as const;

// ─── Chip — always visible row on Home ──────────────────────────────────────

export function AvailabilityBeaconChip({
  coords,
  user,
}: {
  coords: Coords | null;
  user: PublicUser | null;
}) {
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['availability', 'me'],
    queryFn: () => availabilityApi.getMine(),
    staleTime: 30_000,
    refetchInterval: 30_000, // ticks the countdown automatically
  });

  const withdrawMutation = useMutation({
    mutationFn: () => availabilityApi.withdraw(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['availability', 'me'] });
      haptic('warning');
    },
    onError: () => {
      haptic('error');
      Alert.alert("Couldn't withdraw", 'Try again.');
    },
  });

  const active = query.data?.availability ?? null;
  const minutesLeft = active ? minutesUntil(active.until) : null;
  const isLive = active != null && minutesLeft != null && minutesLeft > 0;

  const onWithdraw = () => {
    Alert.alert(
      'Stop broadcasting?',
      "Employers near you will no longer see you as available.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => withdrawMutation.mutate(),
        },
      ],
    );
  };

  return (
    <>
      <Pressable
        onPress={() => {
          haptic('selection');
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isLive ? 'Edit availability beacon' : 'Tell employers you are available'
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: isLive ? '#D1FAE5' : '#EFF6FF',
          borderWidth: 0.5,
          borderColor: isLive ? '#86EFAC' : '#BFDBFE',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: isLive ? '#10B981' : '#2563EB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16 }}>{isLive ? '🟢' : '📢'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: isLive ? '#065F46' : '#1E40AF',
            }}
          >
            {isLive
              ? `Available — ${formatLeft(minutesLeft!)} left`
              : "Tell employers I'm available now"}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: isLive ? '#047857' : '#1E3A8A',
              opacity: 0.85,
            }}
            numberOfLines={1}
          >
            {isLive
              ? `Until ${formatClock(active!.until)} · tap to edit`
              : 'Nearby employers will see you in their list'}
          </Text>
        </View>
        {isLive ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onWithdraw();
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: radii.pill,
              backgroundColor: '#FFFFFF',
              borderWidth: 0.5,
              borderColor: '#A7F3D0',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>
              Stop
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      <AvailabilityBeaconSheet
        visible={sheetOpen}
        coords={coords}
        user={user}
        existing={active}
        onClose={() => setSheetOpen(false)}
        onPublished={() => {
          setSheetOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['availability', 'me'] });
        }}
      />
    </>
  );
}

// ─── Sheet — duration + trades + note + publish ─────────────────────────────

function AvailabilityBeaconSheet({
  visible,
  coords,
  user,
  existing,
  onClose,
  onPublished,
}: {
  visible: boolean;
  coords: Coords | null;
  user: PublicUser | null;
  existing: PublicAvailability | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const { theme } = useTheme();

  const [minutes, setMinutes] = useState<number>(120);
  const [tradeSlugs, setTradeSlugs] = useState<string[]>(
    existing?.tradesAvailable ?? user?.skills ?? [],
  );
  const [note, setNote] = useState<string>(existing?.note ?? '');

  // Re-seed when the sheet re-opens with new data.
  useMemo(() => {
    if (visible) {
      setTradeSlugs(existing?.tradesAvailable ?? user?.skills ?? []);
      setNote(existing?.note ?? '');
    }
  }, [visible, existing, user?.skills]);

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!coords) {
        throw new Error("We need your location to broadcast. Try again in a moment.");
      }
      return availabilityApi.publish({
        durationMinutes: minutes,
        lat: coords.lat,
        lng: coords.lng,
        city: user?.location?.city ?? null,
        area: user?.location?.area ?? null,
        tradesAvailable: tradeSlugs,
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      haptic('success');
      onPublished();
    },
    onError: (err) => {
      haptic('error');
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't publish";
      Alert.alert("Couldn't publish", msg);
    },
  });

  const toggleTrade = (slug: string) => {
    haptic('selection');
    setTradeSlugs((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.45)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <View
          style={{
            backgroundColor: theme.bg.canvas,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: spacing.xl,
            paddingBottom: spacing['2xl'],
            gap: spacing.lg,
            maxHeight: '88%',
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.default,
              marginBottom: spacing.xs,
            }}
          />

          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.6,
                color: theme.text.tertiary,
              }}
            >
              AVAILABILITY BEACON
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.primary,
                letterSpacing: -0.3,
              }}
            >
              {existing ? 'Update your beacon' : 'Broadcast to nearby employers'}
            </Text>
            <Text
              style={{ fontSize: 13, lineHeight: 19, color: theme.text.secondary }}
            >
              Employers within ~10 km will see you in their &quot;workers
              available now&quot; list with one-tap call.
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.lg }}
          >
            {/* Duration */}
            <View style={{ gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 1.4,
                  color: theme.text.tertiary,
                }}
              >
                HOW LONG?
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {DURATION_OPTIONS.map((o) => {
                  const active = minutes === o.minutes;
                  return (
                    <Pressable
                      key={o.minutes}
                      onPress={() => {
                        haptic('selection');
                        setMinutes(o.minutes);
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: spacing.sm + 2,
                        borderRadius: radii.pill,
                        alignItems: 'center',
                        backgroundColor: active ? '#2563EB' : theme.bg.surface,
                        borderWidth: active ? 0 : 1,
                        borderColor: theme.border.default,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: active ? '#FFFFFF' : theme.text.primary,
                        }}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Trade chips */}
            <View style={{ gap: spacing.sm }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 1.4,
                  color: theme.text.tertiary,
                }}
              >
                WHAT WORK?
              </Text>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
              >
                {TRADES.map((t) => {
                  const active = tradeSlugs.includes(t.slug);
                  return (
                    <Pressable
                      key={t.slug}
                      onPress={() => toggleTrade(t.slug)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: radii.pill,
                        backgroundColor: active ? '#2563EB' : theme.bg.surface,
                        borderWidth: active ? 0 : 1,
                        borderColor: theme.border.default,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13 }}>{t.emoji}</Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: active ? '#FFFFFF' : theme.text.primary,
                        }}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Note */}
            <View style={{ gap: spacing.xs }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  letterSpacing: 1.4,
                  color: theme.text.tertiary,
                }}
              >
                NOTE FOR EMPLOYERS · OPTIONAL
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Have my own bike · can lift heavy"
                placeholderTextColor={theme.text.tertiary}
                style={{
                  backgroundColor: theme.bg.surface,
                  borderWidth: 0.5,
                  borderColor: theme.border.subtle,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 2,
                  fontSize: 15,
                  color: theme.text.primary,
                }}
                maxLength={240}
              />
            </View>
          </ScrollView>

          {/* Sticky CTA */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => {
                haptic('light');
                onClose();
              }}
              style={({ pressed }) => ({
                paddingVertical: 14,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: theme.border.default,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: theme.text.primary }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Broadcast availability"
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#2563EB',
                opacity: publishMutation.isPending ? 0.5 : pressed ? 0.85 : 1,
                shadowColor: '#2563EB',
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
                {publishMutation.isPending
                  ? 'Broadcasting…'
                  : existing
                    ? 'Update'
                    : 'Broadcast'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.round((target - Date.now()) / 60_000));
}

function formatLeft(minutes: number): string {
  if (minutes < 1) return 'expiring';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
