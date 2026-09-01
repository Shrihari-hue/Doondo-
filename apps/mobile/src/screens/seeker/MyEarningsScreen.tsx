/**
 * MyEarningsScreen — the seeker's earnings ledger.
 *
 * Top: big total card with hero gradient + breakdown (settled vs pending).
 * Below: every transaction in chronological order.
 *
 * No fake data — empty state when there are zero hire credits yet.
 */

import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii, blue } from '@doondo/tokens';
import { Screen, Text, LoadingSpinner, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { walletApi, type PublicWalletTransaction } from '@/api/wallet.api';
import { ApiError } from '@/api/errors';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/hooks/useAuth';
import { sharePayReceiptPdf } from '@/lib/receiptPdf';
import { useTranslate } from '@/i18n/useTranslate';
import { SeekerThemeOverride } from '@/theme/SeekerThemeOverride';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function MyEarningsInner() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const t = useTranslate();
  const [logOpen, setLogOpen] = useState(false);

  const query = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => walletApi.myEarnings(50),
    staleTime: 30_000,
  });

  const transactions = query.data?.transactions ?? [];
  const summary = query.data?.summary;

  return (
    <Screen edges={[]}>
      {/* Hero with total earned */}
      <LinearGradient
        colors={[blue[700], blue[600], blue[500]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xl + spacing.lg,
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={{ fontSize: 22, color: theme.text.onBrand }}>←</Text>
          </Pressable>
          <Text
            style={{ fontSize: 17, fontWeight: '600', color: theme.text.onBrand, flex: 1 }}
          >
            {t('earnings.title')}
          </Text>
          <Pressable
            onPress={() => {
              haptic('light');
              Alert.alert(
                t('earnings.info_dialog_title'),
                t('earnings.info_dialog_body'),
                [{ text: t('earnings.info_dialog_ok') }],
              );
            }}
            accessibilityLabel={t('earnings.info_a11y')}
            hitSlop={12}
          >
            <Text style={{ fontSize: 18, color: theme.text.onBrand }}>ⓘ</Text>
          </Pressable>
        </View>

        <Text
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            fontWeight: '500',
            letterSpacing: 0.4,
          }}
        >
          {t('earnings.contracts_won')}
        </Text>
        <Text
          style={{
            fontSize: 44,
            lineHeight: 48,
            fontWeight: '700',
            color: theme.text.onBrand,
            letterSpacing: -1,
            marginTop: 4,
          }}
        >
          {summary ? formatRupees(summary.totalEarnedPaise) : '—'}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.lg,
            gap: spacing.md,
          }}
        >
          <SummaryBlock
            label={t('earnings.summary_pending')}
            value={summary ? formatRupees(summary.pendingPaise) : '—'}
          />
          <SummaryBlock
            label={t('earnings.summary_hires')}
            value={summary ? String(summary.hireCount) : '—'}
          />
          <SummaryBlock
            label={t('earnings.summary_cash_logged')}
            value={summary ? formatRupees(summary.cashLogPaise) : '—'}
          />
        </View>

        {/* Log cash earning CTA — sits inside the hero so workers see it
           the moment they open Earnings. */}
        <Pressable
          onPress={() => {
            haptic('selection');
            setLogOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('earnings.log_cta_a11y')}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            paddingVertical: spacing.sm + 2,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.22)',
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.45)',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: theme.text.onBrand, fontSize: 13, fontWeight: '700' }}>
            {t('earnings.log_cta')}
          </Text>
        </Pressable>
      </LinearGradient>

      {/* Transactions */}
      <View
        style={{
          flex: 1,
          paddingTop: spacing.lg,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1.6,
            color: theme.text.tertiary,
            paddingHorizontal: spacing.xl,
            marginBottom: spacing.sm,
          }}
        >
          {t('earnings.transactions_eyebrow')}
        </Text>

        {query.isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </View>
        ) : query.isError ? (
          <EmptyState
            title={t('earnings.error_title')}
            message={t('earnings.error_message')}
            cta={{
              label: t('earnings.retry_cta'),
              onPress: () => {
                haptic('selection');
                void query.refetch();
              },
            }}
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            glyph="💰"
            eyebrow={t('earnings.empty_eyebrow')}
            title={t('earnings.empty_title')}
            message={t('earnings.empty_message')}
            cta={{
              label: t('earnings.empty_cta'),
              onPress: () => navigation.navigate('SeekerTabs', { screen: 'Jobs' } as never),
            }}
          />
        ) : (
          <FlatList
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing['5xl'],
              gap: spacing.sm,
            }}
            data={transactions}
            keyExtractor={(t) => t.id}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={theme.brand.primary}
              />
            }
            renderItem={({ item }) => <TransactionRow t={t} tx={item} />}
          />
        )}
      </View>

      <LogCashEarningModal
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['wallet', 'me'] });
        }}
      />
    </Screen>
  );
}

