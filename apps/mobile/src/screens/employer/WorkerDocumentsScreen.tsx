/**
 * WorkerDocumentsScreen — every document we actually hold for a hire:
 *   1. Verified by Doondo — ID verification status.
 *   2. Shared by the worker — resume + skill proof files they uploaded.
 *   3. Tracked by you — licences / certificates you track with an expiry
 *      date (crew-documents), with lapse warnings.
 */

import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { spacing } from '@doondo/tokens';
import { Screen, Text, AnimatedPressable, SkeletonCard } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { haptic } from '@/lib/haptics';
import { applicationsApi } from '@/api/applications.api';
import { crewDocumentsApi } from '@/api/crewDocuments.api';
import { openResume } from '@/lib/resume';
import { prettifySkill } from '@/lib/trades';
import type { AppStackParamList } from '@/navigation/types';

type Nav   = NativeStackNavigationProp<AppStackParamList>;
type Route = RouteProp<AppStackParamList, 'WorkerDocuments'>;

const BLUE  = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#F59E0B';
const RED   = '#EF4444';

const EXPIRY_PRESETS = [
  { label: '6 months', months: 6 },
  { label: '1 year',   months: 12 },
  { label: '2 years',  months: 24 },
  { label: '5 years',  months: 60 },
];

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export function WorkerDocumentsScreen() {
  const navigation  = useNavigation<Nav>();
  const route       = useRoute<Route>();
  const insets      = useSafeAreaInsets();
  const { scheme }  = useTheme();
  const isLight     = scheme !== 'dark';
  const queryClient = useQueryClient();

  const surface       = isLight ? '#FFFFFF' : '#0D0D0D';
  const border        = isLight ? '#E5E7EB' : '#1E1E1E';
  const textPrimary   = isLight ? '#111827' : '#F9FAFB';
  const textSecondary = isLight ? '#6B7280' : '#9CA3AF';
  const bg            = isLight ? '#F9FAFB' : '#0C0A0E';

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [months, setMonths] = useState(12);

  const workerQuery = useQuery({
    queryKey: ['applicants', 'detail', route.params.applicationId],
    queryFn: async () => {
      const cached = queryClient.getQueryData<{ applications: Awaited<ReturnType<typeof applicationsApi.listForEmployer>>['applications'] }>(
        ['applicants', 'employer', 'workers-tab'],
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
  const seeker = workerQuery.data?.seeker;

  const docsQuery = useQuery({
    queryKey: ['crew-documents', seeker?.id],
    queryFn: () => crewDocumentsApi.list(seeker!.id).then((r) => r.documents),
    enabled: Boolean(seeker?.id),
  });

  const addMutation = useMutation({
    mutationFn: () => crewDocumentsApi.add({ workerId: seeker!.id, label: label.trim(), expiresAt: addMonths(months) }),
    onSuccess: () => {
      haptic('success');
      setAdding(false);
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: ['crew-documents'] });
    },
    onError: () => Alert.alert('Could not save', 'Please try again.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => crewDocumentsApi.remove(id),
    onSuccess: () => { haptic('success'); void queryClient.invalidateQueries({ queryKey: ['crew-documents'] }); },
    onError: () => Alert.alert('Could not remove', 'Please try again.'),
  });

  const Row = ({ icon, title, subtitle, status, color, onPress, onLongPress }: {
    icon: React.ComponentProps<typeof Feather>['name'];
    title: string; subtitle?: string; status: string; color: string;
    onPress?: () => void; onLongPress?: () => void;
  }) => (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        padding: spacing.md, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: isLight ? '#F3F4F6' : '#1F2937',
        alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={19} color={textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: textPrimary }} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, color: textSecondary }}>{subtitle}</Text> : null}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color }}>{status}</Text>
      {onPress && <Feather name="chevron-right" size={16} color={textSecondary} />}
    </Pressable>
  );

  const Section = ({ title, children, empty }: { title: string; children: React.ReactNode[]; empty: string }) => (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Text>
      <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden' }}>
        {children.length === 0
          ? <Text style={{ padding: spacing.md, fontSize: 13, color: textSecondary }}>{empty}</Text>
          : children.map((c, i) => (
              <View key={i} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: border }}>{c}</View>
            ))}
      </View>
    </View>
  );

  const now = Date.now();
  const tracked = (docsQuery.data ?? []).map((d) => {
    const ms = new Date(d.expiresAt).getTime() - now;
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    const status = days < 0 ? 'Expired' : days <= 30 ? `${days}d left` : 'Valid';
    const color = days < 0 ? RED : days <= 30 ? AMBER : GREEN;
    return (
      <Row key={d.id} icon="file-text" title={d.label}
        subtitle={`Expires ${new Date(d.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · long-press to remove`}
        status={status} color={color}
        onLongPress={() => Alert.alert('Remove document', `Stop tracking "${d.label}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(d.id) },
        ])} />
    );
  });

  const shared: React.ReactNode[] = [];
  if (seeker?.resumeUrl) {
    shared.push(
      <Row key="resume" icon="file" title={seeker.resumeFilename ?? 'Resume'} subtitle="Resume" status="Open" color={BLUE}
        onPress={() => void openResume({ dataUrl: seeker.resumeUrl!, filename: seeker.resumeFilename, mimeType: seeker.resumeMimeType })} />,
    );
  }
  for (const doc of seeker?.skillDocuments ?? []) {
    shared.push(
      <Row key={doc.id} icon={doc.kind === 'photo' ? 'image' : 'file-text'} title={doc.fileName}
        subtitle={`Proof for ${prettifySkill(doc.skill)}`} status="Open" color={BLUE}
        onPress={() => void Linking.openURL(doc.url).catch(() => Alert.alert('Could not open file'))} />,
    );
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
        {workerQuery.isLoading ? (
          <><SkeletonCard lines={2} /><SkeletonCard lines={3} /></>
        ) : (
          <>
            <Section title="Verified by Doondo" empty="">
              {[
                <Row key="id" icon="credit-card" title="Government ID"
                  subtitle={seeker?.isVerified ? 'Checked by Doondo' : 'The worker has not completed ID verification yet'}
                  status={seeker?.isVerified ? 'Verified' : 'Not verified'}
                  color={seeker?.isVerified ? GREEN : AMBER} />,
              ]}
            </Section>

            <Section title="Shared by the worker" empty="Nothing shared yet. Workers can add a resume and skill certificates from their profile.">
              {shared}
            </Section>

            <Section title="Tracked by you" empty="Track licences, police verification or certificates here and Doondo will warn you before they lapse.">
              {tracked}
            </Section>

            {adding ? (
              <View style={{ backgroundColor: surface, borderRadius: 16, borderWidth: 1, borderColor: border, padding: spacing.md, gap: spacing.md }}>
                <TextInput value={label} onChangeText={setLabel} placeholder="e.g. Police verification, Driving licence"
                  placeholderTextColor={textSecondary} maxLength={80}
                  style={{ borderWidth: 1, borderColor: border, borderRadius: 10, padding: 12, fontSize: 15, color: textPrimary }} />
                <Text style={{ fontSize: 12, color: textSecondary }}>Valid for</Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  {EXPIRY_PRESETS.map((p) => (
                    <Pressable key={p.months} onPress={() => setMonths(p.months)}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
                        borderColor: months === p.months ? BLUE : border, backgroundColor: months === p.months ? BLUE + '14' : 'transparent' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: months === p.months ? BLUE : textSecondary }}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <AnimatedPressable onPress={() => setAdding(false)}
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: border }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: textSecondary }}>Cancel</Text>
                  </AnimatedPressable>
                  <AnimatedPressable disabled={!label.trim() || addMutation.isPending} onPress={() => addMutation.mutate()}
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
                      backgroundColor: label.trim() ? BLUE : border }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>
                      {addMutation.isPending ? 'Saving…' : 'Save'}
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            ) : (
              <AnimatedPressable onPress={() => { haptic('selection'); setAdding(true); }} disabled={!seeker?.id}
                style={{ backgroundColor: BLUE, borderRadius: 12, paddingVertical: 15,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Track a document</Text>
              </AnimatedPressable>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
