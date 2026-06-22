/**
 * WorkerSalaryScreen — salary breakdown + payment history.
 * Matches reference: blue salary card, breakdown rows, payment history.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerSalary'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';

export function WorkerSalaryScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';

  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg = isLight ? '#F9FAFB' : '#0C0A0E';

  const name = route.params.workerName;

  const BREAKDOWN = [
    { label: 'Basic Salary',       amount: '₹15,000' },
    { label: 'Attendance Bonus',   amount: '₹2,000' },
    { label: 'Other Allowances',   amount: '₹1,000' },
    { label: 'Total Salary',       amount: '₹18,000', bold: true },
  ];

  const HISTORY = [
    { date: '1 June 2024', amount: '₹18,000', status: 'Paid' },
    { date: '1 May 2024',  amount: '₹18,000', status: 'Paid' },
    { date: '1 April 2024',amount: '₹18,000', status: 'Paid' },
    { date: '1 March 2024',amount: '₹18,000', status: 'Paid' },
  ];

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Salary & Payments</Text>
        <Pressable hitSlop={12}><Feather name="more-horizontal" size={20} color={textPrimary} /></Pressable>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Salary card */}
        <LinearGradient colors={[BLUE, '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, padding: spacing.xl, gap: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>Monthly Salary</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -1 }}>₹18,000</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Effective from 14 Feb 2024</Text>
        </LinearGradient>

        {/* Salary breakdown */}
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
            <Pressable hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>View all</Text>
            </Pressable>
          </View>
          {HISTORY.map((row, i) => (
            <View key={row.date} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: spacing.md, paddingVertical: 14,
              borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>
              <Text style={{ fontSize: 14, color: textPrimary }}>{row.date}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: textPrimary }}>{row.amount}</Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: '#F0FDF4' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: GREEN }}>{row.status}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pay now */}
        <Pressable style={({ pressed }) => ({
          backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15,
          alignItems: 'center', opacity: pressed ? 0.85 : 1,
        })}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }}>Pay {name.split(' ')[0]} Now</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
