/**
 * WorkerDocumentsScreen — verified document list.
 * Matches reference: doc rows with icon, name, Verified/Signed badge, Upload button.
 */

import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import type { AppStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDocuments'>;

const BLUE = '#2563EB';
const GREEN = '#16A34A';

interface DocItem {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  status: 'Verified' | 'Signed' | 'Pending';
}

const DOCUMENTS: DocItem[] = [
  { icon: 'credit-card', label: 'Aadhaar Card',           status: 'Verified' },
  { icon: 'shield',      label: 'Police Verification',     status: 'Verified' },
  { icon: 'award',       label: 'Experience Certificate',  status: 'Verified' },
  { icon: 'home',        label: 'Address Proof',           status: 'Verified' },
  { icon: 'dollar-sign', label: 'Bank Details',            status: 'Verified' },
  { icon: 'file-text',   label: 'Agreement',               status: 'Signed' },
];

export function WorkerDocumentsScreen() {
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

  const STATUS_STYLE = {
    Verified: { color: GREEN, bg: '#F0FDF4' },
    Signed:   { color: BLUE,  bg: '#EFF6FF' },
    Pending:  { color: '#F59E0B', bg: '#FFFBEB' },
  };

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
        backgroundColor: surface, borderBottomWidth: 0.5, borderBottomColor: border }}>
        <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={textPrimary} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>Documents</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 }}>

        <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
          {DOCUMENTS.map((doc, i) => {
            const st = STATUS_STYLE[doc.status];
            return (
              <Pressable key={doc.label}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  padding: spacing.md, borderBottomWidth: i < DOCUMENTS.length - 1 ? 1 : 0,
                  borderBottomColor: border, opacity: pressed ? 0.75 : 1,
                })}>
                <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: '#F3F4F6',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={doc.icon} size={19} color={textSecondary} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: textPrimary }}>{doc.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: st.color }}>{doc.status}</Text>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: st.color,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={11} color="#FFFFFF" />
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={textSecondary} />
              </Pressable>
            );
          })}
        </View>

        <Pressable style={({ pressed }) => ({
          backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: pressed ? 0.85 : 1,
        })}>
          <Feather name="upload" size={18} color="#FFFFFF" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Upload New Document</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
