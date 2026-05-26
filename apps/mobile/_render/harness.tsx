/* eslint-disable */
// Self-contained web harness — renders the real AvailabilityBeaconSheet
// component via react-native-web so the actual implementation is visible
// in a browser. Lives outside src/ so it never ships with the app.

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  Text,
} from 'react-native-web';

import { spacing, radii } from '@doondo/tokens';
import { TRADES, tradeShortLabel } from '../src/lib/trades';

// ─── Stubs for the things that can't run on the web harness ────────────

const theme = {
  bg: { canvas: '#FFFFFF', surface: '#FFFFFF', muted: '#F8FAFC' },
  text: { primary: '#0F172A', secondary: '#475569', tertiary: '#94A3B8' },
  border: { default: '#E2E8F0', strong: '#CBD5E1', subtle: '#EEF2F7' },
};
const useTheme = () => ({ theme });

const STR: Record<string, string> = {
  'home.beacon.sheet.eyebrow': 'AVAILABILITY BEACON',
  'home.beacon.sheet.title_new': 'Broadcast to nearby employers',
  'home.beacon.sheet.title_existing': 'Update your beacon',
  'home.beacon.sheet.body':
    'Employers within ~10 km will see you in their "workers available now" list with one-tap call.',
  'home.beacon.sheet.duration_title': 'HOW LONG?',
  'home.beacon.sheet.duration_1h_sub': '1 hour',
  'home.beacon.sheet.duration_2h_sub': '2 hours',
  'home.beacon.sheet.duration_4h_sub': 'Half day',
  'home.beacon.sheet.duration_8h_sub': 'Full day',
  'home.beacon.sheet.what_work_title': 'WHAT WORK?',
  'home.beacon.sheet.selected_count': '{count} selected',
  'home.beacon.sheet.note_title': 'NOTE FOR EMPLOYERS · OPTIONAL',
  'home.beacon.sheet.note_placeholder': 'e.g. Have my own bike · can lift heavy',
  'home.beacon.sheet.schedule_title': 'WEEKLY SCHEDULE · OPTIONAL',
  'home.beacon.sheet.repeat_weekly_title': 'Repeat every week',
  'home.beacon.sheet.repeat_weekly_hint':
    'Stay live on the same days + window without raising the beacon every day.',
  'home.beacon.sheet.from': 'FROM',
  'home.beacon.sheet.to': 'TO',
  'home.beacon.sheet.format_hint':
    'Format HH:MM (24h). The beacon goes live automatically inside this window on the picked days.',
  'home.beacon.sheet.broadcast_now': 'Broadcast now',
  'home.beacon.sheet.update_beacon': 'Update beacon',
  'home.beacon.sheet.broadcasting': 'Broadcasting…',
  'home.beacon.sheet.hint_need_trade': 'Pick at least one type of work to broadcast.',
  'home.beacon.sheet.hint_need_day': 'Pick at least one day for the weekly schedule.',
  'home.beacon.sheet.time_error': 'Enter a valid window — HH:MM (24h), end after start.',
  'home.beacon.sheet.summary_ready':
    'Ready — nearby employers will see you the moment you broadcast.',
  'common.cancel': 'Cancel',
};
const useTranslate =
  () =>
  (key: string, opts?: Record<string, unknown>): string => {
    let s = STR[key] ?? key;
    if (opts)
      for (const k of Object.keys(opts))
        s = s.split('{{' + k + '}}').join(String(opts[k]))
              .split('{' + k + '}').join(String(opts[k]));
    return s;
  };

const haptic = (_kind: string) => {};

const useMutation = () => ({ isPending: false, mutate: () => {} });

// ─── Module-scope constants copied verbatim from AvailabilityBeacon.tsx ─

const DURATION_OPTIONS = [
  { minutes: 60, label: '1h', subKey: 'home.beacon.sheet.duration_1h_sub' },
  { minutes: 120, label: '2h', subKey: 'home.beacon.sheet.duration_2h_sub' },
  { minutes: 240, label: '4h', subKey: 'home.beacon.sheet.duration_4h_sub' },
  { minutes: 480, label: '8h', subKey: 'home.beacon.sheet.duration_8h_sub' },
] as const;

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SCREEN_W = 380;
const TRADE_GRID_PADDING = 24 * 2;
const TRADE_GRID_GAPS = 8 * 3;
const TRADE_TILE_WIDTH = Math.floor(
  (SCREEN_W - TRADE_GRID_PADDING - TRADE_GRID_GAPS) / 4,
);

// ─── SectionLabel — copied from the real file ──────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
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

// ─── AvailabilityBeaconSheet — copied verbatim, only stubs swapped ─────

