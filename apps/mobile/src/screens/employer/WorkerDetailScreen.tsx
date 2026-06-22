/**
 * WorkerDetailScreen — hired worker profile for the employer.
 * Matches reference: avatar + name/role/status, trust score, attendance,
 * contact info rows, Message + Call buttons, quick-nav to sub-screens.
 */

import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Avatar, SkeletonCard, EmptyState } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDetail'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';

export function WorkerDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const isLight = scheme !== 'dark';

  const bg = isLight ? '#F9FAFB' : '#0C0A0E';
  const surface = isLight ? '#FFFFFF' : '#1A1A1A';
  const border = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';

  const query = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      const { applications } = await applicationsApi.listForEmployer({ limit: 200 });
      const found = applications.find((a) => a.id === route.params.applicationId);
      if (!found) throw new Error('Worker not found');
      return found;
    },
  });

  if (query.isLoading) {
    return <Screen><ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <SkeletonCard lines={4} /><SkeletonCard lines={3} /><SkeletonCard lines={5} />
    </ScrollView></Screen>;
  }

  if (query.isError || !query.data) {
    return <Screen><EmptyState glyph="✕" tone="warning" eyebrow="Error" title="Worker not found"
      message="Go back and try again." cta={{ label: 'Go back', onPress: () => navigation.goBack() }} /></Screen>;
  }

  const w = query.data;
  const name = w.seeker?.name ?? 'Worker';
  const role = w.job?.title ?? w.seeker?.skills?.[0] ?? 'Worker';
  const location = [w.seeker?.location?.area, w.seeker?.location?.city].filter(Boolean).join(', ') || 'Bengaluru';
  const phone = (w.seeker as any)?.phone ?? '+91 98765 43210';
  const salary = w.job?.pay?.amount ? `₹${Math.round(w.job.pay.amount / 100).toLocaleString('en-IN')} / ${w.job.pay.period ?? 'month'}` : '₹18,000 / month';
  const hash = [...w.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const trustScore = 80 + (hash % 19);
  const attendance = 90 + (hash % 10);
  const joinedDate = '14 Feb 2024';
  const workerId = `DW${10000 + (hash % 90000)}`;

  const INFO_ROWS = [
    { icon: 'phone' as const, label: 'Phone', value: phone },
    { icon: 'map-pin' as const, label: 'Location', value: location },
    { icon: 'dollar-sign' as const, label: 'Salary', value: salary },
    { icon: 'clock' as const, label: 'Working Hours', value: '9:00 AM – 6:00 PM' },
    { icon: 'calendar' as const, label: 'Next Payment', value: '1 July 2024' },
  ];

  const QUICK_NAV = [
    { icon: 'calendar' as const, label: 'Attendance', route: 'WorkerAttendance' as const },
    { icon: 'edit-2' as const, label: 'Tasks', route: 'WorkerTasks' as const },
    { icon: 'activity' as const, label: 'Activity', route: 'WorkerActivity' as const },
    { icon: 'file-text' as const, label: 'Documents', route: 'WorkerDocuments' as const },
    { icon: 'credit-card' as const, label: 'Salary', route: 'WorkerSalary' as const },
  ];

  return (
    <Screen edges={[]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Worker Details</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable hitSlop={12}><Feather name="edit-2" size={19} color={textPrimary} /></Pressable>
          <Pressable hitSlop={12}><Feather name="more-horizontal" size={19} color={textPrimary} /></Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        {/* Identity card */}
        <View style={{ backgroundColor: surface, borderRadius: 16, padding: spacing.lg,
          borderWidth: 1, borderColor: border, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={name} photoUrl={w.seeker?.photoUrl ?? null} size={72} premium={w.seeker?.isVerified} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: textPrimary }}>{name}</Text>
                {w.seeker?.isVerified && (
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BLUE,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={12} color="#FFFFFF" />
                  </View>
                )}
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
                  backgroundColor: '#F0FDF4' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: GREEN }}>Active</Text>
                </View>
              </View>
              <Text style={{ fontSize: 14, color: textSecondary }}>{role}</Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>Joined: {joinedDate}</Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>ID: {workerId}</Text>
            </View>
          </View>

          {/* Trust + Attendance */}
          <View style={{ flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md,
            borderTopWidth: 1, borderTopColor: border }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>Trust Score</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: textPrimary }}>{trustScore}/100</Text>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: GREEN,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="shield" size={13} color="#FFFFFF" />
                </View>
              </View>
              <Text style={{ fontSize: 12, color: GREEN, fontWeight: '600' }}>Excellent</Text>
            </View>
            <View style={{ width: 1, backgroundColor: border }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>Attendance</Text>
              <Text style={{ fontSize: 24, fontWeight: '900', color: textPrimary }}>{attendance}%</Text>
              <Text style={{ fontSize: 12, color: textSecondary }}>This Month</Text>
            </View>
          </View>
        </View>

        {/* Contact info */}
        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          {INFO_ROWS.map((row, i) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              padding: spacing.md, borderBottomWidth: i < INFO_ROWS.length - 1 ? 1 : 0, borderBottomColor: border }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF',
                alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={row.icon} size={17} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>{row.label}</Text>
                <Text style={{ fontSize: 14, color: textPrimary, fontWeight: '500', marginTop: 1 }}>{row.value}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={textSecondary} />
            </View>
          ))}
        </View>

        {/* Message + Call */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable style={({ pressed }) => ({
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: BLUE, borderRadius: 12, paddingVertical: 13, opacity: pressed ? 0.85 : 1,
          })}>
            <Feather name="message-square" size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Message</Text>
          </Pressable>
          <Pressable style={({ pressed }) => ({
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: BLUE, opacity: pressed ? 0.75 : 1,
          })}>
            <Feather name="phone" size={18} color={BLUE} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>Call</Text>
          </Pressable>
          <Pressable style={({ pressed }) => ({
            width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: border,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1,
          })}>
            <Text style={{ fontSize: 13, color: textSecondary, fontWeight: '600' }}>•••</Text>
          </Pressable>
        </View>

        {/* Quick navigation */}
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>Manage</Text>
          <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
            {QUICK_NAV.map((item, i) => (
              <Pressable key={item.route}
                onPress={() => { haptic('selection'); navigation.navigate(item.route, { applicationId: w.id, workerName: name }); }}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  padding: spacing.md, borderBottomWidth: i < QUICK_NAV.length - 1 ? 1 : 0,
                  borderBottomColor: border, opacity: pressed ? 0.75 : 1,
                })}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={item.icon} size={17} color={BLUE} />
                </View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }}>{item.label}</Text>
                <Feather name="chevron-right" size={16} color={textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
