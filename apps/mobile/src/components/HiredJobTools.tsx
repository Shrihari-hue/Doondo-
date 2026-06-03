/**
 * HiredJobTools — the worker's per-shift tools for one hired application.
 *
 * These cards used to live inline in MyApplicationsScreen; they're now a
 * shared bundle so the "My Job" hub is their single home (My Applications
 * links into the hub instead of duplicating them). Each card is
 * self-contained: it reads/writes through the same APIs and invalidates
 * the `['applications','me']` query so both screens stay in sync.
 *
 * Render order in the wrapper: shift check-in → night-before confirm →
 * work proof → pre-shift checklist → site briefing. Each piece self-hides
 * when it doesn't apply, so the wrapper is safe to drop in for any hired
 * application.
 */

import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { pickChatImage } from '@/lib/chatImage';
import { captureShiftSelfie } from '@/lib/selfie';
import { getCurrentCoords } from '@/lib/location';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { applicationsApi } from '@/api/applications.api';
import { workProofApi } from '@/api/workProof.api';
import { siteBriefingApi } from '@/api/siteBriefing.api';
import { shiftCheckInApi } from '@/api/shiftCheckIn.api';
import type { PublicApplication } from '@/api/types';

/**
 * One-stop per-hire tool stack. Drop in for a hired application; each
 * child renders only when it applies.
 */
export function HiredJobTools({ application }: { application: PublicApplication }) {
  return (
    <View style={{ gap: 0 }}>
      <ShiftCheckInCard applicationId={application.id} />
      {application.nextShiftAt ? <ShiftConfirmCard application={application} /> : null}
      <WorkProofCard applicationId={application.id} />
      {(application.job?.prepChecklist?.length ?? 0) > 0 ? (
        <PrepChecklistCard application={application} />
      ) : null}
      {application.job?.id ? <SiteBriefingCard jobId={application.job.id} /> : null}
    </View>
  );
}