function AvailabilityBeaconSheet({
  preselectTrades,
}: {
  preselectTrades?: string[];
}) {
  const { theme } = useTheme();
  const t = useTranslate();

  const [minutes, setMinutes] = useState<number>(120);
  const [tradeSlugs, setTradeSlugs] = useState<string[]>(preselectTrades ?? []);
  const [note, setNote] = useState<string>('');
  const [recurring, setRecurring] = useState<boolean>(true);
  const [recurringDays, setRecurringDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [recurringStart, setRecurringStart] = useState<string>('07:00');
  const [recurringEnd, setRecurringEnd] = useState<string>('10:00');

  const publishMutation = useMutation();

  const toggleTrade = (slug: string) => {
    haptic('selection');
    setTradeSlugs((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  const startTimeValid = TIME_RE.test(recurringStart);
  const endTimeValid = TIME_RE.test(recurringEnd);
  const timeRangeValid =
    startTimeValid && endTimeValid && recurringStart < recurringEnd;
  const scheduleValid =
    !recurring || (recurringDays.length > 0 && timeRangeValid);
  const hasTrade = tradeSlugs.length > 0;
  const canPublish = hasTrade && scheduleValid;
  const startFieldBad = recurring && !startTimeValid;
  const endFieldBad =
    recurring &&
    (!endTimeValid || (startTimeValid && endTimeValid && !timeRangeValid));
  const blockReason: 'trade' | 'day' | 'time' | null = !hasTrade
    ? 'trade'
    : recurring && recurringDays.length === 0
      ? 'day'
      : recurring && !timeRangeValid
        ? 'time'
        : null;
  const todayIndex = new Date().getDay();

  return (
    <View
      style={{
        backgroundColor: theme.bg.canvas,
        borderTopLeftRadius: radii.xl,
        borderTopRightRadius: radii.xl,
        padding: spacing.xl,
        paddingBottom: spacing['2xl'],
        gap: spacing.lg,
        width: SCREEN_W,
      }}
    >
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
          {t('home.beacon.sheet.title_new')}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: theme.text.secondary }}>
          {t('home.beacon.sheet.body')}
        </Text>
      </View>

      <View style={{ gap: spacing.lg }}>
        {/* Duration */}
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{t('home.beacon.sheet.duration_title')}</SectionLabel>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {DURATION_OPTIONS.map((o) => {
              const active = minutes === o.minutes;
              const sub = t(o.subKey);
              return (
                <Pressable
                  key={o.minutes}
                  onPress={() => setMinutes(o.minutes)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.md,
                    paddingHorizontal: 4,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: active ? '#1D4ED8' : theme.bg.surface,
                    borderWidth: 1,
                    borderColor: active ? '#1E3A8A' : theme.border.default,
                    boxShadow: active
                      ? '0 4px 10px rgba(37,99,235,0.28)'
                      : '0 1px 3px rgba(15,23,42,0.04)',
                  }}
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

        {/* Trade grid */}
        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <SectionLabel>{t('home.beacon.sheet.what_work_title')}</SectionLabel>
            {tradeSlugs.length > 0 ? (
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 2,
                  borderRadius: radii.pill,
                  backgroundColor: '#DBEAFE',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E40AF' }}>
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
                  style={{
                    width: TRADE_TILE_WIDTH,
                    paddingVertical: spacing.sm + 2,
                    paddingHorizontal: 6,
                    borderRadius: radii.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    backgroundColor: active ? '#1D4ED8' : theme.bg.surface,
                    borderWidth: 1,
                    borderColor: active ? '#1E3A8A' : theme.border.default,
                    boxShadow: active
                      ? '0 2px 6px rgba(37,99,235,0.22)'
                      : '0 2px 3px rgba(15,23,42,0.04)',
                  }}
                >
                  <Text style={{ fontSize: 22, lineHeight: 26 }}>{tradeItem.emoji}</Text>
                  <Text
                    numberOfLines={1}
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
          <SectionLabel>{t('home.beacon.sheet.note_title')}</SectionLabel>
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

        {/* Recurring schedule */}
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{t('home.beacon.sheet.schedule_title')}</SectionLabel>
          <Pressable
            onPress={() => setRecurring((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radii.lg,
              borderWidth: 0.5,
              borderColor: recurring ? '#2563EB' : theme.border.default,
              backgroundColor: recurring ? '#EFF6FF' : theme.bg.surface,
            }}
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
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>✓</Text>
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
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {DAY_LABELS.map((label, i) => {
                  const active = recurringDays.includes(i);
                  const isToday = i === todayIndex;
                  return (
                    <Pressable
                      key={i}
                      onPress={() =>
                        setRecurringDays((cur) =>
                          cur.includes(i)
                            ? cur.filter((d) => d !== i)
                            : [...cur, i].sort((a, b) => a - b),
                        )
                      }
                      style={{
                        flex: 1,
                        height: 44,
                        borderRadius: radii.md,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? '#1D4ED8' : theme.bg.surface,
                        borderWidth: 1,
                        borderColor: active
                          ? '#1E3A8A'
                          : isToday
                            ? '#93C5FD'
                            : theme.border.default,
                      }}
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

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}>
                    {t('home.beacon.sheet.from')}
                  </Text>
                  <TextInput
                    value={recurringStart}
                    onChangeText={setRecurringStart}
                    placeholder="07:00"
                    placeholderTextColor={theme.text.tertiary}
                    style={{
                      backgroundColor: startFieldBad ? '#FEF2F2' : theme.bg.surface,
                      borderWidth: 1,
                      borderColor: startFieldBad ? '#DC2626' : theme.border.default,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm + 2,
                      fontSize: 15,
                      color: startFieldBad ? '#DC2626' : theme.text.primary,
                    }}
                    maxLength={5}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.text.tertiary }}>
                    {t('home.beacon.sheet.to')}
                  </Text>
                  <TextInput
                    value={recurringEnd}
                    onChangeText={setRecurringEnd}
                    placeholder="10:00"
                    placeholderTextColor={theme.text.tertiary}
                    style={{
                      backgroundColor: endFieldBad ? '#FEF2F2' : theme.bg.surface,
                      borderWidth: 1,
                      borderColor: endFieldBad ? '#DC2626' : theme.border.default,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm + 2,
                      fontSize: 15,
                      color: endFieldBad ? '#DC2626' : theme.text.primary,
                    }}
                    maxLength={5}
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
      </View>

      {/* Status line */}
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

      {/* Footer */}
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
          onPress={() => {}}
          style={{
            paddingVertical: 16,
            paddingHorizontal: spacing.xl,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.bg.surface,
            borderWidth: 1,
            borderColor: theme.border.default,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text.secondary }}>
            {t('common.cancel')}
          </Text>
        </Pressable>
        <Pressable
          disabled={!canPublish}
          onPress={() => publishMutation.mutate()}
          style={{
            flex: 1,
            paddingVertical: 16,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canPublish ? '#1D4ED8' : '#CBD5E1',
            borderWidth: canPublish ? 1 : 0,
            borderColor: '#1E3A8A',
            boxShadow: canPublish ? '0 6px 14px rgba(29,78,216,0.35)' : 'none',
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: canPublish ? '#FFFFFF' : '#EEF2F7',
              letterSpacing: 0.2,
            }}
          >
            {t('home.beacon.sheet.broadcast_now')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Page chrome — phone-shaped frame + caption ─────────────────────────

function Page() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b1220',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 12px 40px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        gap: 18,
      }}
    >
      <div style={{ color: '#94a3b8', fontSize: 12, letterSpacing: 0.5 }}>
        Real component · react-native-web · Doondo seeker home
      </div>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Frame caption="Empty state (button guarded)">
          <AvailabilityBeaconSheet />
        </Frame>
        <Frame caption="Two trades selected (ready)">
          <AvailabilityBeaconSheet preselectTrades={['cook', 'helper']} />
        </Frame>
      </div>
      <div style={{ color: '#64748b', fontSize: 11, maxWidth: 720, textAlign: 'center', lineHeight: 1.5 }}>
        Rendered from the same JSX, tokens and styles that ship in apps/mobile/src/screens/seeker/home/AvailabilityBeacon.tsx.
        Try clicking trade tiles, day chips, and editing the time fields — the status line and Broadcast button update live.
      </div>
    </div>
  );
}

function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          padding: 8,
          background: '#0b1220',
          borderRadius: 36,
          border: '1px solid #1f2937',
        }}
      >
        <div style={{ borderRadius: 30, overflow: 'hidden', background: '#dfe5ee', width: 380 }}>
          <div style={{ background: '#dfe5ee', padding: '12px 14px 20px' }}>
            <div style={{ display: 'flex', gap: 5, background: '#cdd6e3', borderRadius: 10, padding: 4 }}>
              <Tab>Today</Tab>
              <Tab>This week</Tab>
              <Tab active>Career</Tab>
            </div>
          </div>
          <div style={{ marginTop: -12 }}>{children}</div>
        </div>
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 12 }}>{caption}</div>
    </div>
  );
}

function Tab({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
        color: active ? '#fff' : '#64748b',
        background: active ? '#2563eb' : 'transparent',
        padding: '7px 0',
        borderRadius: 7,
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Page />);
