/**
 * WorkerDocumentsScreen — verified document list.
 * "Upload New Document" opens the native image picker and shows a pending row.
 */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { spacing } from '@doondo/tokens';
import { Screen, Text } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDocuments'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';

type DocStatus = 'Verified' | 'Signed' | 'Pending' | 'Uploading';

interface DocItem {
  id: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  status: DocStatus;
  filename?: string;
}

const BASE_DOCS: Omit<DocItem, 'id'>[] = [
  { icon: 'credit-card', label: 'Aadhaar Card',          status: 'Verified' },
  { icon: 'shield',      label: 'Police Verification',    status: 'Verified' },
  { icon: 'award',       label: 'Experience Certificate', status: 'Verified' },
  { icon: 'home',        label: 'Address Proof',          status: 'Verified' },
  { icon: 'dollar-sign', label: 'Bank Details',           status: 'Verified' },
  { icon: 'file-text',   label: 'Agreement',              status: 'Signed'   },
];

const STATUS_STYLE: Record<DocStatus, { color: string; bg: string }> = {
  Verified:  { color: GREEN,      bg: '#F0FDF4' },
  Signed:    { color: BLUE,       bg: '#EFF6FF' },
  Pending:   { color: '#F59E0B',  bg: '#FFFBEB' },
  Uploading: { color: '#8B5CF6',  bg: '#F5F3FF' },
};

export function WorkerDocumentsScreen() {
  const navigation  = useNavigation<Nav>();
  const route       = useRoute<Route>();
  const insets      = useSafeAreaInsets();
  const { scheme }  = useTheme();
  const isLight     = scheme !== 'dark';

  const surface       = isLight ? '#FFFFFF' : '#1A1A1A';
  const border        = isLight ? '#E5E7EB' : '#2A2A2A';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const [docs, setDocs] = useState<DocItem[]>(
    BASE_DOCS.map((d, i) => ({ ...d, id: String(i) }))
  );

  async function handleUpload() {
    haptic('selection');

    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'document.jpg';

    // Add a pending row immediately
    const newId = String(Date.now());
    setDocs((prev) => [...prev, {
      id: newId, icon: 'file-text', label: filename.replace(/\.[^.]+$/, ''),
      status: 'Uploading', filename,
    }]);

    // Simulate upload delay, then mark as Pending (awaiting employer review)
    setTimeout(() => {
      haptic('success');
      setDocs((prev) => prev.map((d) =>
        d.id === newId ? { ...d, status: 'Pending' } : d
      ));
    }, 2200);
  }

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
          {docs.map((doc, i) => {
            const st = STATUS_STYLE[doc.status];
            const isUploading = doc.status === 'Uploading';
            return (
              <Pressable key={doc.id}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  padding: spacing.md, borderBottomWidth: i < docs.length - 1 ? 1 : 0,
                  borderBottomColor: border, opacity: pressed && !isUploading ? 0.75 : 1,
                })}>
                <View style={{ width: 42, height: 42, borderRadius: 10,
                  backgroundColor: isUploading ? '#F5F3FF' : '#F3F4F6',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {isUploading
                    ? <Feather name="upload-cloud" size={19} color="#8B5CF6" />
                    : <Feather name={doc.icon} size={19} color={textSecondary} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: textPrimary }}>{doc.label}</Text>
                  {doc.filename && isUploading && (
                    <Text style={{ fontSize: 11, color: '#8B5CF6' }}>Uploading…</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: st.color }}>{doc.status}</Text>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: st.color,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={isUploading ? 'clock' : 'check'} size={11} color="#FFFFFF" />
                  </View>
                </View>
                {!isUploading && <Feather name="chevron-right" size={16} color={textSecondary} />}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={handleUpload} style={({ pressed }) => ({
          backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: pressed ? 0.85 : 1,
        })}>
          <Feather name="upload" size={18} color="#FFFFFF" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Upload New Document</Text>
        </Pressable>

        <View style={{ backgroundColor: isLight ? '#F8FAFF' : '#1A1F2E', borderRadius: 10, padding: spacing.md,
          flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
          borderWidth: 1, borderColor: '#DBEAFE' }}>
          <Feather name="info" size={14} color={BLUE} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: isLight ? '#1D4ED8' : '#93C5FD', lineHeight: 17 }}>
            Uploaded documents are reviewed within 24 hours. Status changes to "Verified" once approved.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
