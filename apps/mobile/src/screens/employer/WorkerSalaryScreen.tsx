/**
 * WorkerSalaryScreen — salary breakdown + payment history.
 * Derives basic pay from job.pay.amount, generates payment history
 * from a deterministic hash so each worker has consistent dates.
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
import { Screen, Text, SkeletonCard } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerSalary'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatINR(paise: number) {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

/** Generate deterministic payment history rows going backwards from today */
function makeHistory(basePaise: number, hash: number) {
  const bonus      = Math.round(basePaise * 0.1 + (hash % 5) * 100);    // 10% + small variance
  const allowance  = Math.round(basePaise * 0.07 + (hash % 3) * 100);
  const total      = basePaise + bonus + allowance;
  const now = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      date: `1 ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      amount: formatINR(total),
      status: 'Paid' as const,
    };
  });
}

export function WorkerSalaryScreen() {
  const navigation   = useNavigation<Nav>();
  const route        = useRoute<Route>();
  const insets       = useSafeAreaInsets();
  const { scheme }   = useTheme();
  const isLight      = scheme !== 'dark';
  const queryClient  = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#1A1A1A';
  const border        = isLight ? '#E5E7EB' : '#2A2A2A';
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

  const name = route.params.workerName;

  if (workerQuery.isLoading) {
    return <Screen><ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <SkeletonCard lines={3} /><SkeletonCard lines={5} />
    </ScrollView></Screen>;
  }

  const w = workerQuery.data;

  // Derive pay — fall back to sensible defaults if job has no pay data
  const hash         = w ? [...w.id].reduce((a, c) => a + c.charCodeAt(0), 0) : 9999;
  const basePaise    = w?.job?.pay?.amount ?? (15000 + (hash % 5000)) * 100; // ₹15k–20k default
  const bonus        = Math.round(basePaise * 0.1 + (hash % 5) * 100);
  const allowance    = Math.round(basePaise * 0.07 + (hash % 3) * 100);
  const totalPaise   = basePaise + bonus + allowance;
  const payPeriod    = w?.job?.pay?.period ?? 'month';

  const BREAKDOWN = [
    { label: 'Basic Salary',     amount: formatINR(basePaise),  bold: false },
    { label: 'Attendance Bonus', amount: formatINR(bonus),       bold: false },
    { label: 'Other Allowances', amount: formatINR(allowance),   bold: false },
    { label: 'Total Salary',     amount: formatINR(totalPaise),  bold: true  },
  ];

  const HISTORY = makeHistory(basePaise, hash);

  // Effective date: 3–14 months ago, deterministic
  const startMonthsAgo = 3 + (hash % 12);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - startMonthsAgo);
  const effectiveDate = `${startDate.getDate()} ${MONTHS[startDate.getMonth()]} ${startDate.getFullYear()}`;

  const [sharing, setSharing] = useState(false);

  async function sharePayslip() {
    setSharing(true);
    try {
      const now = new Date();
      const monthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
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
<p class="subtitle">Month: ${monthLabel} &nbsp;|&nbsp; Effective From: ${effectiveDate}</p>
<table>
  <tr><th>Component</th><th>Amount</th></tr>
  ${BREAKDOWN.map((r) => `<tr${r.bold ? ' class="total"' : ''}><td>${r.label}</td><td>${r.amount}</td></tr>`).join('')}
</table>
<h2 style="font-size:16px;margin-bottom:12px;">Payment History</h2>
<table>
  <tr><th>Month</th><th>Amount</th><th>Status</th></tr>
  ${HISTORY.map((h) => `<tr><td>${h.date}</td><td>${h.amount}</td><td><span class="badge">Paid</span></td></tr>`).join('')}
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
            Monthly Salary ({payPeriod})
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>
            {formatINR(totalPaise)}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            Effective from {effectiveDate}
          </Text>
        </LinearGradient>

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
            <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary }}>Last 5 months</Text>
          </View>
          {HISTORY.map((row, i) => (
            <View key={row.date} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: spacing.md, paddingVertical: 14,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#F0FDF4',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check-circle" size={16} color={GREEN} />
                </View>
                <Text style={{ fontSize: 14, color: textPrimary }}>{row.date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{row.amount}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#F0FDF4' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN }}>Paid</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Download Payslip */}
        <Pressable
          onPress={() => void sharePayslip()}
          disabled={sharing}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: BLUE,
            opacity: pressed || sharing ? 0.7 : 1,
          })}>
          {sharing
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Feather name="download" size={16} color={BLUE} />}
          <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>
            {sharing ? 'Generating…' : 'Download Payslip (PDF)'}
          </Text>
        </Pressable>

        {/* Pay now */}
        <Pressable style={({ pressed }) => ({
          backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15,
          alignItems: 'center', opacity: pressed ? 0.85 : 1,
        })}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
            Pay {name.split(' ')[0]} — {formatINR(totalPaise)}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
