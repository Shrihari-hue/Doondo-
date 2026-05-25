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

import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Dimensions,
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
import { TRADES, tradeShortLabel } from '@/lib/trades';
import { useTranslate } from '@/i18n/useTranslate';
import {
  availabilityApi,
  type PublicAvailability,
} from '@/api/availability.api';
import { ApiError } from '@/api/errors';
import type { Coords } from '@/lib/location';
import type { PublicUser } from '@/api/types';

// `subKey` is a translation key into home.beacon.sheet — the actual
// displayed string is resolved at render time so the labels follow the
// user's active locale rather than being baked in at module load.
const DURATION_OPTIONS = [
  { minutes: 60, label: '1h', subKey: 'home.beacon.sheet.duration_1h_sub' },
  { minutes: 120, label: '2h', subKey: 'home.beacon.sheet.duration_2h_sub' },
  { minutes: 240, label: '4h', subKey: 'home.beacon.sheet.duration_4h_sub' },
  { minutes: 480, label: '8h', subKey: 'home.beacon.sheet.duration_8h_sub' },
] as const;

// Day chips render Sunday-first; the index is the value stored in
// `recurringPattern.days`. Two-letter codes replace the old single-letter
// row where Sun/Sat and Tue/Thu were indistinguishable.
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

// A beacon time is strict 24h HH:MM. Anchored so "7:00", "24:10" and
// "9:5" are all rejected before the payload is ever built.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Trade grid sizing — 4 columns with consistent gaps. We compute once at
// module load instead of on every render: the sheet width is the full
// screen, padding is `spacing.xl` (24) on each side, gap is `spacing.sm`
// (8) between tiles. Floor the result so we never overflow on odd widths.
const SCREEN_W = Dimensions.get('window').width;
const TRADE_GRID_PADDING = 24 * 2; // matches sheet's paddingHorizontal
const TRADE_GRID_GAPS = 8 * 3; // 3 gaps between 4 columns
const TRADE_TILE_WIDTH = Math.floor(
  (SCREEN_W - TRADE_GRID_PADDING - TRADE_GRID_GAPS) / 4,
);

// ─── Chip — always visible row on Home ──────────────────────────────────────

