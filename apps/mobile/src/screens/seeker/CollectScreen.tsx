/**
 * CollectScreen — "Doondo Collect": the worker's money-in hub.
 *
 *   - Withdrawable balance + withdraw to the saved bank account
 *   - Bank account (add / verify / remove)
 *   - Collection QR (open or per-amount) with download / share
 *
 * When someone pays the QR, Doondo keeps a small commission and credits
 * the rest to the wallet. Real money movement is gated behind the payment
 * aggregator on the backend; in the current build a "simulate payment"
 * action stands in for the PSP webhook so the flow is demonstrable.
 */

import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, TextField, Pill, LoadingSpinner, QrCode } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { haptic } from '@/lib/haptics';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import { collectApi, type CollectQr, type CollectQrKind } from '@/api/collect.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function rupees(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function Inner() {
  const { theme } = useTheme();
  const t = useTranslate();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const qrRef = useRef<View>(null);

  // Bank form
  const [holderName, setHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  // QR builder
  const [qrKind, setQrKind] = useState<CollectQrKind>('open');
  const [qrAmount, setQrAmount] = useState('');
  const [shownQr, setShownQr] = useState<CollectQr | null>(null);
  // Withdraw
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const bankQuery = useQuery({ queryKey: ['collect', 'bank'], queryFn: () => collectApi.getBank() });
  const balanceQuery = useQuery({ queryKey: ['collect', 'balance'], queryFn: () => collectApi.balance() });
  const qrsQuery = useQuery({ queryKey: ['collect', 'qrs'], queryFn: () => collectApi.listQrs() });

  const bank = bankQuery.data;
  const balance = balanceQuery.data ?? 0;
  const qrs = qrsQuery.data ?? [];

  const setBankMut = useMutation({
    mutationFn: () =>
      collectApi.setBank({ holderName: holderName.trim(), accountNumber: accountNumber.trim(), ifsc: ifsc.trim() }),
    onSuccess: () => {
      haptic('success');
      setHolderName('');
      setAccountNumber('');
      setIfsc('');
      void queryClient.invalidateQueries({ queryKey: ['collect', 'bank'] });
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('collect.bank_fail'));
    },
  });

  const removeBankMut = useMutation({
    mutationFn: () => collectApi.removeBank(),
    onSuccess: () => {
      haptic('selection');
      void queryClient.invalidateQueries({ queryKey: ['collect', 'bank'] });
    },
  });

  const createQrMut = useMutation({
    mutationFn: () =>
      collectApi.createQr({
        kind: qrKind,
        amountPaise: qrKind === 'fixed' ? Math.round((Number(qrAmount) || 0) * 100) : null,
      }),
    onSuccess: (qr) => {
      haptic('success');
      setShownQr(qr);
      setQrAmount('');
      void queryClient.invalidateQueries({ queryKey: ['collect', 'qrs'] });
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('collect.qr_fail'));
    },
  });

  const withdrawMut = useMutation({
    mutationFn: () => collectApi.withdraw(Math.round((Number(withdrawAmount) || 0) * 100)),
    onSuccess: () => {
      haptic('success');
      setWithdrawAmount('');
      void queryClient.invalidateQueries({ queryKey: ['collect', 'balance'] });
      Alert.alert(t('collect.withdraw_sent_title'), t('collect.withdraw_sent_body'));
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('collect.withdraw_fail'));
    },
  });

  const simulateMut = useMutation({
    mutationFn: (qr: CollectQr) =>
      collectApi.simulatePayment(qr.ref, qr.amountPaise ?? 150000),
    onSuccess: (res) => {
      haptic('success');
      void queryClient.invalidateQueries({ queryKey: ['collect', 'balance'] });
      Alert.alert(
        t('collect.sim_done_title'),
        t('collect.sim_done_body', { gross: rupees(res.grossPaise), net: rupees(res.netPaise) }),
      );
    },
    onError: () => {
      haptic('error');
      Alert.alert(t('collect.sim_fail'));
    },
  });

  async function shareQr(save: boolean) {
    if (!qrRef.current) return;
    haptic('selection');
    try {
      const uri = await captureRef(qrRef, { format: 'png', quality: 1 });
      if (save) {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t('collect.save_permission'));
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
        haptic('success');
        Alert.alert(t('collect.saved'));
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('collect.share') });
      }
    } catch {
      haptic('error');
      Alert.alert(t('collect.share_fail'));
    }
  }

  const loading = bankQuery.isLoading || balanceQuery.isLoading;

  return (
    <Screen edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingTop: spacing['2xl'],
          paddingBottom: spacing['4xl'],
          gap: spacing.lg,
        }}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text variant="footnote" tone="secondary">
            {t('collect.back')}
          </Text>
        </Pressable>

        <View style={{ gap: spacing.xs }}>
          <Text variant="caption" tone="tertiary" style={{ letterSpacing: 1.2 }}>
            {t('collect.eyebrow')}
          </Text>
          <Text variant="display" weight="medium" display>
            {t('collect.title')}
          </Text>
          <Text variant="footnote" tone="secondary">
            {t('collect.commission_note')}
          </Text>
        </View>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Balance + withdraw */}
            <Card>
              <View style={{ gap: spacing.sm }}>
                <Text variant="footnote" tone="secondary">
                  {t('collect.balance_label')}
                </Text>
                <Text variant="display" weight="semibold" style={{ color: theme.brand.accent }}>
                  {rupees(balance)}
                </Text>
                {bank?.verified ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        placeholder={t('collect.withdraw_amount')}
                        keyboardType="numeric"
                      />
                    </View>
                    <Button
                      label={withdrawMut.isPending ? t('collect.withdrawing') : t('collect.withdraw')}
                      onPress={() => withdrawMut.mutate()}
                      disabled={withdrawMut.isPending || balance <= 0 || !withdrawAmount.trim()}
                    />
                  </View>
                ) : (
                  <Text variant="caption" tone="warning">
                    {t('collect.add_bank_first')}
                  </Text>
                )}
              </View>
            </Card>

            {/* Bank account */}
            <View style={{ gap: spacing.sm }}>
              <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
                {t('collect.bank_title')}
              </Text>
              {bank ? (
                <Card>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text variant="body" weight="medium" style={{ flex: 1 }}>
                        {bank.holderName}
                      </Text>
                      <Pill
                        label={bank.verified ? t('collect.verified') : t('collect.unverified')}
                        tone={bank.verified ? 'success' : 'warning'}
                      />
                    </View>
                    <Text variant="footnote" tone="secondary">
                      {bank.accountNumberMasked} · {bank.ifsc}
                    </Text>
                    <Pressable onPress={() => removeBankMut.mutate()} hitSlop={6} style={{ marginTop: 4 }}>
                      <Text variant="footnote" tone="danger">
                        {t('collect.remove_bank')}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ) : (
                <Card>
                  <View style={{ gap: spacing.sm }}>
                    <TextField
                      value={holderName}
                      onChangeText={setHolderName}
                      placeholder={t('collect.holder_name')}
                      autoCapitalize="words"
                    />
                    <TextField
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                      placeholder={t('collect.account_number')}
                      keyboardType="numeric"
                    />
                    <TextField
                      value={ifsc}
                      onChangeText={setIfsc}
                      placeholder={t('collect.ifsc')}
                      autoCapitalize="characters"
                    />
                    <Button
                      label={setBankMut.isPending ? t('collect.saving') : t('collect.save_bank')}
                      onPress={() => setBankMut.mutate()}
                      disabled={
                        setBankMut.isPending ||
                        !holderName.trim() ||
                        !accountNumber.trim() ||
                        !ifsc.trim()
                      }
                    />
                  </View>
                </Card>
              )}
            </View>

            {/* Collection QR */}
            <View style={{ gap: spacing.sm }}>
              <Text variant="footnote" weight="medium" tone="secondary" style={{ letterSpacing: 1.0 }}>
                {t('collect.qr_title')}
              </Text>
              <Card>
                <View style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable onPress={() => setQrKind('open')}>
                      <Pill
                        label={t('collect.qr_open')}
                        tone={qrKind === 'open' ? 'hero' : 'neutral'}
                      />
                    </Pressable>
                    <Pressable onPress={() => setQrKind('fixed')}>
                      <Pill
                        label={t('collect.qr_fixed')}
                        tone={qrKind === 'fixed' ? 'hero' : 'neutral'}
                      />
                    </Pressable>
                  </View>
                  {qrKind === 'fixed' ? (
                    <TextField
                      value={qrAmount}
                      onChangeText={setQrAmount}
                      placeholder={t('collect.qr_amount')}
                      keyboardType="numeric"
                    />
                  ) : null}
                  <Button
                    label={createQrMut.isPending ? t('collect.creating') : t('collect.create_qr')}
                    onPress={() => createQrMut.mutate()}
                    disabled={createQrMut.isPending || (qrKind === 'fixed' && !qrAmount.trim())}
                  />
                </View>
              </Card>

              {shownQr ? (
                <Card>
                  <View style={{ alignItems: 'center', gap: spacing.md }}>
                    <View ref={qrRef} collapsable={false} style={{ padding: spacing.md, backgroundColor: '#FFFFFF', borderRadius: radii.lg }}>
                      <QrCode matrix={shownQr.qr} />
                      <Text
                        style={{ textAlign: 'center', marginTop: 8, color: '#0F172A', fontWeight: '700' }}
                      >
                        {shownQr.amountPaise ? rupees(shownQr.amountPaise) : t('collect.qr_any_amount')}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button label={t('collect.download')} variant="secondary" onPress={() => void shareQr(true)} />
                      <Button label={t('collect.share')} variant="secondary" onPress={() => void shareQr(false)} />
                    </View>
                    {/* Demo only: stands in for a real payment hitting the QR. */}
                    <Pressable onPress={() => simulateMut.mutate(shownQr)} hitSlop={6}>
                      <Text variant="caption" tone="tertiary">
                        {simulateMut.isPending ? t('collect.sim_busy') : t('collect.sim_cta')}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ) : qrs.length > 0 ? (
                <Pressable onPress={() => setShownQr(qrs[0]!)}>
                  <Text variant="footnote" weight="medium" style={{ color: theme.brand.accent }}>
                    {t('collect.show_existing', { n: qrs.length })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

export function CollectScreen() {
  return (
    <SeekerThemeOverride>
      <Inner />
    </SeekerThemeOverride>
  );
}
