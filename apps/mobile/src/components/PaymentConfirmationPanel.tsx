/**
 * PaymentConfirmationPanel — the two-sided "Mark as paid" loop UI.
 *
 * Renders nothing unless the application has reached `hired`. On hire,
 * shows one of three states depending on what's been confirmed:
 *
 *   - Both confirmed         → "Paid ✓" badge + when
 *   - Disputed by seeker     → red "Seeker says unpaid" + their note
 *   - One side confirmed     → "Awaiting other side" + a CTA for the
 *                              missing party
 *   - Neither confirmed yet  → CTA pair (Mark paid / Dispute for seeker;
 *                              Mark paid only for employer)
 *
 * Used by MyApplicationsScreen (seekers) and ApplicantDetailScreen
 * (employers) — both pass the same Application + their role so the panel
 * picks the right CTAs.
 */

import { Alert, Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from './Text';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import type { PublicApplication } from '@/api/types';

interface Props {
  application: PublicApplication;
  /** Which side of the table is viewing this. */
  role: 'seeker' | 'employer';
  /** Which queries to invalidate after a successful mutation. */
  invalidateQueryKeys?: ReadonlyArray<readonly unknown[]>;
}

export function PaymentConfirmationPanel({
  application,
  role,
  invalidateQueryKeys = [],
}: Props) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  // Skip rendering pre-hire — there's nothing to confirm.
  if (application.status !== 'hired') return null;

  const pc = application.paymentConfirmation;
  const seekerConfirmed = !!pc?.seekerConfirmedAt;
  const employerConfirmed = !!pc?.employerConfirmedAt;
  const disputed = !!pc?.disputedAt;
  const bothConfirmed = seekerConfirmed && employerConfirmed && !disputed;

  const mutation = useMutation({
    mutationFn: (body: {
      action: 'seeker_confirm' | 'employer_confirm' | 'dispute';
      disputeNote?: string;
    }) => applicationsApi.confirmPayment(application.id, body),
    onSuccess: () => {
      haptic('success');
      for (const key of invalidateQueryKeys) {
        void queryClient.invalidateQueries({ queryKey: key as never });
      }
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        "Couldn't update",
        err instanceof ApiError ? err.message : 'Try again.',
      );
    },
  });

  const onConfirm = () => {
    mutation.mutate({
      action: role === 'seeker' ? 'seeker_confirm' : 'employer_confirm',
    });
  };

  const onDispute = () => {
    Alert.prompt(
      'Mark as unpaid?',
      "Tell us briefly what happened. We'll flag this employer for review.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: (note?: string) => {
            mutation.mutate({
              action: 'dispute',
              disputeNote: note?.trim() || undefined,
            });
          },
        },
      ],
      'plain-text',
    );
  };

  // ─── State: both confirmed ────────────────────────────────────────────
  if (bothConfirmed) {
    return (
      <View
        style={{
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: theme.status.successSubtle,
          borderWidth: 0.5,
          borderColor: theme.status.successBorder,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 18 }}>✓</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.success }}>
            Paid in full
          </Text>
          <Text style={{ fontSize: 11, color: theme.status.success }}>
            Both sides confirmed
          </Text>
        </View>
      </View>
    );
  }

  // ─── State: disputed by seeker ────────────────────────────────────────
  if (disputed) {
    return (
      <View
        style={{
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: theme.status.dangerSubtle,
          borderWidth: 0.5,
          borderColor: theme.status.dangerBorder,
          gap: spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Text style={{ fontSize: 18 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.danger }}>
              {role === 'seeker' ? 'You marked this unpaid' : 'Worker marked this unpaid'}
            </Text>
            {pc?.disputeNote ? (
              <Text
                style={{
                  fontSize: 12,
                  color: theme.status.danger,
                  marginTop: 2,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{pc.disputeNote}&rdquo;
              </Text>
            ) : null}
          </View>
        </View>
        {role === 'seeker' ? (
          <Pressable
            onPress={onConfirm}
            disabled={mutation.isPending}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              paddingHorizontal: spacing.md,
              paddingVertical: 8,
              borderRadius: radii.pill,
              backgroundColor: theme.bg.surface,
              borderWidth: 0.5,
              borderColor: theme.status.successBorder,
              opacity: mutation.isPending ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.status.success }}>
              Got paid? Confirm
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // ─── State: one side confirmed, other awaiting ───────────────────────
  if (seekerConfirmed || employerConfirmed) {
    const otherSideIsMe =
      (role === 'seeker' && !seekerConfirmed) ||
      (role === 'employer' && !employerConfirmed);

    return (
      <View
        style={{
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: theme.status.warningSubtle,
          borderWidth: 0.5,
          borderColor: theme.status.warningBorder,
          gap: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.warning }}>
          {seekerConfirmed && role === 'employer'
            ? 'Worker says they were paid'
            : employerConfirmed && role === 'seeker'
              ? 'Employer says they paid you'
              : seekerConfirmed
                ? 'You confirmed payment'
                : 'You confirmed payment'}
        </Text>
        <Text style={{ fontSize: 12, color: theme.status.warning }}>
          {otherSideIsMe
            ? role === 'seeker'
              ? "Confirm you were actually paid, or dispute if you weren't."
              : 'Confirm you paid the worker to close this out.'
            : 'Waiting on the other side to confirm.'}
        </Text>
        {otherSideIsMe ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={onConfirm}
              disabled={mutation.isPending}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.status.success,
                opacity: mutation.isPending ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                ✓ Confirm paid
              </Text>
            </Pressable>
            {role === 'seeker' ? (
              <Pressable
                onPress={onDispute}
                disabled={mutation.isPending}
                style={({ pressed }) => ({
                  paddingVertical: 10,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.status.danger,
                  backgroundColor: theme.bg.surface,
                  opacity: mutation.isPending ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.danger }}>
                  Dispute
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  // ─── State: nothing confirmed yet ────────────────────────────────────
  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: theme.bg.surface,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
        Was the work paid for?
      </Text>
      <Text style={{ fontSize: 12, color: theme.text.secondary }}>
        {role === 'seeker'
          ? 'Help future workers — confirm if you got paid, or flag if you didn\'t.'
          : 'Mark this gig as paid to close it out.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={onConfirm}
          disabled={mutation.isPending}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 10,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.status.success,
            opacity: mutation.isPending ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
            ✓ Mark as paid
          </Text>
        </Pressable>
        {role === 'seeker' ? (
          <Pressable
            onPress={onDispute}
            disabled={mutation.isPending}
            style={({ pressed }) => ({
              paddingVertical: 10,
              paddingHorizontal: spacing.md,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.status.danger,
              backgroundColor: theme.bg.surface,
              opacity: mutation.isPending ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.status.danger }}>
              Not paid
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
