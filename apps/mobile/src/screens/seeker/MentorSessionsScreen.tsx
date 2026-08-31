/**
 * MentorSessionsScreen — "My Sessions" for the mentor calendar.
 *
 * Two things happen here:
 *   1. As a mentor: open new bookable time slots (date/time/mode chips —
 *      same no-native-picker pattern the employer's Schedule Interview
 *      sheet already uses), and see your own open + booked slots.
 *   2. As either side: see your upcoming booked sessions and cancel one.
 *
 * Booking a specific mentor's open slot happens from BookMentorSessionScreen
 * (reached from an accepted mentorship request on MentorsScreen) — this
 * screen is the calendar, not the discovery/booking flow.
 */
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing } from '@doondo/tokens';
import { Screen, Text, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { mentorsApi, type MentorSessionMode, type PublicMentorSession } from '@/api/mentors.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const DATE_OFFSETS = [
  { labelKey: 'today', offset: 0 },
  { labelKey: 'tomorrow', offset: 1 },
  { labelKey: 'in_2_days', offset: 2 },
  { labelKey: 'in_3_days', offset: 3 },
  { labelKey: 'in_1_week', offset: 7 },
];
const HOURS = [9, 11, 14, 16, 18];
const MODES: MentorSessionMode[] = ['video', 'phone', 'in_person'];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? theme.brand.primary : theme.border.subtle,
        backgroundColor: active ? theme.brand.primarySubtle : 'transparent',
      }}
    >
      <Text
        style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? theme.brand.primary : theme.text.secondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AddSlotForm({ t, onCreated }: { t: TFn; onCreated: () => void }) {
  const { theme } = useTheme();
  const [dateOffset, setDateOffset] = useState(1);
  const [hour, setHour] = useState(9);
  const [mode, setMode] = useState<MentorSessionMode>('video');

  const mut = useMutation({
    mutationFn: () => {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset);
      d.setHours(hour, 0, 0, 0);
      return mentorsApi.openSlot({ scheduledFor: d.toISOString(), mode });
    },
    onSuccess: () => {
      haptic('success');
      onCreated();
    },
    onError: (err) => Alert.alert(t('mentor_sessions.error_title'), (err as Error).message ?? t('mentor_sessions.error_default')),
  });

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.tertiary }}>
          {t('mentor_sessions.date_label')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {DATE_OFFSETS.map(({ labelKey, offset }) => (
            <Chip
              key={offset}
              label={t(`mentor_sessions.${labelKey}`)}
              active={dateOffset === offset}
              onPress={() => {
                haptic('selection');
                setDateOffset(offset);
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.tertiary }}>
          {t('mentor_sessions.time_label')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {HOURS.map((h) => (
            <Chip
              key={h}
              label={h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}
              active={hour === h}
              onPress={() => {
                haptic('selection');
                setHour(h);
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.tertiary }}>
          {t('mentor_sessions.mode_label')}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {MODES.map((m) => (
            <Chip
              key={m}
              label={t(`mentor_sessions.mode_${m}`)}
              active={mode === m}
              onPress={() => {
                haptic('selection');
                setMode(m);
              }}
            />
          ))}
        </View>
      </View>
      <Button
        label={mut.isPending ? t('mentor_sessions.adding') : t('mentor_sessions.add_slot_cta')}
        onPress={() => mut.mutate()}
        disabled={mut.isPending}
      />
    </View>
  );
}

function SessionRow({
  session,
  viewerIsMentor,
  t,
  onCancel,
  cancelling,
}: {
  session: PublicMentorSession;
  viewerIsMentor: boolean;
  t: TFn;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { theme } = useTheme();
  const counterpart = viewerIsMentor ? session.menteeName : session.mentorName;
  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.lg,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}>
        {formatDateTime(session.scheduledFor)}
      </Text>
      <Text style={{ fontSize: 12, color: theme.text.secondary }}>
        {t('mentor_sessions.duration', { minutes: session.durationMinutes })} ·{' '}
        {t(`mentor_sessions.mode_${session.mode}`)}
        {counterpart ? ` · ${counterpart}` : ''}
      </Text>
      {session.status === 'open' ? (
        <Text style={{ fontSize: 11, color: theme.status.info }}>{t('mentor_sessions.status_open')}</Text>
      ) : null}
      {(session.status === 'open' || session.status === 'booked') && (
        <View style={{ marginTop: spacing.xs }}>
          <Button
            label={cancelling ? t('mentor_sessions.cancelling') : t('mentor_sessions.cancel_cta')}
            variant="ghost"
            size="sm"
            fullWidth={false}
            disabled={cancelling}
            onPress={onCancel}
          />
        </View>
      )}
    </View>
  );
}

function Inner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['mentors', 'sessions', 'mine'],
    queryFn: () => mentorsApi.mySessions(),
  });

  const cancelMut = useMutation({
    mutationFn: (sessionId: string) => mentorsApi.cancelSession(sessionId),
    onMutate: (sessionId) => setCancellingId(sessionId),
    onSuccess: () => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['mentors', 'sessions', 'mine'] });
    },
    onError: (err) => Alert.alert(t('mentor_sessions.error_title'), (err as Error).message ?? t('mentor_sessions.error_default')),
    onSettled: () => setCancellingId(null),
  });

  const asMentor = query.data?.asMentor ?? [];
  const asMentee = query.data?.asMentee ?? [];
  const openSlots = asMentor.filter((s) => s.status === 'open');
  const booked = [...asMentor.filter((s) => s.status === 'booked'), ...asMentee.filter((s) => s.status === 'booked')].sort(
    (a, b) => a.scheduledFor.localeCompare(b.scheduledFor),
  );

  return (
    <Screen edges={[]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.border.subtle,
        }}
      >
        <Text
          onPress={() => navigation.goBack()}
          style={{ fontSize: 22, color: theme.text.primary }}
          accessibilityRole="button"
        >
          ←
        </Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.primary }}>
          {t('mentor_sessions.title')}
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['5xl'], gap: spacing.xl }}>
          {/* Booked sessions — both sides */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
              {t('mentor_sessions.booked_section')}
            </Text>
            {booked.length === 0 ? (
              <EmptyState title={t('mentor_sessions.booked_empty')} />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {booked.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    viewerIsMentor={asMentor.some((m) => m.id === s.id)}
                    t={t}
                    cancelling={cancellingId === s.id}
                    onCancel={() => cancelMut.mutate(s.id)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Mentor tools — offer new slots, see what's still open */}
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
              {t('mentor_sessions.mentor_section')}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.tertiary }}>
              {t('mentor_sessions.mentor_hint')}
            </Text>

            {openSlots.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                {openSlots.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    viewerIsMentor
                    t={t}
                    cancelling={cancellingId === s.id}
                    onCancel={() => cancelMut.mutate(s.id)}
                  />
                ))}
              </View>
            )}

            {showAddForm ? (
              <AddSlotForm
                t={t}
                onCreated={() => {
                  setShowAddForm(false);
                  void queryClient.invalidateQueries({ queryKey: ['mentors', 'sessions', 'mine'] });
                }}
              />
            ) : (
              <Button
                label={t('mentor_sessions.add_slot_cta')}
                variant="secondary"
                onPress={() => {
                  haptic('selection');
                  setShowAddForm(true);
                }}
              />
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

export function MentorSessionsScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