// ─── Log cash earning modal ────────────────────────────────────────────────

function LogCashEarningModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useTranslate();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const rupees = Number(amount.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(rupees) || rupees <= 0) {
        throw new Error(t('earnings.error_amount'));
      }
      if (!description.trim()) throw new Error(t('earnings.error_desc'));
      return walletApi.logCash({
        amount: Math.round(rupees * 100),
        description: description.trim(),
      });
    },
    onSuccess: () => {
      haptic('success');
      setAmount('');
      setDescription('');
      onSuccess();
      onClose();
    },
    onError: (err) => {
      haptic('error');
      Alert.alert(
        t('earnings.couldnt_log_title'),
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('earnings.error_default'),
      );
    },
  });

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
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border.default,
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
              {t('earnings.log_modal_eyebrow')}
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: theme.text.primary,
                letterSpacing: -0.3,
              }}
            >
              {t('earnings.log_modal_title')}
            </Text>
            <Text
              style={{ fontSize: 13, lineHeight: 19, color: theme.text.secondary }}
            >
              {t('earnings.log_modal_body')}
            </Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.secondary }}>
              {t('earnings.log_modal_amount_label')}
            </Text>
            <TextInput
              value={amount}
              onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder={t('earnings.log_modal_amount_placeholder')}
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
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text.secondary }}>
              {t('earnings.log_modal_desc_label')}
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('earnings.log_modal_desc_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              autoCapitalize="sentences"
              maxLength={240}
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
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={onClose}
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
                {t('earnings.log_modal_cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => mutation.mutate()}
              disabled={mutation.isPending}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.brand.primary,
                opacity: mutation.isPending ? 0.5 : pressed ? 0.85 : 1,
                shadowColor: theme.brand.primary,
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              })}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.onBrand }}>
                {mutation.isPending ? t('earnings.log_modal_saving') : t('earnings.log_modal_save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function SummaryBlock({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.32)',
      }}
    >
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: '500' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text.onBrand, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function TransactionRow({ t, tx }: { t: TFn; tx: PublicWalletTransaction }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const credit = tx.amount > 0;
  const canIssueReceipt = tx.kind === 'cash_log' && credit && user;
  const [issuing, setIssuing] = useState(false);

  async function onIssueReceipt() {
    if (!user) return;
    setIssuing(true);
    haptic('selection');
    try {
      const result = await sharePayReceiptPdf({ user, transaction: tx });
      if (!result.ok && result.reason !== 'unsupported') {
        Alert.alert(t('earnings.receipt_error_title'), result.message);
      } else if (!result.ok) {
        Alert.alert(
          t('earnings.receipt_unavailable_title'),
          t('earnings.receipt_unavailable_body'),
        );
      }
    } finally {
      setIssuing(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: theme.bg.surface,
        borderRadius: radii.lg,
        borderWidth: 0.5,
        borderColor: theme.border.subtle,
        padding: spacing.md,
        gap: spacing.sm,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor:
              tx.kind === 'cash_log'
                ? theme.status.warningSubtle
                : credit
                  ? theme.status.successSubtle
                  : theme.status.dangerSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18 }}>
            {tx.kind === 'cash_log' ? '💵' : credit ? '↓' : '↑'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary }}
            numberOfLines={1}
          >
            {tx.description}
          </Text>
          <Text style={{ fontSize: 11, color: theme.text.tertiary }}>
            {formatDate(tx.createdAt)} ·{' '}
            {tx.kind === 'cash_log'
              ? t('earnings.tx_status_cash_self_logged')
              : tx.status === 'settled'
                ? t('earnings.tx_status_settled')
                : tx.status === 'pending'
                  ? t('earnings.tx_status_pending')
                  : t('earnings.tx_status_reversed')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: credit ? theme.status.success : theme.status.danger,
          }}
        >
          {credit ? '+' : ''}
          {formatRupees(tx.amount)}
        </Text>
      </View>

      {canIssueReceipt && (
        <Pressable
          onPress={onIssueReceipt}
          disabled={issuing}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
            borderRadius: radii.pill,
            borderWidth: 0.5,
            borderColor: theme.brand.primary,
            backgroundColor: pressed ? theme.brand.primaryBorder : theme.brand.primarySubtle,
            marginLeft: 52,
            opacity: issuing ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.brand.primary }}>
            {issuing ? t('earnings.preparing_receipt') : t('earnings.generate_receipt')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const sign = rupees < 0 ? '-' : '';
  // 'en-IN' grouping for lakh/crore display, regardless of UI language.
  return `${sign}₹${Math.abs(rupees).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MyEarningsScreen() {
  return (
    <SeekerThemeOverride>
      <MyEarningsInner />
    </SeekerThemeOverride>
  );
}