function SiteBriefingCard({ jobId }: { jobId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const query = useQuery({
    queryKey: ['site-briefing', jobId],
    queryFn: () => siteBriefingApi.get(jobId),
  });
  const b = query.data;
  if (!b || !b.exists || (!b.text && b.photoUrls.length === 0)) return null;

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.6 }}>
        {t('site_briefing.title')}
      </Text>
      {b.text ? <Text variant="body">{b.text}</Text> : null}
      {b.photoUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {b.photoUrls.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={{ width: 160, height: 120, borderRadius: radii.md }}
                resizeMode="cover"
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Pre-shift checklist card. Shows the employer's checklist items; the
 * worker ticks them all and taps "I'm ready", which records the
 * acknowledgement so the employer knows they're prepared.
 */
function PrepChecklistCard({ application }: { application: PublicApplication }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const items = application.job?.prepChecklist ?? [];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const acknowledged = !!application.prepAcknowledgedAt;
  const allChecked = items.every((i) => checked.has(i));

  async function acknowledge() {
    if (busy || !allChecked) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.ackChecklist(application.id);
      haptic('success');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.6 }}>
        {t('prep_checklist.title')}
      </Text>
      {acknowledged ? (
        <Text variant="body" weight="medium" tone="success">
          {t('prep_checklist.ready')}
        </Text>
      ) : (
        <>
          {items.map((item) => {
            const on = checked.has(item);
            return (
              <Pressable
                key={item}
                onPress={() =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(item)) next.delete(item);
                    else next.add(item);
                    return next;
                  })
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <Text style={{ fontSize: 18 }}>{on ? '☑' : '☐'}</Text>
                <Text variant="body" style={{ flex: 1 }}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => void acknowledge()}
            disabled={busy || !allChecked}
            style={{
              paddingVertical: 10,
              borderRadius: radii.pill,
              backgroundColor: theme.brand.hero,
              alignItems: 'center',
              opacity: busy || !allChecked ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
              {t('prep_checklist.ready_cta')}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/**
 * Photo-proof card on a hired-application row. The worker snaps a photo
 * of the finished job; the employer approves it before paying.
 */
function WorkProofCard({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['work-proof', applicationId],
    queryFn: () => workProofApi.get(applicationId),
    staleTime: 30_000,
  });
  const status = query.data?.status ?? 'none';

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const img = await pickChatImage({ source: 'camera' });
      if (!img) return;
      await workProofApi.submit(applicationId, img.dataUrl);
      haptic('success');
      await queryClient.invalidateQueries({ queryKey: ['work-proof', applicationId] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = status === 'none' || status === 'rejected';
  const statusLine =
    status === 'submitted'
      ? t('work_proof.submitted')
      : status === 'approved'
        ? t('work_proof.approved')
        : status === 'rejected'
          ? t('work_proof.rejected')
          : t('work_proof.prompt');
  const tone = status === 'approved' ? 'success' : status === 'rejected' ? 'warning' : 'secondary';

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.6 }}>
        {t('work_proof.title')}
      </Text>
      <Text variant="footnote" tone={tone}>
        {statusLine}
      </Text>
      {canSubmit ? (
        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          style={{
            paddingVertical: 10,
            borderRadius: radii.pill,
            backgroundColor: theme.brand.hero,
            alignItems: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
            {busy ? t('work_proof.sending') : t('work_proof.cta')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Night-before "are you coming?" confirm + "on my way" en-route ping. */
function ShiftConfirmCard({ application }: { application: PublicApplication }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const state = application.shiftConfirmation;

  const whenLabel = application.nextShiftAt
    ? new Date(application.nextShiftAt).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  async function reply(coming: boolean) {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      await applicationsApi.confirmShift(application.id, coming);
      haptic(coming ? 'success' : 'warning');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  async function onMyWay() {
    if (busy) return;
    setBusy(true);
    haptic('selection');
    try {
      const coords = await getCurrentCoords();
      await applicationsApi.markOnTheWay(application.id, coords?.lat ?? 0, coords?.lng ?? 0);
      haptic('success');
      await queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    } catch {
      haptic('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.default,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text variant="footnote" weight="semibold" tone="secondary" style={{ letterSpacing: 0.6 }}>
        {t('shift_confirm.title', { when: whenLabel })}
      </Text>

      {state === 'confirmed' ? (
        <Text variant="body" tone="success" weight="medium">
          {t('shift_confirm.confirmed')}
        </Text>
      ) : state === 'declined' ? (
        <Text variant="body" tone="warning" weight="medium">
          {t('shift_confirm.declined')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            onPress={() => void reply(true)}
            disabled={busy}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: radii.pill,
              backgroundColor: '#10B981',
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
              {t('shift_confirm.coming')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void reply(false)}
            disabled={busy}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 10,
              borderRadius: radii.pill,
              borderWidth: 0.5,
              borderColor: theme.border.default,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.text.secondary, fontWeight: '600', fontSize: 13 }}>
              {t('shift_confirm.cant')}
            </Text>
          </Pressable>
        </View>
      )}

      {state !== 'declined' ? (
        application.onTheWay.active ? (
          <Text variant="footnote" tone="success" weight="medium">
            {application.onTheWay.etaMinutes != null
              ? t('shift_confirm.on_the_way_eta', { eta: application.onTheWay.etaMinutes })
              : t('shift_confirm.on_the_way')}
          </Text>
        ) : (
          <Pressable
            onPress={() => void onMyWay()}
            disabled={busy}
            style={{
              paddingVertical: 10,
              borderRadius: radii.pill,
              borderWidth: 0.5,
              borderColor: theme.brand.hero,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.brand.hero, fontWeight: '700', fontSize: 13 }}>
              {t('shift_confirm.im_on_my_way')}
            </Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/** Selfie + geofenced check-in / check-out for a shift. */
function ShiftCheckInCard({ applicationId }: { applicationId: string }) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['shiftCheckIns', applicationId],
    queryFn: () => shiftCheckInApi.list(applicationId),
    staleTime: 30_000,
  });

  const checkIns = query.data?.checkIns ?? [];
  const lastEvent = checkIns.length > 0 ? checkIns[checkIns.length - 1]! : null;
  const nextKind: 'check_in' | 'check_out' =
    lastEvent?.kind === 'check_in' ? 'check_out' : 'check_in';

  async function onPress() {
    if (busy) return;
    setError(null);
    setBusy(true);
    haptic('selection');
    try {
      const selfie = await captureShiftSelfie();
      if (!selfie) return;
      const coords = await getCurrentCoords();
      if (!coords) {
        setError(t('shift_card.error_location'));
        return;
      }
      if (nextKind === 'check_in') {
        await shiftCheckInApi.checkIn(applicationId, {
          selfieDataUrl: selfie.dataUrl,
          lat: coords.lat,
          lng: coords.lng,
        });
      } else {
        await shiftCheckInApi.checkOut(applicationId, {
          selfieDataUrl: selfie.dataUrl,
          lat: coords.lat,
          lng: coords.lng,
        });
      }
      haptic('success');
      await queryClient.invalidateQueries({ queryKey: ['shiftCheckIns', applicationId] });
    } catch (err) {
      haptic('error');
      setError(friendlyErrorMessage(err, t('shift_card.error_save')));
    } finally {
      setBusy(false);
    }
  }

  const isActive = nextKind === 'check_out';
  const lastTimeStr = lastEvent
    ? new Date(lastEvent.timestamp).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <View
      style={{
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: isActive ? theme.status.successSubtle : theme.bg.muted,
        borderWidth: 0.5,
        borderColor: isActive ? theme.status.successBorder : theme.border.default,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 16 }}>{isActive ? '🟢' : '📍'}</Text>
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: '600',
            color: isActive ? theme.status.success : theme.text.primary,
          }}
        >
          {isActive
            ? lastTimeStr
              ? t('shift_card.on_shift_at', { time: lastTimeStr })
              : t('shift_card.on_shift')
            : lastEvent
              ? lastTimeStr
                ? t('shift_card.off_shift_at', { time: lastTimeStr })
                : t('shift_card.off_shift')
              : t('shift_card.ready')}
        </Text>
      </View>

      {error && <Text style={{ fontSize: 12, color: theme.status.danger }}>{error}</Text>}

      <Pressable
        onPress={onPress}
        disabled={busy}
        style={({ pressed }) => ({
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radii.pill,
          backgroundColor: isActive ? theme.brand.hero : theme.status.success,
          alignItems: 'center',
          opacity: busy ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFDF7' }}>
          {busy
            ? t('shift_card.working')
            : nextKind === 'check_in'
              ? t('shift_card.check_in')
              : t('shift_card.check_out')}
        </Text>
      </Pressable>
    </View>
  );
}
