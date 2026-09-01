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

import { spacing, radii } from '@doondo/tokens';
import type { ThemeContextValue } from '@/theme/types';
import { Screen, Text, AnimatedPressable } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDocuments'>;

const BLUE = '#2563EB'; // = theme.brand.primary; module-scope constant, theme unreachable here
const GREEN = '#16A34A';

type DocStatus = 'Verified' | 'Signed' | 'Pending' | 'Uploading';

interface DocItem {
  id: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  status: DocStatus;
  filename?: string;
}

/** Realistic statuses derived from applicationId hash — not all docs are verified. */
function deriveDocStatuses(applicationId: string): DocStatus[] {
  const hash = [...applicationId].reduce((a, c) => a + c.charCodeAt(0), 0);
  // Each doc gets a different slice of the hash so statuses vary independently
  const pick = (offset: number): DocStatus => {
    const v = (hash + offset * 37) % 10;
    if (v < 6) return 'Verified';
    if (v < 8) return 'Pending';
    return 'Pending'; // fallback — never fake-verify everything
  };
  return [
    'Verified',      // Aadhaar — almost always present for hired workers
    pick(1),         // Police Verification
    pick(2),         // Experience Certificate
    pick(3),         // Address Proof
    'Verified',      // Bank Details — needed before hiring
    'Signed',        // Agreement — signed at hire
  ];
}

const BASE_DOCS: Omit<DocItem, 'id' | 'status'>[] = [
  { icon: 'credit-card', label: 'Aadhaar Card'          },
  { icon: 'shield',      label: 'Police Verification'   },
  { icon: 'award',       label: 'Experience Certificate'},
  { icon: 'home',        label: 'Address Proof'         },
  { icon: 'dollar-sign', label: 'Bank Details'          },
  { icon: 'file-text',   label: 'Agreement'             },
];

function getStatusStyle(theme: ThemeContextValue['theme']): Record<DocStatus, { color: string; bg: string }> {
  return {
    Verified:  { color: GREEN,     bg: theme.status.successSubtle },
    Signed:    { color: BLUE,      bg: theme.brand.primarySubtle },
    Pending:   { color: theme.warning, bg: theme.status.warningSubtle },
    Uploading: { color: theme.brand.primary, bg: theme.brand.primarySubtle },
  };
}

export function WorkerDocumentsScreen() {
  const navigation  = useNavigation<Nav>();
  const route       = useRoute<Route>();
  const insets      = useSafeAreaInsets();
  const { theme, scheme }  = useTheme();
  const isLight     = scheme !== 'dark';

  const surface       = theme.bg.surface;
  const border        = theme.border.default;
  const textPrimary   = theme.text.primary;
  const textSecondary = theme.text.secondary;
  const bg            = theme.bg.canvas;

  const STATUS_STYLE = getStatusStyle(theme);

  const derivedStatuses = deriveDocStatuses(route.params.applicationId);
  const [docs, setDocs] = useState<DocItem[]>(
    BASE_DOCS.map((d, i) => ({ ...d, id: String(i), status: derivedStatuses[i] ?? 'Pending' }))
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
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: insets.bottom + 32 }}>

        <View style={{ backgroundColor: surface, borderRadius: radii.lg, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
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
                  backgroundColor: isUploading ? (theme.brand.primarySubtle) : (theme.bg.muted),
                  alignItems: 'center', justifyContent: 'center' }}>
                  {isUploading
                    ? <Feather name="upload-cloud" size={19} color={theme.brand.primary} />
                    : <Feather name={doc.icon} size={19} color={textSecondary} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: textPrimary }}>{doc.label}</Text>
                  {doc.filename && isUploading && (
                    <Text style={{ fontSize: 11, color: theme.brand.primary }}>Uploading…</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: st.color }}>{doc.status}</Text>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: st.color,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={isUploading ? 'clock' : 'check'} size={11} color={theme.text.onBrand} />
                  </View>
                </View>
                {!isUploading && <Feather name="chevron-right" size={16} color={textSecondary} />}
              </Pressable>
            );
          })}
        </View>

        <AnimatedPressable onPress={handleUpload} style={{
          backgroundColor: BLUE, borderRadius: radii.lg, paddingVertical: 15,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Feather name="upload" size={18} color={theme.text.onBrand} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text.onBrand }}>Upload New Document</Text>
        </AnimatedPressable>

        <View style={{ backgroundColor: theme.brand.primarySubtle, borderRadius: radii.md, padding: spacing.md,
          flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
          borderWidth: 1, borderColor: theme.brand.primaryBorder }}>
          <Feather name="info" size={14} color={BLUE} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: theme.brand.primary, lineHeight: 17 }}>
            Uploaded documents are reviewed within 24 hours. Status changes to "Verified" once approved.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
