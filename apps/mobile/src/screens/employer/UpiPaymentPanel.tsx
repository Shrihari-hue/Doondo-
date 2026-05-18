/**
 * UpiPaymentPanel — inline employer-side card on ApplicantDetail that
 * lets the employer pay the worker over UPI.
 *
 * Flow:
 *   1. Employer types amount, taps "Open UPI app".
 *   2. We create a PaymentIntent → receive a UPI deep-link.
 *   3. We open the link via Linking. If the device has no UPI app
 *      installed, we surface the VPA + ref so the employer can pay
 *      manually.
 *   4. After payment, employer taps "I paid" to mark the intent settled.
 *      This credits the worker's wallet ledger.
 */
import { useState } from 'react';
import { Alert, Linking, Pressable, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { spacing, radii } from '@doondo/tokens';
import { Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { paymentsApi, type PaymentIntent } from '@/api/payments.api';

interface Props {
  seekerId: string;
  seekerName: string;
  applicationId: string;
  /** Optional default pay amount (paise) from the job. */
  suggestedAmountPaise?: number | null;
}

export function UpiPaymentPanel({
  seekerId,
  seekerName,
  applicationId,
  suggestedAmountPaise,
}: Props) {
  const { theme } = useTheme();
  const t = useTranslate();
  const queryClient = useQueryClient();
  const [amountRupees, setAmountRupees] = useState(
    suggestedAmountPaise ? String(Math.round(suggestedAmountPaise / 100)) : '',
  );
  const [intent, setIntent] = useState<PaymentIntent | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      paymentsApi.create({
        seekerId,
        applicationId,
        amountPaise: Number(amountRupees) * 100,
        note: `Doondo wage · ${seekerName.slice(0, 20)}`,
      }),
    onSuccess: async (data) => {
      setIntent(data.intent);
      haptic('selection');
      // Try opening the UPI deep-link. If no app handles it, the
      // promise rejects — show the manual VPA + ref instead.
      const supported = await Linking.canOpenURL(data.intent.upiUri).catch(() => false);
      if (supported) {
        void Linking.openURL(data.intent.upiUri).catch(() => undefined);
      } else {
        Alert.alert(
          t('employer.upi.no_upi_title'),
          t('employer.upi.no_upi_body', {
            amount: formatINR(data.intent.amountPaise),
            vpa: data.intent.seekerVpa,
            ref: data.intent.ref,
          }),
        );
      }
    },
    onError: (err) =>
      Alert.alert(t('employer.upi.could_not_create'), (err as Error).message),
  });

  const markPaidMut = useMutation({
    mutationFn: (id: string) => paymentsApi.markPaid(id),
    onSuccess: () => {
      haptic('success');
      setIntent(null);
      setAmountRupees('');
      void queryClient.invalidateQueries({ queryKey: ['payments', 'mine'] });
      Alert.alert(t('employer.upi.marked_paid_title'), t('employer.upi.marked_paid_body'));
    },
  });

  return (
    <View
      style={{
        padding: spacing.md,
        borderRadius: 14,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        backgroundColor: theme.bg.surface,
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
        {t('employer.upi.title')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}>₹</Text>
        <TextInput
          value={amountRupees}
          onChangeText={(v) => setAmountRupees(v.replace(/[^0-9]/g, ''))}
          placeholder={t('employer.upi.amount_placeholder')}
          keyboardType="number-pad"
          style={{
            flex: 1,
            borderWidth: 0.5,
            borderColor: theme.border.default,
            borderRadius: radii.md,
            paddingHorizontal: spacing.sm,
            paddingVertical: 8,
            fontSize: 16,
            color: theme.text.primary,
          }}
        />
        <Pressable
          onPress={() => {
            if (!amountRupees || Number(amountRupees) <= 0) {
              Alert.alert(t('employer.upi.enter_amount'));
              return;
            }
            createMut.mutate();
          }}
          disabled={createMut.isPending}
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: '#2563EB',
            opacity: createMut.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
            {createMut.isPending ? '…' : t('employer.upi.cta_open')}
          </Text>
        </Pressable>
      </View>
      {intent && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: theme.text.secondary }}>
            {t('employer.upi.ref_label', { ref: intent.ref, vpa: intent.seekerVpa })}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => markPaidMut.mutate(intent.id)}
              disabled={markPaidMut.isPending}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radii.pill,
                backgroundColor: '#10B981',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                {t('employer.upi.cta_paid')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => paymentsApi.cancel(intent.id).then(() => setIntent(null))}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                borderRadius: radii.pill,
                borderWidth: 0.5,
                borderColor: theme.border.default,
              }}
            >
              <Text style={{ color: theme.text.secondary, fontWeight: '600', fontSize: 13 }}>
                {t('employer.upi.cta_cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function formatINR(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}
