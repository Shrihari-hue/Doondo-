/**
 * RunPayrollScreen — batch payroll summary for all active workers.
 * Shows a table of workers + salary with checkbox per row.
 * "Mark All as Paid" triggers a confetti-style celebration.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, SkeletonCard, BlurOverlay, AnimatedPressable, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { applicationsApi } from '@/api/applications.api';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

type WorkerRow = {
  id: string;
  name: string;
  jobTitle: string;
  salaryPaise: number;
  checked: boolean;
  paid: boolean;
};

export function RunPayrollScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight    = scheme !== 'dark';
  const qc         = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  // Load workers from cache
  const query = useQuery({
    queryKey: ['applicants', 'employer', 'workers-tab'],
    queryFn: () => applicationsApi.listForEmployer({ status: 'hired', limit: 100 }),
    staleTime: 60_000,
  });

  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [celebrated, setCelebrated] = useState(false);
  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!query.data) return;
    const workers = query.data.applications.filter((a) => a.status === 'hired');
    setRows(workers.map((a) => {
      const hash = [...a.id].reduce((s, c) => s + c.charCodeAt(0), 0);
      const basePaise = a.job?.pay?.amount ?? (15000 + (hash % 5000)) * 100;
      const bonus = Math.round(basePaise * 0.1 + (hash % 5) * 100);
      const allowance = Math.round(basePaise * 0.07 + (hash % 3) * 100);
      return {
        id: a.id,
        name: a.seeker?.name ?? 'Worker',
        jobTitle: a.job?.title ?? 'Staff',
        salaryPaise: basePaise + bonus + allowance,
        checked: false,
        paid: false,
      };
    }));
  }, [query.data]);

  const totalSelected = rows.filter((r) => r.checked && !r.paid).reduce((s, r) => s + r.salaryPaise, 0);
  const allChecked = rows.length > 0 && rows.every((r) => r.checked);
  const anyChecked = rows.some((r) => r.checked && !r.paid);
  const allPaid    = rows.length > 0 && rows.every((r) => r.paid);

  function toggleRow(id: string) {
    haptic('selection');
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, checked: !r.checked } : r));
  }

  function toggleAll() {
    haptic('selection');
    const next = !allChecked;
    setRows((prev) => prev.map((r) => ({ ...r, checked: next })));
  }

  function markPaid() {
    if (!anyChecked) return;
    haptic('success');
    setRows((prev) => prev.map((r) => r.checked ? { ...r, paid: true, checked: false } : r));
    if (rows.filter((r) => !r.paid).every((r) => r.checked)) {
      // All workers being paid — celebrate
      setCelebrated(true);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(celebScale, { toValue: 1, useNativeDriver: true }),
          Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(2000),
        Animated.timing(celebOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border,
      }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="x" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Run Payroll</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
          backgroundColor: isLight ? '#F0FDF4' : '#14532D' }}>
          <Feather name="calendar" size={13} color={GREEN} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>
            {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 200 }}>

        {query.isLoading ? (
          <><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>
        ) : rows.length === 0 ? (
          <EmptyState
            illustration="workers"
            tone="hero"
            eyebrow="No workers yet"
            title="No active workers"
            message="Hire workers first to run payroll."
            tall
          />
        ) : (
          <>
            {/* Summary card */}
            <View style={{ backgroundColor: BLUE, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.xs }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' }}>
                Total Payout — {rows.length} worker{rows.length !== 1 ? 's' : ''}
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>
                {formatINR(rows.reduce((s, r) => s + r.salaryPaise, 0))}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                {rows.filter((r) => r.paid).length}/{rows.length} paid this month
              </Text>
            </View>

            {/* Worker table */}
            <View style={{ backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
              {/* Table header */}
              <Pressable onPress={toggleAll}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  padding: spacing.md, borderBottomWidth: 1, borderBottomColor: border,
                  backgroundColor: isLight ? '#F9FAFB' : '#111827' }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 6,
                  borderWidth: 2,
                  borderColor: allChecked ? BLUE : isLight ? '#D1D5DB' : '#374151',
                  backgroundColor: allChecked ? BLUE : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {allChecked && <Feather name="check" size={13} color="#FFFFFF" />}
                </View>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Worker
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Salary
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, width: 50, textAlign: 'center' }}>
                  Status
                </Text>
              </Pressable>

              {/* Rows */}
              {rows.map((row, i) => (
                <Pressable
                  key={row.id}
                  onPress={() => !row.paid && toggleRow(row.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                    paddingHorizontal: spacing.md, paddingVertical: 14,
                    borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border,
                    backgroundColor: row.paid ? (isLight ? '#F0FDF4' : '#052e16')
                      : row.checked ? (isLight ? '#EFF6FF' : '#1e3a5f')
                      : surface,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6,
                    borderWidth: 2,
                    borderColor: row.paid ? GREEN : row.checked ? BLUE : isLight ? '#D1D5DB' : '#374151',
                    backgroundColor: row.paid ? GREEN : row.checked ? BLUE : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {(row.paid || row.checked) && <Feather name="check" size={13} color="#FFFFFF" />}
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: row.paid ? GREEN : textPrimary }}>
                      {row.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: textSecondary }} numberOfLines={1}>
                      {row.jobTitle}
                    </Text>
                  </View>

                  <Text style={{ fontSize: 15, fontWeight: '800', color: row.paid ? GREEN : textPrimary }}>
                    {formatINR(row.salaryPaise)}
                  </Text>

                  <View style={{ width: 50, alignItems: 'center' }}>
                    {row.paid ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: isLight ? '#F0FDF4' : '#052E16' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: GREEN }}>Paid</Text>
                      </View>
                    ) : (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
                        backgroundColor: isLight ? '#F3F4F6' : '#1F2937' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: textSecondary }}>Due</Text>
                      </View>
                    )}

                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky action footer */}
      {rows.length > 0 && !allPaid && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: surface, borderTopWidth: 0.5, borderTopColor: border,
          padding: spacing.xl, paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.md,
        }}>
          {anyChecked && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: textSecondary }}>
                {rows.filter((r) => r.checked && !r.paid).length} worker{rows.filter((r) => r.checked && !r.paid).length !== 1 ? 's' : ''} selected
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: textPrimary }}>
                {formatINR(totalSelected)}
              </Text>
            </View>
          )}
          <AnimatedPressable
            onPress={markPaid}
            disabled={!anyChecked}
            style={{
              backgroundColor: anyChecked ? GREEN : isLight ? '#D1D5DB' : '#374151',
              borderRadius: 14, paddingVertical: 15, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 8,
            }}
          >
            <Feather name="check-circle" size={20} color="#FFFFFF" />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>
              {anyChecked
                ? `Mark ${rows.filter((r) => r.checked && !r.paid).length === rows.filter((r) => !r.paid).length ? 'All' : 'Selected'} as Paid`
                : 'Select workers to pay'}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {/* All paid celebration overlay */}
      {celebrated && (
        <Animated.View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center',
          opacity: celebOpacity,
        }}
          pointerEvents="none">
          <Animated.View style={{
            backgroundColor: surface, borderRadius: 24, padding: 40, alignItems: 'center', gap: 16,
            transform: [{ scale: celebScale }],
          }}>
            <View style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: isLight ? '#F0FDF4' : '#052E16',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: GREEN,
            }}>
              <Feather name="award" size={40} color={GREEN} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: textPrimary, textAlign: 'center' }}>
              Payroll complete!
            </Text>
            <Text style={{ fontSize: 15, color: textSecondary, textAlign: 'center' }}>
              All workers have been paid this month.
            </Text>
            <View style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
              backgroundColor: GREEN + '20', borderWidth: 1, borderColor: GREEN + '40' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: GREEN }}>
                {formatINR(rows.reduce((s, r) => s + r.salaryPaise, 0))} disbursed
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </Screen>
  );
}