export function AvailabilityBeaconChip({
  coords,
  user,
}: {
  coords: Coords | null;
  user: PublicUser | null;
}) {
  const { theme } = useTheme();
  const t = useTranslate();
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
      Alert.alert(t('home.beacon.couldnt_withdraw_title'), t('home.beacon.couldnt_withdraw_body'));
    },
  });

  const active = query.data?.availability ?? null;
  const minutesLeft = active ? minutesUntil(active.until) : null;
  const isLive = active != null && minutesLeft != null && minutesLeft > 0;

  const onWithdraw = () => {
    Alert.alert(
      t('home.beacon.stop_confirm_title'),
      t('home.beacon.stop_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('home.beacon.stop'),
          style: 'destructive',
          onPress: () => withdrawMutation.mutate(),
        },
      ],
    );
  };

  // Card background lives on a wrapper View so the chip can't ever drop
  // to a floating-text state on the light canvas. Borders are bumped to
  // 1px and a soft shadow lifts the card off the page.
  return (
    <>
      <View
        style={{
          borderRadius: radii.lg,
          backgroundColor: isLive ? '#ECFDF5' : '#EFF6FF',
          borderWidth: 1,
          borderColor: isLive ? '#86EFAC' : '#0855b3',
          shadowColor: isLive ? '#10B981' : '#2563EB',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
      <Pressable
        onPress={() => {
          haptic('selection');
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          isLive ? t('home.beacon.chip_a11y_active') : t('home.beacon.chip_a11y_inactive')
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        {/* Row layout lives on this static inner View — keeping
           `flexDirection: 'row'` on the Pressable style function let RN
           collapse the icon + text into a column on some builds. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radii.lg,
          }}
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
                ? t('home.beacon.chip_active_title', { left: formatLeft(minutesLeft!, t) })
                : t('home.beacon.chip_inactive_title')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: isLive ? '#047857' : '#1E3A8A',
              }}
              numberOfLines={1}
            >
              {isLive
                ? t('home.beacon.chip_active_hint', { time: formatClock(active!.until) })
                : t('home.beacon.chip_inactive_hint')}
            </Text>
          </View>
          {isLive ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onWithdraw();
              }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: radii.pill,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 0.5,
                  borderColor: '#A7F3D0',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>
                  {t('home.beacon.stop')}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      </View>

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
  const t = useTranslate();

  const [minutes, setMinutes] = useState<number>(120);
  const [tradeSlugs, setTradeSlugs] = useState<string[]>(
    existing?.tradesAvailable ?? user?.skills ?? [],
  );
  const [note, setNote] = useState<string>(existing?.note ?? '');
  // Recurring schedule — when on, this beacon also goes live every week
  // during the picked days+window. Off = one-shot beacon.
  const [recurring, setRecurring] = useState<boolean>(
    existing?.recurringPattern != null,
  );
  const [recurringDays, setRecurringDays] = useState<number[]>(
    existing?.recurringPattern?.days ?? [1, 2, 3, 4, 5],
  );
  const [recurringStart, setRecurringStart] = useState<string>(
    existing?.recurringPattern?.startTime ?? '07:00',
  );
  const [recurringEnd, setRecurringEnd] = useState<string>(
    existing?.recurringPattern?.endTime ?? '10:00',
  );

  // Re-seed when the sheet re-opens with new data. This is a genuine
  // side effect — it calls setState — so it belongs in useEffect. It
  // previously ran inside useMemo, which mutates state during render and
  // is an anti-pattern React does not guarantee.
  useEffect(() => {
    if (!visible) return;
    setTradeSlugs(existing?.tradesAvailable ?? user?.skills ?? []);
    setNote(existing?.note ?? '');
    setRecurring(existing?.recurringPattern != null);
    setRecurringDays(existing?.recurringPattern?.days ?? [1, 2, 3, 4, 5]);
    setRecurringStart(existing?.recurringPattern?.startTime ?? '07:00');
    setRecurringEnd(existing?.recurringPattern?.endTime ?? '10:00');
  }, [visible, existing, user?.skills]);

  const publishMutation = useMutation({
    mutationFn: () => {
      if (!coords) {
        throw new Error(t('home.beacon.sheet.location_needed_error'));
      }
      // Build the recurring payload only when toggle is on AND at
      // least one day is picked. End must be after start.
      const recurringPayload =
        recurring &&
        recurringDays.length > 0 &&
        TIME_RE.test(recurringStart) &&
        TIME_RE.test(recurringEnd) &&
        recurringStart < recurringEnd
          ? {
              days: recurringDays,
              startTime: recurringStart,
              endTime: recurringEnd,
            }
          : null;
      return availabilityApi.publish({
        durationMinutes: minutes,
        lat: coords.lat,
        lng: coords.lng,
        city: user?.location?.city ?? null,
        area: user?.location?.area ?? null,
        tradesAvailable: tradeSlugs,
        note: note.trim() || null,
        recurringPattern: recurringPayload,
      });
    },
    onSuccess: () => {
      haptic('success');
      onPublished();
    },
    onError: (err) => {
      haptic('error');
      const fallback = t('home.beacon.sheet.couldnt_publish_title');
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : fallback;
      Alert.alert(fallback, msg);
    },
  });

  const toggleTrade = (slug: string) => {
    haptic('selection');
    setTradeSlugs((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  // ─── Form validity ────────────────────────────────────────────────────
  // The publish button only goes live when the beacon is genuinely
  // broadcastable. The old screen always fired and let the server
  // silently drop an empty trade list or a half-built schedule — the
  // worker ended up with a beacon no employer could find. The sheet now
  // blocks early and names the one thing still missing.
  const startTimeValid = TIME_RE.test(recurringStart);
  const endTimeValid = TIME_RE.test(recurringEnd);
  const timeRangeValid =
    startTimeValid && endTimeValid && recurringStart < recurringEnd;
  const scheduleValid =
    !recurring || (recurringDays.length > 0 && timeRangeValid);
  const hasTrade = tradeSlugs.length > 0;
  const canPublish = hasTrade && scheduleValid;

  // Per-field error flags for the time inputs.
  const startFieldBad = recurring && !startTimeValid;
  const endFieldBad =
    recurring &&
    (!endTimeValid || (startTimeValid && endTimeValid && !timeRangeValid));

  // First blocking reason, in priority order — drives the status line.
  const blockReason: 'trade' | 'day' | 'time' | null = !hasTrade
    ? 'trade'
    : recurring && recurringDays.length === 0
      ? 'day'
      : recurring && !timeRangeValid
        ? 'time'
        : null;

  const todayIndex = new Date().getDay();

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
              {t('home.beacon.sheet.eyebrow')}
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.primary,
                letterSpacing: -0.3,
              }}
            >
              {existing
                ? t('home.beacon.sheet.title_existing')
                : t('home.beacon.sheet.title_new')}
            </Text>
            <Text
              style={{ fontSize: 13, lineHeight: 19, color: theme.text.secondary }}
            >
              {t('home.beacon.sheet.body')}
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xs }}
            showsVerticalScrollIndicator={false}
          >
            {/* Duration — elevated tiles with a primary label + descriptor.
               Active tile fills blue with a soft glow so the selection is
               obvious at a glance instead of reading as fade-on-fade. */}
            <View style={{ gap: spacing.sm }}>
              <SectionLabel theme={theme}>{t('home.beacon.sheet.duration_title')}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {DURATION_OPTIONS.map((o) => {
                  const active = minutes === o.minutes;
                  const sub = t(o.subKey);
                  return (
                    <Pressable
                      key={o.minutes}
                      onPress={() => {
                        haptic('selection');
                        setMinutes(o.minutes);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={
                        active
                          ? t('home.beacon.sheet.duration_a11y_selected', { sub })
                          : t('home.beacon.sheet.duration_a11y', { sub })
                      }
                      style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: spacing.md,
                        paddingHorizontal: 4,
                        borderRadius: radii.lg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        backgroundColor: active ? '#2563EB' : theme.bg.surface,
                        borderWidth: active ? 0 : 1,
                        borderColor: theme.border.default,
                        opacity: pressed ? 0.85 : 1,
                        shadowColor: active ? '#2563EB' : '#0F172A',
                        shadowOffset: { width: 0, height: active ? 4 : 1 },
                        shadowOpacity: active ? 0.28 : 0.04,
                        shadowRadius: active ? 10 : 3,
                        elevation: active ? 3 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          lineHeight: 22,
                          fontWeight: '800',
                          letterSpacing: -0.3,
                          color: active ? '#FFFFFF' : theme.text.primary,
                        }}
                      >
                        {o.label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          letterSpacing: 0.2,
                          color: active ? 'rgba(255,255,255,0.85)' : theme.text.tertiary,
                        }}
                      >
                        {sub}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Trade chips — 4-column card grid. Each tile is self-contained:
               emoji on top, short label below, single line with auto-shrink
               so nothing wraps or runs into a neighbour. */}
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <SectionLabel theme={theme}>{t('home.beacon.sheet.what_work_title')}</SectionLabel>
                {tradeSlugs.length > 0 ? (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 2,
                      borderRadius: radii.pill,
                      backgroundColor: '#DBEAFE',
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF' }}
                    >
                      {t('home.beacon.sheet.selected_count', { count: tradeSlugs.length })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                }}
              >
                {TRADES.map((tradeItem) => {
                  const active = tradeSlugs.includes(tradeItem.slug);
                  return (
                    <Pressable
                      key={tradeItem.slug}
                      onPress={() => toggleTrade(tradeItem.slug)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={
                        active
                          ? t('home.beacon.sheet.trade_a11y_selected', { label: tradeItem.label })
                          : t('home.beacon.sheet.trade_a11y', { label: tradeItem.label })
                      }
                      style={({ pressed }) => ({
                        width: TRADE_TILE_WIDTH,
                        paddingVertical: spacing.sm + 2,
                        paddingHorizontal: 6,
                        borderRadius: radii.lg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        backgroundColor: active ? '#2563EB' : theme.bg.surface,
                        borderWidth: active ? 0 : 1,
                        borderColor: theme.border.default,
                        opacity: pressed ? 0.75 : 1,
                        shadowColor: active ? '#2563EB' : '#0F172A',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: active ? 0.22 : 0.04,
                        shadowRadius: active ? 6 : 3,
                        elevation: active ? 2 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 22, lineHeight: 26 }}>{tradeItem.emoji}</Text>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          textAlign: 'center',
                          color: active ? '#FFFFFF' : theme.text.primary,
                        }}
                      >
                        {tradeShortLabel(tradeItem)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Note */}
            <View style={{ gap: spacing.sm }}>
              <SectionLabel theme={theme}>{t('home.beacon.sheet.note_title')}</SectionLabel>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('home.beacon.sheet.note_placeholder')}
                placeholderTextColor={theme.text.tertiary}
                style={{
                  backgroundColor: theme.bg.surface,
                  borderWidth: 1,
                  borderColor: theme.border.default,
                  borderRadius: radii.lg,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  fontSize: 15,
                  color: theme.text.primary,
                  minHeight: 48,
                }}
                maxLength={240}
              />
            </View>

            {/* Recurring weekly schedule */}
            <View style={{ gap: spacing.sm }}>
              <SectionLabel theme={theme}>{t('home.beacon.sheet.schedule_title')}</SectionLabel>
              <Pressable
                onPress={() => {
                  haptic('selection');
                  setRecurring((v) => !v);
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: recurring }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                  borderWidth: 0.5,
                  borderColor: recurring ? '#2563EB' : theme.border.default,
                  backgroundColor: recurring ? '#EFF6FF' : theme.bg.surface,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: recurring ? '#2563EB' : theme.border.strong,
                    backgroundColor: recurring ? '#2563EB' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {recurring ? (
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: recurring ? '#1E3A8A' : theme.text.primary,
                    }}
                  >
                    {t('home.beacon.sheet.repeat_weekly_title')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: recurring ? '#475569' : theme.text.secondary,
                    }}
                  >
                    {t('home.beacon.sheet.repeat_weekly_hint')}
                  </Text>
                </View>
              </Pressable>

              {recurring ? (
                <View style={{ gap: spacing.sm }}>
                  {/* Day chips — Sunday-first, two-letter codes so the
                     row is unambiguous and never wraps. Today carries a
                     soft accent border when it isn't already selected. */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {DAY_LABELS.map((label, i) => {
                      const active = recurringDays.includes(i);
                      const isToday = i === todayIndex;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            haptic('selection');
                            setRecurringDays((cur) =>
                              cur.includes(i)
                                ? cur.filter((d) => d !== i)
                                : [...cur, i].sort((a, b) => a - b),
                            );
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={
                            active
                              ? t('home.beacon.sheet.day_a11y_selected', { n: i })
                              : t('home.beacon.sheet.day_a11y', { n: i })
                          }
                          style={({ pressed }) => ({
                            flex: 1,
                            height: 44,
                            borderRadius: radii.md,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: active ? '#2563EB' : theme.bg.surface,
                            borderWidth: active ? 0 : 1,
                            borderColor: active
                              ? '#2563EB'
                              : isToday
                                ? '#93C5FD'
                                : theme.border.default,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: active
                                ? '#FFFFFF'
                                : isToday
                                  ? '#1D4ED8'
                                  : theme.text.primary,
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Time range */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}
                      >
                        {t('home.beacon.sheet.from')}
                      </Text>
                      <TextInput
                        value={recurringStart}
                        onChangeText={setRecurringStart}
                        placeholder="07:00"
                        placeholderTextColor={theme.text.tertiary}
                        accessibilityLabel={t('home.beacon.sheet.from')}
                        style={{
                          backgroundColor: startFieldBad
                            ? '#FEF2F2'
                            : theme.bg.surface,
                          borderWidth: 1,
                          borderColor: startFieldBad
                            ? '#DC2626'
                            : theme.border.default,
                          borderRadius: radii.md,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm + 2,
                          fontSize: 15,
                          color: startFieldBad ? '#DC2626' : theme.text.primary,
                        }}
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}
                      >
                        {t('home.beacon.sheet.to')}
                      </Text>
                      <TextInput
                        value={recurringEnd}
                        onChangeText={setRecurringEnd}
                        placeholder="10:00"
                        placeholderTextColor={theme.text.tertiary}
                        accessibilityLabel={t('home.beacon.sheet.to')}
                        style={{
                          backgroundColor: endFieldBad
                            ? '#FEF2F2'
                            : theme.bg.surface,
                          borderWidth: 1,
                          borderColor: endFieldBad
                            ? '#DC2626'
                            : theme.border.default,
                          borderRadius: radii.md,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm + 2,
                          fontSize: 15,
                          color: endFieldBad ? '#DC2626' : theme.text.primary,
                        }}
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      lineHeight: 16,
                      fontWeight: timeRangeValid ? '400' : '600',
                      color: timeRangeValid ? theme.text.tertiary : '#DC2626',
                    }}
                  >
                    {timeRangeValid
                      ? t('home.beacon.sheet.format_hint')
                      : t('home.beacon.sheet.time_error')}
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          {/* Status line — replaces the old silent no-op. When the beacon
             is ready it confirms it; otherwise it names the single thing
             still blocking the broadcast. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radii.md,
              backgroundColor: canPublish ? '#ECFDF5' : '#FFF7ED',
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginTop: 4,
                backgroundColor: canPublish ? '#10B981' : '#F59E0B',
              }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                lineHeight: 17,
                fontWeight: '600',
                color: canPublish ? '#065F46' : '#9A3412',
              }}
            >
              {canPublish
                ? t('home.beacon.sheet.summary_ready')
                : blockReason === 'day'
                  ? t('home.beacon.sheet.hint_need_day')
                  : blockReason === 'time'
                    ? t('home.beacon.sheet.time_error')
                    : t('home.beacon.sheet.hint_need_trade')}
            </Text>
          </View>

          {/* Sticky CTA — Cancel sits as a quiet ghost button; the primary
             action is a tall blue pill with a real shadow so it feels
             tappable, not painted on. When the beacon isn't broadcastable
             yet the pill drops to a flat, shadowless disabled state. */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              paddingTop: spacing.sm,
              borderTopWidth: 0.5,
              borderTopColor: theme.border.subtle,
            }}
          >
            <Pressable
              onPress={() => {
                haptic('light');
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={({ pressed }) => ({
                paddingVertical: 16,
                paddingHorizontal: spacing.xl,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.bg.surface,
                borderWidth: 1,
                borderColor: theme.border.default,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{ fontSize: 15, fontWeight: '600', color: theme.text.secondary }}
              >
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !canPublish}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canPublish }}
              accessibilityLabel={t('home.beacon.sheet.broadcast_a11y')}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 16,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: canPublish ? '#2563EB' : '#CBD5E1',
                opacity: publishMutation.isPending ? 0.6 : pressed ? 0.9 : 1,
                shadowColor: '#1D4ED8',
                shadowOpacity: canPublish ? 0.35 : 0,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: canPublish ? 6 : 0,
              })}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: canPublish ? '#FFFFFF' : '#EEF2F7',
                  letterSpacing: 0.2,
                }}
              >
                {publishMutation.isPending
                  ? t('home.beacon.sheet.broadcasting')
                  : existing
                    ? t('home.beacon.sheet.update_beacon')
                    : t('home.beacon.sheet.broadcast_now')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Internal — section label used by the sheet ─────────────────────────────

function SectionLabel({
  theme,
  children,
}: {
  theme: ReturnType<typeof useTheme>['theme'];
  children: ReactNode;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.4,
        color: theme.text.secondary,
      }}
    >
      {children}
    </Text>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minutesUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.round((target - Date.now()) / 60_000));
}

function formatLeft(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes < 1) return t('home.beacon.expiring');
  if (minutes < 60) return t('home.beacon.minutes_short', { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0
    ? t('home.beacon.hours_short', { h })
    : t('home.beacon.hours_minutes_short', { h, m });
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
