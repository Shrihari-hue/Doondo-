/**
 * WorkerSalaryScreen — what this worker has earned this month (job pay
 * rate × real attendance / hours), what's been paid, what's due, and the
 * real UPI payment history. "Pay" opens the shared UPI payment panel.
 */

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { spacing } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { workforceApi } from '@/api/workforce.api';
import { computeMonthEarnings, currentMonth, formatINR, paidByMonth } from '@/lib/payroll';
import { UpiPaymentPanel } from './UpiPaymentPanel';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerSalary'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function WorkerSalaryScreen() {
  const navigation   = useNavigation<Nav>();
  const route        = useRoute<Route>();
  const insets       = useSafeAreaInsets();
  const { scheme }   = useTheme();
  const isLight      = scheme !== 'dark';
  const queryClient  = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const workerQuery = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      const cached = queryClient.getQueryData<{ applications: Awaited<ReturnType<typeof applicationsApi.listForEmployer>>['applications'] }>(
        ['applicants', 'employer', 'workers-tab']
      );
      const fromCache = cached?.applications.find((a) => a.id === route.params.applicationId);
      if (fromCache) return fromCache;
      const { applications } = await applicationsApi.listForEmployer({ limit: 200 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Worker not found');
      return found;
    },
    staleTime: 60_000,
  });

  const month = currentMonth();
  const detailQuery = useQuery({
    queryKey: ['workforce', 'detail', route.params.applicationId, month],
    queryFn: () => workforceApi.detail(route.params.applicationId, { month }),
    staleTime: 60_000,
  });

  // Hooks must run before any early return.
  const [sharing, setSharing] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const name = route.params.workerName;

  if (workerQuery.isLoading || detailQuery.isLoading) {
    return <Screen><ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <SkeletonCard lines={3} /><SkeletonCard lines={5} />
    </ScrollView></Screen>;
  }

  const w = workerQuery.data;

  const detail = detailQuery.data;
  const earnings = computeMonthEarnings(w?.job?.pay ?? null, detail, month);
  const payPeriod = earnings.period ?? '—';
  const history = (detail?.payments ?? []).filter((p) => p.status !== 'cancelled');
  const months3 = paidByMonth(detail, 3);
  const hiredOn = detail?.hiredAt
    ? new Date(detail.hiredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const BREAKDOWN = [
    { label: `Pay rate (${payPeriod})`, amount: earnings.ratePaise != null ? formatINR(earnings.ratePaise) : '—', bold: false },
    { label: 'Worked this month',       amount: earnings.unitLabel || '—',                                       bold: false },
    { label: 'Earned so far',           amount: formatINR(earnings.earnedPaise),                                 bold: false },
    { label: 'Paid this month',         amount: `− ${formatINR(earnings.paidThisMonthPaise)}`,                    bold: false },
    { label: 'Due now',                 amount: formatINR(earnings.duePaise),                                    bold: true  },
  ];

  async function sharePayslip() {
    setSharing(true);
    try {
      const thisMonth = monthLabel(month);
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #111827; }
  h1 { color: #2563EB; font-size: 24px; margin-bottom: 4px; }
  .subtitle { color: #6B7280; font-size: 14px; margin-bottom: 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #EFF6FF; color: #2563EB; padding: 10px 14px; text-align: left; font-size: 13px; }
  td { padding: 10px 14px; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
  .total td { font-weight: 700; background: #F8FAFF; }
  .badge { background: #F0FDF4; color: #16A34A; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .footer { margin-top: 40px; font-size: 12px; color: #9CA3AF; text-align: center; }
</style></head><body>
<h1>Payslip — ${name}</h1>
<p class="subtitle">Month: ${thisMonth} &nbsp;|&nbsp; Working since: ${hiredOn}</p>
<p class="subtitle">${earnings.basis}</p>
<table>
  <tr><th>Component</th><th>Amount</th></tr>
  ${BREAKDOWN.map((r) => `<tr${r.bold ? ' class="total"' : ''}><td>${r.label}</td><td>${r.amount}</td></tr>`).join('')}
</table>
<h2 style="font-size:16px;margin-bottom:12px;">Payment History</h2>
<table>
  <tr><th>Date</th><th>Amount</th><th>Status</th></tr>
  ${history.length === 0 ? '<tr><td colspan="3">No payments recorded yet</td></tr>' : history.map((h) => `<tr><td>${new Date(h.paidAt ?? h.createdAt).toLocaleDateString('en-IN')}</td><td>${formatINR(h.amountPaise)}</td><td><span class="badge">${h.status === 'paid' ? 'Paid' : h.status}</span></td></tr>`).join('')}
</table>
<p class="footer">Generated by Doondo · ${new Date().toLocaleDateString()}</p>
</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Payslip — ${name}` });
      } else {
        Alert.alert('Sharing unavailable', 'PDF saved to device.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not generate payslip.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Salary & Payments</Text>
        <Pressable hitSlop={12} onPress={() => void sharePayslip()}>
          {sharing
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Feather name="share-2" size={20} color={textPrimary} />}
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Salary hero card */}
        <LinearGradient colors={[BLUE, '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: spacing.xl, gap: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>
            Due for {monthLabel(month)}
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>
            {formatINR(earnings.duePaise)}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{earnings.basis}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Working since {hiredOn}</Text>
        </LinearGradient>

        {/* 3-month paid chart — real settled UPI payments */}
        {(() => {
          const maxPaise = Math.max(1, ...months3.map((m) => m.paise));
          return (
            <View style={{
              backgroundColor: surface, borderRadius: 16,
              borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.md,
            }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Paid — last 3 months</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {months3.map((m, i) => (
                  <Text key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600',
                    color: i === 2 ? BLUE : textSecondary }}>
                    {m.paise === 0 ? '₹0' : formatINR(m.paise)}
                  </Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 72 }}>
                {months3.map((m, i) => (
                  <View key={m.month} style={{
                    flex: 1, height: Math.max(3, Math.round((m.paise / maxPaise) * 72)), borderRadius: 6,
                    backgroundColor: i === 2 ? BLUE : (isLight ? '#BFDBFE' : '#1E3A5F'),
                  }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {months3.map((m) => (
                  <Text key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: textSecondary }}>
                    {monthLabel(m.month).split(' ')[0]}
                  </Text>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Breakdown */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          <View style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: border }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Salary Breakdown</Text>
          </View>
          {BREAKDOWN.map((row, i) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: spacing.md, paddingVertical: 12,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border,
              backgroundColor: row.bold ? (isLight ? '#F8FAFF' : '#1E2A3A') : surface }}>
              <Text style={{ fontSize: 14, color: row.bold ? textPrimary : textSecondary,
                fontWeight: row.bold ? '700' : '400' }}>{row.label}</Text>
              <Text style={{ fontSize: 14, color: textPrimary, fontWeight: row.bold ? '800' : '600' }}>{row.amount}</Text>
            </View>
          ))}
        </View>

        {/* Payment history */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: spacing.md, borderBottomWidth: 1, borderBottomColor: border }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Payment History</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary }}>
              {formatINR(detail?.totals.paidPaise ?? 0)} paid total
            </Text>
          </View>
          {history.length === 0 && (
            <Text style={{ padding: spacing.md, fontSize: 13, color: textSecondary }}>
              No payments yet. Payments you make through Doondo UPI show up here.
            </Text>
          )}
          {history.map((row, i) => {
            const paid = row.status === 'paid';
            const tint = paid ? GREEN : AMBER;
            return (
              <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: spacing.md, paddingVertical: 14,
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tint + '1A',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={paid ? 'check-circle' : 'clock'} size={16} color={tint} />
                  </View>
                  <Text style={{ fontSize: 14, color: textPrimary }}>
                    {new Date(row.paidAt ?? row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{formatINR(row.amountPaise)}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: tint + '1A' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: tint }}>
                      {paid ? 'Paid' : row.status === 'failed' ? 'Failed' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Download Payslip */}
        <AnimatedPressable
          onPress={() => void sharePayslip()}
          disabled={sharing}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: BLUE,
            opacity: sharing ? 0.7 : 1,
          }}>
          {sharing
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Feather name="download" size={16} color={BLUE} />}
          <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>
            {sharing ? 'Generating…' : 'Download Payslip (PDF)'}
          </Text>
        </AnimatedPressable>

        {/* Pay now — real UPI intent via the shared panel */}
        {showPay && w?.seeker?.id ? (
          <UpiPaymentPanel
            seekerId={w.seeker.id}
            seekerName={name}
            applicationId={route.params.applicationId}
            suggestedAmountPaise={earnings.duePaise || earnings.ratePaise}
          />
        ) : (
          <AnimatedPressable
            onPress={() => {
              if (!w?.seeker?.id) { Alert.alert('Cannot pay', 'Worker details are missing.'); return; }
              setShowPay(true);
            }}
            style={{ backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
              Pay {name.split(' ')[0]}{earnings.duePaise > 0 ? ` — ${formatINR(earnings.duePaise)}` : ''}
            </Text>
          </AnimatedPressable>
        )}
      </ScrollView>
    </Screen>
  );
}
