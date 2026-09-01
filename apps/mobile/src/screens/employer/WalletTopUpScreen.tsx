/**
 * WalletTopUpScreen — employer wallet top-up via UPI.
 *
 * Flow:
 *   Step 1 — Amount: preset chips (₹500 / ₹1K / ₹2K / ₹5K) or custom input.
 *   Step 2 — Confirm: summary card, then "Pay via UPI" opens the UPI intent
 *             URI (upi://) which launches GPay / PhonePe / BHIM / any installed
 *             UPI app natively on Android. On iOS it falls back to a VPA entry.
 *   Step 3 — Verification: we poll the backend every 3 s for up to 2 minutes.
 *             When status becomes 'paid' we show the success state and update
 *             the wallet balance cache.
 *
 * No native SDK required — upi:// deep links work system-wide on Android 5+.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { employerWalletApi, type WalletTopUpOrder } from '@/api/employerWallet.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE = '#2563EB'; // = theme.brand.primary; module-scope constant, theme unreachable here
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';

type Step = 'amount' | 'confirm' | 'verifying' | 'success' | 'failed';

const PRESETS = [
  { label: '₹500',  paise: 50_000 },
  { label: '₹1,000', paise: 100_000 },
  { label: '₹2,000', paise: 200_000 },
  { label: '₹5,000', paise: 500_000 },
];

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 40; // 40 × 3 s = 2 minutes

function paise(p: number) {
  return `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function WalletTopUpScreen() {
  const navigation  = useNavigation<Nav>();
  const insets      = useSafeAreaInsets();
  const { theme, scheme }  = useTheme();
  const isLight     = scheme !== 'dark';
  const queryClient = useQueryClient();

  const surface       = theme.bg.surface;
  const border        = theme.border.default;
  const textPrimary   = theme.text.primary;
  const textSecondary = theme.text.secondary;
  const bg            = theme.bg.canvas;
  const subtleBg      = theme.bg.muted;

  // ─── State ────────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState<Step>('amount');
  const [selectedPaise, setSelected]  = useState<number>(100_000); // ₹1,000 default
  const [customInput, setCustomInput] = useState('');
  const [isCustom,    setIsCustom]    = useState(false);
  const [order,       setOrder]       = useState<WalletTopUpOrder | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [pollCount,   setPollCount]   = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amountPaise = isCustom
    ? Math.round((parseFloat(customInput || '0') || 0) * 100)
    : selectedPaise;
  const amountValid = amountPaise >= 10_000; // min ₹100

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ─── Step 1 → 2: Initiate order ──────────────────────────────────────────
  const initiateOrder = useCallback(async () => {
    if (!amountValid) {
      Alert.alert('Minimum ₹100', 'Please enter at least ₹100 to add to your wallet.');
      return;
    }
    setLoading(true);
    haptic('selection');
    try {
      const { order: newOrder } = await employerWalletApi.initiateTopUp(amountPaise);
      setOrder(newOrder);
      setStep('confirm');
    } catch {
      haptic('error');
      Alert.alert('Failed', 'Could not create payment order. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [amountPaise, amountValid]);

  // ─── Step 2 → 3: Open UPI + start polling ────────────────────────────────
  const openUpiAndPoll = useCallback(async () => {
    if (!order) return;
    haptic('medium');
    setStep('verifying');
    setPollCount(0);

    // Open the UPI deep link — launches GPay / PhonePe / BHIM on Android.
    // On iOS this opens the app if installed, otherwise falls back to browser.
    const supported = await Linking.canOpenURL(order.upiUri);
    if (supported) {
      await Linking.openURL(order.upiUri);
    } else {
      // Fallback: copy VPA for manual payment
      Clipboard.setString(order.merchantVpa);
      Alert.alert(
        'No UPI App Found',
        `No UPI app detected. Merchant VPA copied:\n\n${order.merchantVpa}\n\nOpen your UPI app, pay ₹${(amountPaise / 100).toLocaleString('en-IN')}, and tap "I've Paid" below.`,
      );
    }

    // Poll backend every 3 s
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      setPollCount(attempts);
      try {
        const { order: updated } = await employerWalletApi.topUpStatus(order.orderId);
        if (updated.status === 'paid') {
          clearInterval(pollRef.current!);
          // Confirm on backend
          await employerWalletApi.confirmTopUp(order.orderId);
          // Invalidate balance cache
          void queryClient.invalidateQueries({ queryKey: ['employerWallet'] });
          setOrder(updated);
          setStep('success');
          haptic('success');
        } else if (updated.status === 'failed' || updated.status === 'cancelled') {
          clearInterval(pollRef.current!);
          setStep('failed');
          haptic('error');
        } else if (attempts >= POLL_MAX_ATTEMPTS) {
          clearInterval(pollRef.current!);
          setStep('failed');
        }
      } catch {
        // Network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [order, amountPaise, queryClient]);

  // Manual "I've Paid" — fire a final status check immediately
  const checkNow = useCallback(async () => {
    if (!order) return;
    haptic('selection');
    try {
      const { order: updated } = await employerWalletApi.topUpStatus(order.orderId);
      if (updated.status === 'paid') {
        clearInterval(pollRef.current!);
        await employerWalletApi.confirmTopUp(order.orderId);
        void queryClient.invalidateQueries({ queryKey: ['employerWallet'] });
        setOrder(updated);
        setStep('success');
        haptic('success');
      } else {
        Alert.alert(
          'Payment Pending',
          'We haven\'t received your payment yet. Please complete payment in your UPI app, then try again.',
        );
      }
    } catch {
      Alert.alert('Error', 'Could not check payment status. Try again.');
    }
  }, [order, queryClient]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border,
      }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: textPrimary }}>
          Add Money
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* ── STEP 1: Amount selection ── */}
        {step === 'amount' && (
          <>
            {/* Balance indicator */}
            <LinearGradient colors={theme.brand.primaryGradient}
              style={{ borderRadius: radii.xl, padding: spacing.lg, gap: 4 }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' }}>
                Doondo Wallet
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text.onBrand }}>₹1,250</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Current balance</Text>
            </LinearGradient>

            {/* Preset amounts */}
            <View style={{ backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.md }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: textPrimary }}>Select amount</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {PRESETS.map((p) => {
                  const active = !isCustom && selectedPaise === p.paise;
                  return (
                    <Pressable key={p.paise}
                      onPress={() => { haptic('selection'); setSelected(p.paise); setIsCustom(false); }}
                      style={({ pressed }) => ({
                        flex: 1, minWidth: '40%', paddingVertical: 14, borderRadius: radii.lg,
                        alignItems: 'center', borderWidth: active ? 2 : 1,
                        borderColor: active ? BLUE : border,
                        backgroundColor: active ? (theme.brand.primarySubtle) : subtleBg,
                        opacity: pressed ? 0.85 : 1,
                      })}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: active ? BLUE : textPrimary }}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom amount */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', borderWidth: isCustom ? 2 : 1,
                borderColor: isCustom ? BLUE : border, borderRadius: radii.lg,
                backgroundColor: isCustom ? (theme.brand.primarySubtle) : subtleBg,
                paddingHorizontal: spacing.md,
              }}>
                <Text style={{ fontSize: 18, color: isCustom ? BLUE : textSecondary, fontWeight: '700' }}>₹</Text>
                <TextInput
                  value={customInput}
                  onChangeText={(v) => {
                    setCustomInput(v.replace(/[^0-9]/g, ''));
                    setIsCustom(true);
                  }}
                  onFocus={() => setIsCustom(true)}
                  placeholder="Enter amount"
                  placeholderTextColor={textSecondary}
                  keyboardType="number-pad"
                  style={{ flex: 1, fontSize: 18, fontWeight: '700', color: isCustom ? BLUE : textPrimary,
                    paddingVertical: 14, paddingHorizontal: spacing.sm }}
                />
              </View>
              {isCustom && amountPaise > 0 && amountPaise < 10_000 && (
                <Text style={{ fontSize: 12, color: theme.error }}>Minimum top-up is ₹100</Text>
              )}
            </View>

            {/* UPI info banner */}
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
              backgroundColor: theme.brand.primarySubtle,
              borderRadius: radii.lg, padding: spacing.md, borderWidth: 1,
              borderColor: theme.brand.primaryBorder,
            }}>
              <Feather name="zap" size={18} color={theme.brand.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.brand.primary }}>
                  Instant via UPI
                </Text>
                <Text style={{ fontSize: 12, color: theme.brand.primary, lineHeight: 18, marginTop: 2 }}>
                  Pays via GPay, PhonePe, BHIM, or any UPI app. Money reflects instantly.
                </Text>
              </View>
            </View>

            <AnimatedPressable
              onPress={() => void initiateOrder()}
              disabled={loading || !amountValid}
              style={{
                backgroundColor: amountValid ? BLUE : (theme.border.strong),
                borderRadius: radii.lg, paddingVertical: 16, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
              }}>
              {loading
                ? <ActivityIndicator color={theme.text.onBrand} size="small" />
                : <Feather name="arrow-right" size={18} color={theme.text.onBrand} />}
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text.onBrand }}>
                {loading ? 'Creating order…' : `Proceed to pay ${amountValid ? paise(amountPaise) : ''}`}
              </Text>
            </AnimatedPressable>
          </>
        )}

        {/* ── STEP 2: Confirm ── */}
        {step === 'confirm' && order && (
          <>
            {/* Order summary */}
            <View style={{ backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
              <View style={{ backgroundColor: BLUE, padding: spacing.md }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Payment Summary</Text>
                <Text style={{ fontSize: 32, fontWeight: '800', color: theme.text.onBrand, marginTop: 4 }}>
                  {paise(order.amountPaise)}
                </Text>
              </View>
              {[
                { label: 'Ref', value: order.txnRef },
                { label: 'To', value: 'Doondo Employer Wallet' },
                { label: 'Method', value: 'UPI' },
              ].map(({ label, value }) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between',
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                  borderBottomWidth: 0.5, borderBottomColor: border }}>
                  <Text style={{ fontSize: 13, color: textSecondary }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>{value}</Text>
                </View>
              ))}
            </View>

            {/* UPI app logos (visual cue) */}
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 13, color: textSecondary }}>Pay using any UPI app</Text>
              <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                {['GPay', 'PhonePe', 'BHIM', 'Paytm'].map((app) => (
                  <View key={app} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12,
                      backgroundColor: subtleBg, borderWidth: 1, borderColor: border,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: textSecondary }}>{app[0]}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: textSecondary }}>{app}</Text>
                  </View>
                ))}
              </View>
            </View>

            <AnimatedPressable
              onPress={() => void openUpiAndPoll()}
              style={{ backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
              <Feather name="zap" size={18} color={theme.text.onBrand} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text.onBrand }}>
                Pay {paise(order.amountPaise)} via UPI
              </Text>
            </AnimatedPressable>

            <Pressable onPress={() => setStep('amount')} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ fontSize: 14, color: textSecondary }}>← Change amount</Text>
            </Pressable>
          </>
        )}

        {/* ── STEP 3: Verifying (polling) ── */}
        {step === 'verifying' && (
          <View style={{ alignItems: 'center', gap: spacing.xl, paddingVertical: 40 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40,
              backgroundColor: theme.brand.primarySubtle,
              alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={BLUE} size="large" />
            </View>
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: textPrimary }}>
                Waiting for payment…
              </Text>
              <Text style={{ fontSize: 14, color: textSecondary, textAlign: 'center', lineHeight: 22 }}>
                Complete the payment in your UPI app. This screen will update automatically.
              </Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>
                Checking… ({pollCount}/{POLL_MAX_ATTEMPTS})
              </Text>
            </View>

            {/* Manual confirm for cases where callback is delayed */}
            <AnimatedPressable
              onPress={() => void checkNow()}
              style={{ backgroundColor: GREEN, borderRadius: radii.lg, paddingVertical: 14,
                paddingHorizontal: spacing['2xl'], alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>
                I've Paid — Check Now
              </Text>
            </AnimatedPressable>

            <Pressable onPress={() => {
              clearInterval(pollRef.current!);
              setStep('amount');
            }} style={{ paddingVertical: spacing.sm }}>
              <Text style={{ fontSize: 14, color: textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* ── STEP 4: Success ── */}
        {step === 'success' && order && (
          <View style={{ alignItems: 'center', gap: spacing.xl, paddingVertical: 40 }}>
            {/* Success icon */}
            <View style={{ width: 88, height: 88, borderRadius: 44,
              backgroundColor: theme.status.successSubtle,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: GREEN }}>
              <Feather name="check" size={40} color={GREEN} />
            </View>

            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN }}>Payment Successful!</Text>
              <Text style={{ fontSize: 32, fontWeight: '800', color: textPrimary }}>
                {paise(order.amountPaise)}
              </Text>
              <Text style={{ fontSize: 14, color: textSecondary }}>Added to your Doondo wallet</Text>
            </View>

            {/* Receipt summary */}
            <View style={{ width: '100%', backgroundColor: surface, borderRadius: radii.lg,
              borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: textSecondary }}>Transaction ID</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: textPrimary }}>{order.txnRef}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: textSecondary }}>Status</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Feather name="check-circle" size={13} color={GREEN} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: GREEN }}>Paid</Text>
                </View>
              </View>
            </View>

            <AnimatedPressable
              onPress={() => navigation.goBack()}
              style={{ width: '100%', backgroundColor: BLUE, borderRadius: radii.lg,
                paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text.onBrand }}>Done</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* ── STEP 5: Failed ── */}
        {step === 'failed' && (
          <View style={{ alignItems: 'center', gap: spacing.xl, paddingVertical: 40 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44,
              backgroundColor: theme.status.dangerSubtle,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: theme.error }}>
              <Feather name="x" size={40} color={theme.error} />
            </View>
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.error }}>Payment Failed</Text>
              <Text style={{ fontSize: 14, color: textSecondary, textAlign: 'center', lineHeight: 22 }}>
                The payment was not completed. No money has been deducted. You can try again.
              </Text>
            </View>
            <AnimatedPressable
              onPress={() => { setStep('amount'); setOrder(null); setPollCount(0); }}
              style={{ width: '100%', backgroundColor: BLUE, borderRadius: radii.lg,
                paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text.onBrand }}>Try Again</Text>
            </AnimatedPressable>
            <Pressable onPress={() => navigation.goBack()} style={{ paddingVertical: spacing.sm }}>
              <Text style={{ fontSize: 14, color: textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
