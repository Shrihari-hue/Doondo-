/**
 * MentorSessionsScreen — my 1:1 mentor sessions, both sides.
 *   As a mentee: upcoming bookings, pay over UPI, cancel.
 *   As a mentor: publish open time slots, see who booked, confirm payment,
 *   mark done.
 */
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { mentorsApi, type MentorSession } from '@/api/mentors.api';

const TIMES = ['08:00', '10:00', '12:00', '15:00', '18:00', '20:00'];
const DURATIONS = [30, 45, 60];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function MentorSessionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ['mentor-sessions'], queryFn: mentorsApi.mySessions });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['mentor-sessions'] });
  const fail = (e: unknown) => Alert.alert(t('mentor_sessions.failed'), e instanceof Error ? e.message : undefined);

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'cancel' | 'paid' | 'complete' }) =>
      v.action === 'cancel' ? mentorsApi.cancelSession(v.id) : v.action === 'paid' ? mentorsApi.markSessionPaid(v.id) : mentorsApi.completeSession(v.id),
    onSuccess: () => { haptic('success'); refresh(); },
    onError: fail,
  });

  // Publish form
  const [dayOffset, setDayOffset] = useState(1);
  const [times, setTimes] = useState<string[]>([]);
  const [duration, setDuration] = useState(30);
  const [price, setPrice] = useState('0');
  const publish = useMutation({
    mutationFn: () => {
      const base = new Date();
      base.setDate(base.getDate() + dayOffset);
      const slots = times.map((tm) => {
        const [h, m] = tm.split(':').map(Number);
        const d = new Date(base);
        d.setHours(h!, m!, 0, 0);
        return { startAt: d.toISOString(), durationMinutes: duration, priceRupees: Math.max(0, Number(price) || 0) };
      });
      return mentorsApi.publishSlots(slots);
    },
    onSuccess: () => { haptic('success'); setTimes([]); refresh(); },
    onError: fail,
  });

  const data = q.data;
  const now = Date.now();
  const mentee = (data?.asMentee ?? []).filter((s) => s.status !== 'cancelled');
  const mentor = (data?.asMentor ?? []).filter((s) => s.status !== 'cancelled' && new Date(s.startAt).getTime() > now - 3 * 24 * 3600 * 1000);
  const isMentor = (data?.asMentor.length ?? 0) > 0;

  const Row = ({ s, side }: { s: MentorSession; side: 'mentor' | 'mentee' }) => {
    const paidByMentee = Boolean(s.payment?.menteeMarkedPaidAt);
    const confirmed = Boolean(s.payment?.mentorConfirmedAt);
    const past = new Date(s.startAt).getTime() < now;
    return (
      <Card>
        <View style={{ gap: spacing.xs }}>
          <Text variant="body" weight="semibold">{fmt(s.startAt)} · {s.durationMinutes} min</Text>
          <Text variant="footnote" tone="secondary">
            {side === 'mentee'
              ? t('mentor_sessions.with', { name: s.mentorName })
              : s.menteeName ? t('mentor_sessions.booked_by', { name: s.menteeName }) : t('mentor_sessions.open')}
            {s.priceRupees > 0 ? ` · ₹${s.priceRupees}` : ` · ${t('mentor_sessions.free')}`}
            {s.status === 'completed' ? ` · ${t('mentor_sessions.done')}` : ''}
          </Text>
          {s.note ? <Text variant="caption" tone="tertiary">“{s.note}”</Text> : null}
          {s.payment && s.status !== 'open' && (
            <Text variant="caption" tone={confirmed ? 'success' : 'warning'}>
              {confirmed ? t('mentor_sessions.pay_confirmed') : paidByMentee ? t('mentor_sessions.pay_claimed') : t('mentor_sessions.pay_due')}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs }}>
            {side === 'mentee' && s.payment && !paidByMentee && s.status === 'booked' && (
              <>
                {s.payment.upiUri ? (
                  <Pill label={t('mentor_sessions.pay_upi')} onPress={() => void Linking.openURL(s.payment!.upiUri!).catch(() => Alert.alert(t('mentor_sessions.no_upi')))} />
                ) : null}
                <Pill label={t('mentor_sessions.i_paid')} onPress={() => act.mutate({ id: s.id, action: 'paid' })} />
              </>
            )}
            {side === 'mentor' && s.payment && paidByMentee && !confirmed && (
              <Pill label={t('mentor_sessions.confirm_received')} onPress={() => act.mutate({ id: s.id, action: 'paid' })} />
            )}
            {side === 'mentor' && s.status === 'booked' && past && (
              <Pill label={t('mentor_sessions.mark_done')} onPress={() => act.mutate({ id: s.id, action: 'complete' })} />
            )}
            {(s.status === 'booked' || (side === 'mentor' && s.status === 'open')) && !past && (
              <Pill
                label={t('mentor_sessions.cancel')}
                tone="danger"
                onPress={() =>
                  Alert.alert(t('mentor_sessions.cancel'), t('mentor_sessions.cancel_confirm'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('mentor_sessions.cancel'), style: 'destructive', onPress: () => act.mutate({ id: s.id, action: 'cancel' }) },
                  ])
                }
              />
            )}
          </View>
        </View>
      </Card>
    );
  };

  const Pill = ({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'danger' }) => (
    <Pressable onPress={() => { haptic('selection'); onPress(); }} disabled={act.isPending}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
        backgroundColor: tone === 'danger' ? theme.status.dangerSubtle : theme.brand.heroSubtle }}>
      <Text variant="caption" weight="semibold" style={{ color: tone === 'danger' ? theme.status.danger : theme.brand.hero }}>{label}</Text>
    </Pressable>
  );

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1.5,
        borderColor: active ? theme.brand.hero : theme.border.default, backgroundColor: active ? theme.brand.heroSubtle : 'transparent' }}>
      <Text variant="footnote" weight="medium" style={{ color: active ? theme.brand.hero : theme.text.secondary }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen edges={[]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing['5xl'], paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.primary }}>←</Text>
          </Pressable>
          <Text variant="title" weight="semibold">{t('mentor_sessions.title')}</Text>
        </View>

        {q.isLoading ? <LoadingSpinner /> : (
          <>
            <Text variant="footnote" tone="secondary" weight="semibold">{t('mentor_sessions.my_bookings')}</Text>
            {mentee.length === 0
              ? <EmptyState glyph="📅" title={t('mentor_sessions.none_title')} message={t('mentor_sessions.none_message')} />
              : mentee.map((s) => <Row key={s.id} s={s} side="mentee" />)}

            {isMentor && (
              <>
                <Text variant="footnote" tone="secondary" weight="semibold">{t('mentor_sessions.as_mentor')}</Text>
                {mentor.map((s) => <Row key={s.id} s={s} side="mentor" />)}
              </>
            )}

            <Card>
              <View style={{ gap: spacing.md }}>
                <Text variant="bodyLarge" weight="semibold">{t('mentor_sessions.publish_title')}</Text>
                <Text variant="footnote" tone="secondary">{t('mentor_sessions.publish_hint')}</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => {
                    const dt = new Date(); dt.setDate(dt.getDate() + d);
                    return <Chip key={d} label={dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} active={dayOffset === d} onPress={() => setDayOffset(d)} />;
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  {TIMES.map((tm) => (
                    <Chip key={tm} label={tm} active={times.includes(tm)}
                      onPress={() => setTimes((x) => (x.includes(tm) ? x.filter((y) => y !== tm) : [...x, tm]))} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  {DURATIONS.map((d) => <Chip key={d} label={`${d} min`} active={duration === d} onPress={() => setDuration(d)} />)}
                  <Text variant="footnote" tone="secondary">₹</Text>
                  <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad"
                    style={{ minWidth: 60, borderWidth: 1, borderColor: theme.border.default, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6, color: theme.text.primary }} />
                </View>
                <Button
                  label={publish.isPending ? '…' : t('mentor_sessions.publish_cta', { n: times.length })}
                  onPress={() => publish.mutate()}
                  disabled={times.length === 0 || publish.isPending}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
